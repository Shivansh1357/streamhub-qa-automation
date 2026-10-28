import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { env } from '../../config/env';
import { audienceRowSchema, type AudienceRow, type GroupBy } from '../schemas/audience.schema';
import { channelSchema, type Channel } from '../schemas/channel.schema';
import { programmeSchema, type Programme } from '../schemas/programme.schema';
import type { AudienceSummaryQuery } from './AudienceClient';
import type { ChannelListQuery } from './ChannelsClient';
import type { ProgrammeListQuery } from './ProgrammesClient';

/**
 * Test oracle over the committed data files. Expected totals, orderings, page boundaries and
 * aggregates are computed here, from the JSON on disk, so an assertion never compares the API
 * with itself. The rules implemented are the ones the public contract (api/README.md) promises -
 * nothing is imported from api/src.
 */
const DATA_DIR = path.join(env.rootDir, 'api', 'data');

function loadArray<T>(fileName: string, itemSchema: z.ZodType<T>): readonly T[] {
  const file = path.join(DATA_DIR, fileName);
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${fileName} should contain a JSON array`);
  return parsed.map((item, index) => {
    const result = itemSchema.safeParse(item);
    if (!result.success) {
      throw new Error(`${fileName}[${index}] is not a valid fixture: ${result.error.message}`);
    }
    return result.data;
  });
}

// Loaded lazily and once: the files are small and immutable for the duration of a run.
let channelsCache: readonly Channel[] | undefined;
let programmesCache: readonly Programme[] | undefined;
let audienceCache: readonly AudienceRow[] | undefined;

export function channels(): readonly Channel[] {
  return (channelsCache ??= loadArray('channels.json', channelSchema));
}

export function programmes(): readonly Programme[] {
  return (programmesCache ??= loadArray('programmes.json', programmeSchema));
}

export function audienceRows(): readonly AudienceRow[] {
  return (audienceCache ??= loadArray('audience.json', audienceRowSchema));
}

export function channelById(id: string): Channel {
  const channel = channels().find((item) => item.id === id);
  if (!channel) throw new Error(`channels.json has no channel ${id}`);
  return channel;
}

export function programmeById(id: string): Programme {
  const programme = programmes().find((item) => item.id === id);
  if (!programme) throw new Error(`programmes.json has no programme ${id}`);
  return programme;
}

// ---------------------------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc';

/** Fields of T that hold a string or number, i.e. the ones the API can sort by. */
export type SortableField<T> = { [K in keyof T]: T[K] extends string | number ? K : never }[keyof T] & string;

export interface SortSpec<T> {
  field: SortableField<T>;
  direction: SortDirection;
}

/** `rating` + `desc` -> `-rating`, the token the API expects. */
export function sortToken(field: string, direction: SortDirection): string {
  return direction === 'desc' ? `-${field}` : field;
}

export function parseSortToken<T>(token: string): SortSpec<T> {
  return token.startsWith('-')
    ? { field: token.slice(1) as SortableField<T>, direction: 'desc' }
    : { field: token as SortableField<T>, direction: 'asc' };
}

/**
 * The contract orders strings by UTF-16 code unit (not locale-aware) and numbers numerically.
 * Mirroring that rule here is what makes "Canal Lumière" sort the same on every machine.
 */
export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function valueOf<T>(item: T, field: SortableField<T>): string | number {
  return item[field] as string | number;
}

/** Sorted copy with the documented tie-break: equal keys fall back to id ascending in both directions. */
export function sortWithIdTieBreak<T extends { id: string }>(items: readonly T[], spec: SortSpec<T>): T[] {
  const sign = spec.direction === 'desc' ? -1 : 1;
  return [...items].sort(
    (a, b) =>
      sign * compareValues(valueOf(a, spec.field), valueOf(b, spec.field)) || compareValues(a.id, b.id),
  );
}

/** Index of the first adjacent pair that breaks the order, or -1 when the list is sorted. */
export function findSortViolation<T extends { id: string }>(items: readonly T[], spec: SortSpec<T>): number {
  const sign = spec.direction === 'desc' ? -1 : 1;
  for (let i = 1; i < items.length; i += 1) {
    const byField = sign * compareValues(valueOf(items[i - 1], spec.field), valueOf(items[i], spec.field));
    if (byField > 0) return i;
    if (byField === 0 && compareValues(items[i - 1].id, items[i].id) > 0) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------------------------

export function expectedChannelList(query: ChannelListQuery): Channel[] {
  const matches = channels().filter(
    (channel) =>
      (query.country === undefined || channel.country === query.country) &&
      (query.type === undefined || channel.type === query.type),
  );
  return sortWithIdTieBreak(matches, parseSortToken<Channel>(query.sort ?? 'name'));
}

// ---------------------------------------------------------------------------------------------
// Programmes
// ---------------------------------------------------------------------------------------------

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const DEFAULT_PROGRAMME_SORT = 'title';

export interface ExpectedProgrammePage {
  data: Programme[];
  meta: { page: number; limit: number; total: number; totalPages: number; sort: string };
}

export function totalPagesFor(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/** Filter, then sort, then page - the order the contract specifies. */
export function expectedProgrammePage(query: ProgrammeListQuery): ExpectedProgrammePage {
  const needle = query.q?.trim().toLowerCase();
  const matches = programmes().filter(
    (programme) =>
      (query.channelId === undefined || programme.channelId === query.channelId) &&
      (query.genre === undefined || programme.genre === query.genre) &&
      (query.minRating === undefined || programme.rating >= query.minRating) &&
      (needle === undefined || programme.title.toLowerCase().includes(needle)),
  );
  const sort = query.sort ?? DEFAULT_PROGRAMME_SORT;
  const sorted = sortWithIdTieBreak(matches, parseSortToken<Programme>(sort));
  const page = query.page ?? DEFAULT_PAGE;
  const limit = query.limit ?? DEFAULT_LIMIT;
  const start = (page - 1) * limit;
  return {
    data: sorted.slice(start, start + limit),
    meta: { page, limit, total: sorted.length, totalPages: totalPagesFor(sorted.length, limit), sort },
  };
}

// ---------------------------------------------------------------------------------------------
// Audience summary
// ---------------------------------------------------------------------------------------------

export interface ExpectedSummaryRow {
  key: string;
  label: string;
  totalViewers: number;
  /** Unrounded arithmetic means; the assertion allows for the API's documented rounding. */
  meanWatchTimeMinutes: number;
  meanCompletionRate: number;
  programmes: number;
}

export interface ExpectedSummary {
  rows: ExpectedSummaryRow[];
  /** Number of daily rows that fell inside the filter - what meta.rows must report. */
  matchedRows: number;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function groupingOf(
  groupBy: GroupBy,
  row: AudienceRow,
  programme: Programme,
): { key: string; label: string } {
  switch (groupBy) {
    case 'channel':
      return { key: programme.channelId, label: channelById(programme.channelId).name };
    case 'genre':
      return { key: programme.genre, label: titleCase(programme.genre) };
    case 'date':
      return { key: row.date, label: row.date };
  }
}

/** Inclusive date range, optional channel filter, rows sorted by key ascending (code-unit order). */
export function expectedAudienceSummary(query: AudienceSummaryQuery): ExpectedSummary {
  const groupBy = query.groupBy ?? 'channel';
  const programmesById = new Map(programmes().map((programme) => [programme.id, programme]));
  const buckets = new Map<
    string,
    { label: string; viewers: number; watch: number; completion: number; count: number; ids: Set<string> }
  >();
  let matchedRows = 0;
  for (const row of audienceRows()) {
    if (row.date < query.from || row.date > query.to) continue;
    const programme = programmesById.get(row.programmeId);
    if (!programme) throw new Error(`audience.json references unknown programme ${row.programmeId}`);
    if (query.channelId !== undefined && programme.channelId !== query.channelId) continue;
    const { key, label } = groupingOf(groupBy, row, programme);
    const bucket = buckets.get(key) ?? {
      label,
      viewers: 0,
      watch: 0,
      completion: 0,
      count: 0,
      ids: new Set(),
    };
    bucket.viewers += row.viewers;
    bucket.watch += row.avgWatchTimeMinutes;
    bucket.completion += row.completionRate;
    bucket.count += 1;
    bucket.ids.add(row.programmeId);
    buckets.set(key, bucket);
    matchedRows += 1;
  }
  const rows = [...buckets.entries()]
    .sort(([a], [b]) => compareValues(a, b))
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      totalViewers: bucket.viewers,
      meanWatchTimeMinutes: bucket.watch / bucket.count,
      meanCompletionRate: bucket.completion / bucket.count,
      programmes: bucket.ids.size,
    }));
  return { rows, matchedRows };
}
