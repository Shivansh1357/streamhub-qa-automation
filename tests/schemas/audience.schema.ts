import { z } from 'zod';
import { channelId, isoDate, programmeId } from './common';

export const GROUP_BY_OPTIONS = ['channel', 'genre', 'date'] as const;

/** One raw line of api/data/audience.json; used by the fixture loader, never returned by the API. */
export const audienceRowSchema = z
  .object({
    programmeId,
    date: isoDate,
    viewers: z.number().int().nonnegative(),
    avgWatchTimeMinutes: z.number().nonnegative(),
    completionRate: z.number().min(0).max(1),
  })
  .strict();

export const audienceSummaryRowSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    totalViewers: z.number().int().nonnegative(),
    avgWatchTimeMinutes: z.number().nonnegative(),
    avgCompletionRate: z.number().min(0).max(1),
    programmes: z.number().int().positive(),
  })
  .strict();

export const audienceSummarySchema = z
  .object({
    data: z.array(audienceSummaryRowSchema),
    meta: z
      .object({
        from: isoDate,
        to: isoDate,
        groupBy: z.enum(GROUP_BY_OPTIONS),
        channelId: channelId.optional(),
        rows: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type AudienceRow = z.infer<typeof audienceRowSchema>;
export type AudienceSummaryRow = z.infer<typeof audienceSummaryRowSchema>;
export type AudienceSummary = z.infer<typeof audienceSummarySchema>;
export type GroupBy = (typeof GROUP_BY_OPTIONS)[number];
