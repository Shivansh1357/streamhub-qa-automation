import type { GroupBy } from '../schemas/audience.schema';
import type { RecordedResponse } from '../support/world';
import { BaseApiClient } from './BaseApiClient';
import type { QueryInput } from './query-string';

/** The documented query vocabulary of GET /api/v1/audience/summary (type alias: see ChannelListQuery). */
export type AudienceSummaryQuery = {
  from: string;
  to: string;
  channelId?: string;
  groupBy?: GroupBy;
};

const SUMMARY_PATH = '/api/v1/audience/summary';

export class AudienceClient extends BaseApiClient {
  summary(query: AudienceSummaryQuery): Promise<RecordedResponse> {
    return this.get(SUMMARY_PATH, query);
  }

  /** Untyped variant for negative tests: missing dates, impossible calendar days, unknown keys. */
  summaryWith(query: QueryInput): Promise<RecordedResponse> {
    return this.get(SUMMARY_PATH, query);
  }
}
