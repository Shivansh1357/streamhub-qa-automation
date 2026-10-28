import { z } from 'zod';

/**
 * Building blocks shared by the response schemas. These are deliberately written from the
 * published contract (api/README.md, api/openapi.yaml) rather than imported from api/src, so the
 * tests keep an independent view of what a valid response looks like.
 */
export const CHANNEL_ID_PATTERN = /^ch_\d{3}$/;
export const PROGRAMME_ID_PATTERN = /^prg_\d{3}$/;
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CHANNEL_TYPES = ['linear', 'vod'] as const;
export const GENRES = ['drama', 'news', 'sport', 'documentary', 'comedy', 'kids', 'reality'] as const;

/** A real calendar day: the format check alone would accept 2026-02-30. */
export function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const isoDate = z.string().refine(isRealIsoDate, { error: 'must be a real YYYY-MM-DD date' });
export const channelId = z.string().regex(CHANNEL_ID_PATTERN);
export const programmeId = z.string().regex(PROGRAMME_ID_PATTERN);

/**
 * Validates a response body against a schema and fails with every issue listed, so a contract
 * drift shows up as "data.3.rating: expected number" rather than a bare "schema mismatch".
 */
export function assertMatchesSchema<T>(schema: z.ZodType<T>, body: unknown, label = 'response'): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((issue) => `  - ${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`${label} does not match the expected schema:\n${issues}\n\nBody: ${JSON.stringify(body)}`);
}
