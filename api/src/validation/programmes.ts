import { z } from 'zod';
import { GENRES } from '../types';
import { enumParam, integerParam, numberParam, patternParam, sortParam } from './params';
import { CHANNEL_ID } from './patterns';

export const PROGRAMME_SORT_FIELDS = ['title', 'firstAiredAt', 'rating'] as const;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

export const programmeListQuerySchema = z
  .object({
    channelId: patternParam(CHANNEL_ID, 'a channel id such as ch_001').optional(),
    genre: enumParam(GENRES).optional(),
    q: z
      .string()
      .trim()
      .min(2, { error: 'must be at least 2 characters' })
      .max(50, { error: 'must be at most 50 characters' })
      .optional(),
    minRating: numberParam(0, 10).optional(),
    sort: sortParam(PROGRAMME_SORT_FIELDS).default('title'),
    page: integerParam(1, Number.MAX_SAFE_INTEGER).default(1),
    limit: integerParam(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

export type ProgrammeListQuery = z.output<typeof programmeListQuerySchema>;
