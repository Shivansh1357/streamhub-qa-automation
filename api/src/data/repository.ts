import type { AudienceRow, Channel, Programme } from '../types';
import type { Dataset } from './dataset';

/**
 * The only way the rest of the API reaches the data. Everything is read-only and in memory, but the
 * interface is deliberately the one a database-backed implementation would also satisfy.
 */
export interface Repository {
  readonly channels: readonly Channel[];
  readonly programmes: readonly Programme[];
  readonly audience: readonly AudienceRow[];
  findChannel(id: string): Channel | undefined;
  findProgramme(id: string): Programme | undefined;
  /** The channel a programme belongs to. Integrity is checked at load time, so this cannot miss. */
  channelOf(programme: Programme): Channel;
}

export function createRepository(dataset: Dataset): Repository {
  const channelsById = new Map(dataset.channels.map((channel) => [channel.id, channel]));
  const programmesById = new Map(dataset.programmes.map((programme) => [programme.id, programme]));

  return {
    channels: dataset.channels,
    programmes: dataset.programmes,
    audience: dataset.audience,
    findChannel: (id) => channelsById.get(id),
    findProgramme: (id) => programmesById.get(id),
    channelOf: (programme) => {
      const channel = channelsById.get(programme.channelId);
      if (!channel) throw new Error(`Dataset invariant violated: ${programme.id} has no channel`);
      return channel;
    },
  };
}
