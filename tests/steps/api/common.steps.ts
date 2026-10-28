import { DataTable, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { HttpMethod } from '../../api-clients/BaseApiClient';
import { assertMatchesSchema, schemaByName, UUID_PATTERN } from '../../schemas';
import type { CustomWorld } from '../../support/world';
import { clients, describeResponse, lastError, lastResponse, queryFromTable } from './api-context';

/**
 * Endpoint-agnostic steps: raw requests for protocol-level checks, and assertions that apply to
 * any response (status, envelope, headers, timing). Resource-specific behaviour lives next door.
 */
const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const SENT_REQUEST_ID = 'api.sentRequestId';

function asHttpMethod(word: string): HttpMethod {
  const method = word.toUpperCase() as HttpMethod;
  if (!HTTP_METHODS.includes(method)) throw new Error(`Unsupported HTTP method "${word}"`);
  return method;
}

// --- requests ---------------------------------------------------------------------------------

When('I request GET {string}', async function (this: CustomWorld, pathWithQuery: string) {
  this.lastResponse = await clients(this).raw.rawGet(pathWithQuery);
});

When(
  'I request GET {string} with the request id {string}',
  async function (this: CustomWorld, pathWithQuery: string, requestId: string) {
    this.remember(SENT_REQUEST_ID, requestId);
    this.lastResponse = await clients(this).raw.rawGet(pathWithQuery, {
      headers: { 'X-Request-Id': requestId },
    });
  },
);

When('I send a {word} request to {string}', async function (this: CustomWorld, method: string, path: string) {
  this.lastResponse = await clients(this).raw.request(asHttpMethod(method), path);
});

When('I request an unknown route {int} characters long', async function (this: CustomWorld, length: number) {
  const prefix = '/api/v1/';
  this.lastResponse = await clients(this).raw.rawGet(
    prefix + 'x'.repeat(Math.max(0, length - prefix.length)),
  );
});

When('I check the service health', async function (this: CustomWorld) {
  this.lastResponse = await clients(this).health.check();
});

When('I check the service health with parameters:', async function (this: CustomWorld, table: DataTable) {
  this.lastResponse = await clients(this).health.check({ query: queryFromTable(table) });
});

When(
  'I check the service health with the request id {string}',
  async function (this: CustomWorld, requestId: string) {
    this.remember(SENT_REQUEST_ID, requestId);
    this.lastResponse = await clients(this).health.check({ headers: { 'X-Request-Id': requestId } });
  },
);

// --- status and envelope ----------------------------------------------------------------------

Then('the response status should be {int}', async function (this: CustomWorld, status: number) {
  const response = lastResponse(this);
  expect(response.status, describeResponse(response)).toBe(status);
});

Then('the response should not be a server error', async function (this: CustomWorld) {
  const response = lastResponse(this);
  expect(response.status, describeResponse(response)).toBeLessThan(500);
});

Then('the response should match the {word} schema', async function (this: CustomWorld, schemaName: string) {
  assertMatchesSchema(schemaByName(schemaName), lastResponse(this).body, `${schemaName} response`);
});

Then('the error code should be {string}', async function (this: CustomWorld, code: string) {
  expect(lastError(this).code).toBe(code);
});

Then(
  'the error details should mention the field {string}',
  async function (this: CustomWorld, field: string) {
    const details = lastError(this).details ?? [];
    expect(
      details.map((detail) => detail.field),
      `details were: ${JSON.stringify(details)}`,
    ).toContain(field);
  },
);

Then('the error details should mention the fields:', async function (this: CustomWorld, table: DataTable) {
  const expected = table.raw().flat();
  const details = lastError(this).details ?? [];
  const reported = details.map((detail) => detail.field);
  for (const field of expected) {
    expect(reported, `expected a detail for "${field}" in ${JSON.stringify(details)}`).toContain(field);
  }
});

Then(
  'the error detail for field {string} should say {string}',
  async function (this: CustomWorld, field: string, message: string) {
    const details = lastError(this).details ?? [];
    const detail = details.find((item) => item.field === field);
    expect(detail, `no detail for "${field}" in ${JSON.stringify(details)}`).toBeDefined();
    expect(detail?.message).toBe(message);
  },
);

Then('the response data should be empty', async function (this: CustomWorld) {
  const body = lastResponse(this).body as { data?: unknown };
  expect(body.data).toEqual([]);
});

Then('the response text should not contain {string}', async function (this: CustomWorld, fragment: string) {
  expect(lastResponse(this).text).not.toContain(fragment);
});

// --- headers and timing -----------------------------------------------------------------------

Then('the response content type should be JSON', async function (this: CustomWorld) {
  expect(lastResponse(this).headers['content-type']).toMatch(/^application\/json(;\s*charset=utf-8)?$/i);
});

Then('the response should carry a request id header', async function (this: CustomWorld) {
  expect(lastResponse(this).headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
});

Then('the response request id should be {string}', async function (this: CustomWorld, requestId: string) {
  expect(lastResponse(this).headers['x-request-id']).toBe(requestId);
});

Then('the response request id should be a generated UUID', async function (this: CustomWorld) {
  const actual = lastResponse(this).headers['x-request-id'];
  expect(actual).toMatch(UUID_PATTERN);
  // When the scenario sent its own (malformed) id, the server must not have echoed it back.
  const sent = this.recallOptional<string>(SENT_REQUEST_ID);
  if (sent !== undefined) expect(actual).not.toBe(sent);
});

Then('the Allow header should be {string}', async function (this: CustomWorld, allow: string) {
  expect(lastResponse(this).headers['allow']).toBe(allow);
});

Then('the response time should be under {int} ms', async function (this: CustomWorld, limitMs: number) {
  const response = lastResponse(this);
  expect(response.durationMs, `took ${response.durationMs.toFixed(1)} ms`).toBeLessThan(limitMs);
});
