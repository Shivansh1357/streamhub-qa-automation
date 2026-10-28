import type { RecordedResponse } from '../support/world';
import { BaseApiClient, type RequestOptions } from './BaseApiClient';
import type { QueryInput } from './query-string';

const HEALTH_PATH = '/health';

export class HealthClient extends BaseApiClient {
  check(options: RequestOptions & { query?: QueryInput } = {}): Promise<RecordedResponse> {
    return this.get(HEALTH_PATH, options.query, options);
  }
}
