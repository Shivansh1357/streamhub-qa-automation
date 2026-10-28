/**
 * Domain vocabulary of the Audience Analytics API. The dataset schemas (data/schemas.ts) are
 * checked against these interfaces at compile time, so the JSON files, the service layer and the
 * OpenAPI document cannot silently drift apart.
 */
export const CHANNEL_TYPES = ['linear', 'vod'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const GENRES = ['drama', 'news', 'sport', 'documentary', 'comedy', 'kids', 'reality'] as const;
export type Genre = (typeof GENRES)[number];

export interface Channel {
  id: string;
  name: string;
  /** ISO-3166 alpha-2, uppercase. */
  country: string;
  type: ChannelType;
  /** YYYY-MM-DD */
  launchedAt: string;
}

export interface Programme {
  id: string;
  channelId: string;
  title: string;
  genre: Genre;
  durationMinutes: number;
  /** YYYY-MM-DD */
  firstAiredAt: string;
  /** 0..10, one decimal place. */
  rating: number;
}

/** One day of audience measurement for one programme. */
export interface AudienceRow {
  programmeId: string;
  /** YYYY-MM-DD */
  date: string;
  viewers: number;
  avgWatchTimeMinutes: number;
  /** 0..1 */
  completionRate: number;
}

export interface ProgrammeDetail extends Programme {
  channel: Pick<Channel, 'id' | 'name'>;
}
