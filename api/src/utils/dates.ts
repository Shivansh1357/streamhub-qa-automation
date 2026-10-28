import { ISO_DATE } from '../validation/patterns';

const MS_PER_DAY = 86_400_000;

/**
 * Parses a YYYY-MM-DD string into a UTC date, returning undefined for anything that is not a real
 * calendar day. `new Date('2026-02-30')` would silently roll over to 2 March, so the components are
 * checked after construction instead.
 */
export function parseIsoDate(value: string): Date | undefined {
  if (!ISO_DATE.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return roundTrips ? date : undefined;
}

export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== undefined;
}

/** Whole days from `from` to `to` (0 when they are the same day, negative when `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}
