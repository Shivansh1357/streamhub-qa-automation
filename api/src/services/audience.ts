import type { Repository } from '../data/repository';
import type { AudienceRow, Genre } from '../types';
import type { AudienceSummaryQuery, GroupBy } from '../validation/audience';
import { compareValues } from './sorting';

export interface AudienceSummaryRow {
  key: string;
  label: string;
  totalViewers: number;
  /** Arithmetic mean over the matched daily rows, 1 decimal place. */
  avgWatchTimeMinutes: number;
  /** Arithmetic mean over the matched daily rows, 3 decimal places. */
  avgCompletionRate: number;
  /** Distinct programmes contributing to the group. */
  programmes: number;
}

export interface AudienceSummary {
  data: AudienceSummaryRow[];
  meta: {
    from: string;
    to: string;
    groupBy: GroupBy;
    channelId?: string;
    /** Number of daily audience rows that matched the filter and were aggregated. */
    rows: number;
  };
}

interface Bucket {
  key: string;
  label: string;
  viewers: number;
  watchTime: number;
  completion: number;
  rows: number;
  programmeIds: Set<string>;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function titleCase(genre: Genre): string {
  return genre.charAt(0).toUpperCase() + genre.slice(1);
}

export class AudienceService {
  constructor(private readonly repository: Repository) {}

  summary(query: AudienceSummaryQuery): AudienceSummary {
    const buckets = new Map<string, Bucket>();
    let matched = 0;

    for (const row of this.repository.audience) {
      // ISO dates compare correctly as strings, which keeps the hot loop free of Date allocations.
      if (row.date < query.from || row.date > query.to) continue;
      const programme = this.repository.findProgramme(row.programmeId);
      if (!programme) continue;
      if (query.channelId !== undefined && programme.channelId !== query.channelId) continue;

      const { key, label } = this.groupingOf(query.groupBy, row, programme.genre, programme.channelId);
      const bucket = buckets.get(key) ?? {
        key,
        label,
        viewers: 0,
        watchTime: 0,
        completion: 0,
        rows: 0,
        programmeIds: new Set<string>(),
      };
      bucket.viewers += row.viewers;
      bucket.watchTime += row.avgWatchTimeMinutes;
      bucket.completion += row.completionRate;
      bucket.rows += 1;
      bucket.programmeIds.add(row.programmeId);
      buckets.set(key, bucket);
      matched += 1;
    }

    const data = [...buckets.values()]
      .sort((a, b) => compareValues(a.key, b.key))
      .map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        totalViewers: bucket.viewers,
        avgWatchTimeMinutes: round(bucket.watchTime / bucket.rows, 1),
        avgCompletionRate: round(bucket.completion / bucket.rows, 3),
        programmes: bucket.programmeIds.size,
      }));

    return {
      data,
      meta: {
        from: query.from,
        to: query.to,
        groupBy: query.groupBy,
        ...(query.channelId !== undefined ? { channelId: query.channelId } : {}),
        rows: matched,
      },
    };
  }

  private groupingOf(
    groupBy: GroupBy,
    row: AudienceRow,
    genre: Genre,
    channelId: string,
  ): Pick<Bucket, 'key' | 'label'> {
    switch (groupBy) {
      case 'channel': {
        const channel = this.repository.findChannel(channelId);
        return { key: channelId, label: channel?.name ?? channelId };
      }
      case 'genre':
        return { key: genre, label: titleCase(genre) };
      case 'date':
        return { key: row.date, label: row.date };
    }
  }
}
