import { z } from 'zod';
import { daysBetween, parseIsoDate } from '../utils/dates';
import { dateParam, enumParam, patternParam } from './params';
import { CHANNEL_ID } from './patterns';

export const GROUP_BY = ['channel', 'genre', 'date'] as const;
export type GroupBy = (typeof GROUP_BY)[number];

/** Inclusive upper bound on the range so a single call cannot aggregate more than a year. */
export const MAX_RANGE_DAYS = 366;

export const audienceSummaryQuerySchema = z
  .object({
    from: dateParam(),
    to: dateParam(),
    channelId: patternParam(CHANNEL_ID, 'a channel id such as ch_001').optional(),
    groupBy: enumParam(GROUP_BY).default('channel'),
  })
  .strict()
  .superRefine((query, ctx) => {
    // zod 4 runs refinements even when a field already failed; cross-field rules only make
    // sense once both dates are individually valid, otherwise they would duplicate the report.
    const from = parseIsoDate(query.from);
    const to = parseIsoDate(query.to);
    if (!from || !to) return;
    const span = daysBetween(from, to);
    if (span < 0) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'must be on or before "to"' });
    } else if (span > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `range must span at most ${MAX_RANGE_DAYS} days`,
      });
    }
  });

export type AudienceSummaryQuery = z.output<typeof audienceSummaryQuerySchema>;
