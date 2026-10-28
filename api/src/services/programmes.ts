import type { Repository } from '../data/repository';
import { ApiError } from '../errors';
import type { Programme, ProgrammeDetail } from '../types';
import type { ProgrammeListQuery } from '../validation/programmes';
import { paginate, type PageMeta } from './pagination';
import { parseSort, sortById } from './sorting';

export interface ProgrammeList {
  data: Programme[];
  meta: PageMeta & { sort: string };
}

export class ProgrammeService {
  constructor(private readonly repository: Repository) {}

  list(query: ProgrammeListQuery): ProgrammeList {
    const needle = query.q?.toLowerCase();
    const matches = this.repository.programmes.filter(
      (programme) =>
        (query.channelId === undefined || programme.channelId === query.channelId) &&
        (query.genre === undefined || programme.genre === query.genre) &&
        (query.minRating === undefined || programme.rating >= query.minRating) &&
        (needle === undefined || programme.title.toLowerCase().includes(needle)),
    );
    const sorted = sortById(matches, parseSort(query.sort), (programme, field) => programme[field]);
    const page = paginate(sorted, query.page, query.limit);
    return { data: page.data, meta: { ...page.meta, sort: query.sort } };
  }

  get(id: string): ProgrammeDetail {
    const programme = this.repository.findProgramme(id);
    if (!programme) throw ApiError.notFound(`Programme ${id} not found`);
    const channel = this.repository.channelOf(programme);
    return { ...programme, channel: { id: channel.id, name: channel.name } };
  }
}
