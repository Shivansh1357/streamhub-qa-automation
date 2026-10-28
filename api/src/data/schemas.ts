import { z } from 'zod';
import type { AudienceRow, Channel, Programme } from '../types';
import { CHANNEL_TYPES, GENRES } from '../types';
import { isValidIsoDate } from '../utils/dates';
import { CHANNEL_ID, COUNTRY_CODE, PROGRAMME_ID } from '../validation/patterns';

/**
 * Schemas for the JSON files on disk. They are validated once at startup so that a typo in the
 * dataset fails fast with a precise message instead of surfacing as a confusing 500 (or, worse, a
 * subtly wrong aggregate) at request time.
 */
const isoDate = z
  .string()
  .refine(isValidIsoDate, { error: 'must be a real calendar date in YYYY-MM-DD format' });

const oneDecimalPlace = (value: number): boolean => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

export const channelSchema = z
  .object({
    id: z.string().regex(CHANNEL_ID),
    name: z.string().min(1),
    country: z.string().regex(COUNTRY_CODE),
    type: z.enum(CHANNEL_TYPES),
    launchedAt: isoDate,
  })
  .strict() satisfies z.ZodType<Channel>;

export const programmeSchema = z
  .object({
    id: z.string().regex(PROGRAMME_ID),
    channelId: z.string().regex(CHANNEL_ID),
    title: z.string().min(1),
    genre: z.enum(GENRES),
    durationMinutes: z.number().int().positive(),
    firstAiredAt: isoDate,
    rating: z
      .number()
      .min(0)
      .max(10)
      .refine(oneDecimalPlace, { error: 'must have at most one decimal place' }),
  })
  .strict() satisfies z.ZodType<Programme>;

export const audienceRowSchema = z
  .object({
    programmeId: z.string().regex(PROGRAMME_ID),
    date: isoDate,
    viewers: z.number().int().nonnegative(),
    avgWatchTimeMinutes: z.number().nonnegative(),
    completionRate: z.number().min(0).max(1),
  })
  .strict() satisfies z.ZodType<AudienceRow>;

export const channelsFileSchema = z.array(channelSchema);
export const programmesFileSchema = z.array(programmeSchema);
export const audienceFileSchema = z.array(audienceRowSchema);
