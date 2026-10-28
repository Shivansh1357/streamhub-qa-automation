import type { Genre, ProgrammeSort } from '../schemas/programme.schema';
import type { RecordedResponse } from '../support/world';
import { BaseApiClient } from './BaseApiClient';
import type { QueryInput } from './query-string';

/** The documented query vocabulary of GET /api/v1/programmes (type alias: see ChannelListQuery). */
export type ProgrammeListQuery = {
  channelId?: string;
  genre?: Genre;
  q?: string;
  minRating?: number;
  sort?: ProgrammeSort;
  page?: number;
  limit?: number;
};

const PROGRAMMES_PATH = '/api/v1/programmes';

export class ProgrammesClient extends BaseApiClient {
  list(query: ProgrammeListQuery = {}): Promise<RecordedResponse> {
    return this.get(PROGRAMMES_PATH, query);
  }

  /** Untyped variant for negative tests: unknown parameters, wrong types, repeated keys. */
  listWith(query: QueryInput): Promise<RecordedResponse> {
    return this.get(PROGRAMMES_PATH, query);
  }

  /** `query` exists only so a scenario can prove the endpoint rejects parameters it does not take. */
  getById(id: string, query?: QueryInput): Promise<RecordedResponse> {
    return this.get(`${PROGRAMMES_PATH}/${encodeURIComponent(id)}`, query);
  }
}
