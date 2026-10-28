import type { DataTable } from '@cucumber/cucumber';
import type { z } from 'zod';
import { AudienceClient } from '../../api-clients/AudienceClient';
import { BaseApiClient } from '../../api-clients/BaseApiClient';
import { ChannelsClient } from '../../api-clients/ChannelsClient';
import { HealthClient } from '../../api-clients/HealthClient';
import { ProgrammesClient } from '../../api-clients/ProgrammesClient';
import type { SortDirection } from '../../api-clients/fixtures';
import { queryFromRows, type QueryInput } from '../../api-clients/query-string';
import { assertMatchesSchema, type ErrorEnvelope, errorEnvelopeSchema } from '../../schemas';
import type { CustomWorld, RecordedResponse } from '../../support/world';

/**
 * Glue shared by the API step files: client construction, the scratch keys under which a "When"
 * step remembers its query for a later oracle-based "Then", and typed access to the last response.
 * Not a step definition file - cucumber loads it because it lives under tests/steps, which is harmless.
 */
export const Remembered = {
  channelQuery: 'api.channels.query',
  programmeQuery: 'api.programmes.query',
  audienceQuery: 'api.audience.query',
  collectedPages: 'api.programmes.collectedPages',
} as const;

/** Clients are stateless wrappers over the per-scenario request context, so building them per step is free. */
export function clients(world: CustomWorld) {
  const api = world.getApi();
  return {
    raw: new BaseApiClient(api),
    health: new HealthClient(api),
    channels: new ChannelsClient(api),
    programmes: new ProgrammesClient(api),
    audience: new AudienceClient(api),
  };
}

export function lastResponse(world: CustomWorld): RecordedResponse {
  return world.getLastResponse();
}

/** The last response body, validated as the given shape so later assertions are fully typed. */
export function lastBodyAs<T>(world: CustomWorld, schema: z.ZodType<T>): T {
  return assertMatchesSchema(schema, lastResponse(world).body, 'Last response');
}

export function lastError(world: CustomWorld): ErrorEnvelope['error'] {
  return lastBodyAs(world, errorEnvelopeSchema).error;
}

/** Two-column Gherkin table (`| limit | 0 |`) -> query input, exactly as typed. */
export function queryFromTable(table: DataTable): QueryInput {
  return queryFromRows(table.raw());
}

/** `"prg_006, prg_017, prg_040"` -> `['prg_006', 'prg_017', 'prg_040']`. */
export function idList(text: string): string[] {
  return text
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** Gherkin reads "ascending" / "descending"; the oracle and the API speak `asc` / `-field`. */
export function asSortDirection(word: string): SortDirection {
  if (word === 'ascending') return 'asc';
  if (word === 'descending') return 'desc';
  throw new Error(`Sort direction must be "ascending" or "descending", got "${word}"`);
}

/** Narrows loosely typed table input to the string-only parameters a typed query expects. */
export function stringParams<K extends string>(
  input: QueryInput,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const picked: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'string')
      throw new Error(`Parameter "${key}" must be a single string to be checked against the dataset`);
    picked[key] = value;
  }
  return picked;
}

export function describeResponse(response: RecordedResponse): string {
  return `${response.method} ${response.url} -> ${response.status} ${response.statusText}\n${response.text.slice(0, 500)}`;
}
