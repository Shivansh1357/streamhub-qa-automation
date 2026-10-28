import { z } from 'zod';
import { channelId, GENRES, isoDate, programmeId } from './common';

export const PROGRAMME_SORT_OPTIONS = [
  'title',
  '-title',
  'firstAiredAt',
  '-firstAiredAt',
  'rating',
  '-rating',
] as const;

export const programmeSchema = z
  .object({
    id: programmeId,
    channelId,
    title: z.string().min(1),
    genre: z.enum(GENRES),
    durationMinutes: z.number().int().positive(),
    firstAiredAt: isoDate,
    rating: z.number().min(0).max(10),
  })
  .strict();

/** The single-programme view embeds a trimmed-down channel. */
export const programmeDetailSchema = programmeSchema
  .extend({
    channel: z.object({ id: channelId, name: z.string().min(1) }).strict(),
  })
  .strict();

export const programmeListSchema = z
  .object({
    data: z.array(programmeSchema),
    meta: z
      .object({
        page: z.number().int().min(1),
        limit: z.number().int().min(1).max(50),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
        sort: z.enum(PROGRAMME_SORT_OPTIONS),
      })
      .strict(),
  })
  .strict();

export type Programme = z.infer<typeof programmeSchema>;
export type ProgrammeDetail = z.infer<typeof programmeDetailSchema>;
export type ProgrammeList = z.infer<typeof programmeListSchema>;
export type Genre = Programme['genre'];
export type ProgrammeSort = (typeof PROGRAMME_SORT_OPTIONS)[number];
