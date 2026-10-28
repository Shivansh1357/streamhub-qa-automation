import { IWorldOptions, World, setWorldConstructor } from '@cucumber/cucumber';
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import type { Pool } from 'pg';

/** A recorded HTTP exchange, kept on the World so later steps can assert on it. */
export interface RecordedResponse {
  method: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Parsed JSON body, or `undefined` when the body is not JSON. */
  body: unknown;
  text: string;
  durationMs: number;
}

/**
 * Shared per-scenario state. Browser/API/DB handles are only populated for scenarios
 * tagged @ui / @api / @sql respectively (see hooks.ts), so the getters fail loudly when a
 * step is used in a scenario that is missing the tag.
 */
export class CustomWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  api?: APIRequestContext;
  db?: Pool;
  lastResponse?: RecordedResponse;
  scenarioName = '';
  private readonly scratch = new Map<string, unknown>();

  constructor(options: IWorldOptions) {
    super(options);
  }

  get profile(): string {
    const params = this.parameters as { profile?: string } | undefined;
    return params?.profile ?? 'default';
  }

  getPage(): Page {
    if (!this.page) throw new Error('No browser page available - tag the scenario with @ui');
    return this.page;
  }

  getApi(): APIRequestContext {
    if (!this.api) throw new Error('No API request context available - tag the scenario with @api');
    return this.api;
  }

  getDb(): Pool {
    if (!this.db) throw new Error('No database pool available - tag the scenario with @sql');
    return this.db;
  }

  getLastResponse(): RecordedResponse {
    if (!this.lastResponse) throw new Error('No HTTP response recorded yet - send a request first');
    return this.lastResponse;
  }

  /** Store a value computed in one step (e.g. an independently calculated EMI) for a later step. */
  remember<T>(key: string, value: T): T {
    this.scratch.set(key, value);
    return value;
  }

  recall<T>(key: string): T {
    if (!this.scratch.has(key)) throw new Error(`Nothing remembered under "${key}"`);
    return this.scratch.get(key) as T;
  }

  recallOptional<T>(key: string): T | undefined {
    return this.scratch.get(key) as T | undefined;
  }
}

setWorldConstructor(CustomWorld);
