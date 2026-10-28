import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { RecordedResponse } from '../support/world';
import { buildQueryString, type QueryInput } from './query-string';

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface RequestOptions {
  /** Extra request headers, e.g. a deliberately chosen X-Request-Id. */
  headers?: Readonly<Record<string, string>>;
}

/**
 * The one place that talks HTTP. Resource clients extend it and expose typed methods; steps only
 * ever see a RecordedResponse. The request context is injected by the World (created per scenario
 * in hooks.ts with the base URL from config), so no client knows where the server lives.
 */
export class BaseApiClient {
  constructor(private readonly api: APIRequestContext) {}

  /** Any method, any path: the hook for 405 / unknown-route checks. */
  async request(
    method: HttpMethod,
    path: string,
    query?: QueryInput,
    options: RequestOptions = {},
  ): Promise<RecordedResponse> {
    const url = `${path}${buildQueryString(query)}`;
    const startedAt = performance.now();
    const response = await this.api.fetch(url, {
      method,
      headers: { ...options.headers },
      // Redirects are never part of this API's contract; following one silently would hide it.
      maxRedirects: 0,
    });
    return this.record(method, response, performance.now() - startedAt);
  }

  /**
   * Sends the path exactly as given, query string included. Reserved for edge cases where the
   * builder's encoding would get in the way (undecodable escapes, absurdly long paths).
   */
  rawGet(pathWithQuery: string, options: RequestOptions = {}): Promise<RecordedResponse> {
    return this.request('GET', pathWithQuery, undefined, options);
  }

  protected get(path: string, query?: QueryInput, options?: RequestOptions): Promise<RecordedResponse> {
    return this.request('GET', path, query, options);
  }

  private async record(
    method: HttpMethod,
    response: APIResponse,
    durationMs: number,
  ): Promise<RecordedResponse> {
    const headers = response.headers();
    const text = await response.text();
    return {
      method,
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      headers,
      body: parseJsonBody(headers['content-type'], text),
      text,
      durationMs,
    };
  }
}

/**
 * Parses the body only when the server says it is JSON; everything else is left as text so a
 * step can still assert on it. A JSON content type with an unparsable body is a server defect
 * and is surfaced immediately rather than as a confusing "undefined" further down the scenario.
 */
function parseJsonBody(contentType: string | undefined, text: string): unknown {
  if (!contentType?.toLowerCase().includes('application/json') || text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Response declared ${contentType} but the body is not valid JSON: ${text.slice(0, 200)}`,
      {
        cause: error,
      },
    );
  }
}
