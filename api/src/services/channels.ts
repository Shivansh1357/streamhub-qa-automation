import type { Repository } from '../data/repository';
import { ApiError } from '../errors';
import type { Channel } from '../types';
import type { ChannelListQuery } from '../validation/channels';
import { parseSort, sortById } from './sorting';

export interface ChannelList {
  data: Channel[];
  meta: { total: number };
}

export class ChannelService {
  constructor(private readonly repository: Repository) {}

  list(query: ChannelListQuery): ChannelList {
    const matches = this.repository.channels.filter(
      (channel) =>
        (query.country === undefined || channel.country === query.country) &&
        (query.type === undefined || channel.type === query.type),
    );
    const data = sortById(matches, parseSort(query.sort), (channel, field) => channel[field]);
    return { data, meta: { total: data.length } };
  }

  get(id: string): Channel {
    const channel = this.repository.findChannel(id);
    if (!channel) throw ApiError.notFound(`Channel ${id} not found`);
    return channel;
  }
}
