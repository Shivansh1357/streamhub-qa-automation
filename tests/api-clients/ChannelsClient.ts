import type { ChannelType } from '../schemas/channel.schema';
import type { RecordedResponse } from '../support/world';
import { BaseApiClient } from './BaseApiClient';
import type { QueryInput } from './query-string';

export const CHANNEL_SORT_OPTIONS = ['name', '-name', 'launchedAt', '-launchedAt'] as const;
export type ChannelSort = (typeof CHANNEL_SORT_OPTIONS)[number];

/**
 * The documented query vocabulary of GET /api/v1/channels. A type alias rather than an interface
 * so it is assignable to QueryInput without a cast (interfaces have no implicit index signature).
 */
export type ChannelListQuery = {
  country?: string;
  type?: ChannelType;
  sort?: ChannelSort;
};

const CHANNELS_PATH = '/api/v1/channels';

export class ChannelsClient extends BaseApiClient {
  list(query: ChannelListQuery = {}): Promise<RecordedResponse> {
    return this.get(CHANNELS_PATH, query);
  }

  /** Untyped variant for negative tests: unknown parameters, wrong types, repeated keys. */
  listWith(query: QueryInput): Promise<RecordedResponse> {
    return this.get(CHANNELS_PATH, query);
  }

  /** `query` exists only so a scenario can prove the endpoint rejects parameters it does not take. */
  getById(id: string, query?: QueryInput): Promise<RecordedResponse> {
    return this.get(`${CHANNELS_PATH}/${encodeURIComponent(id)}`, query);
  }
}
