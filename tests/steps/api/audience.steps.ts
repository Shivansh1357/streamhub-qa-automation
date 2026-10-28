import { DataTable, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { AudienceSummaryQuery } from '../../api-clients/AudienceClient';
import { compareValues, expectedAudienceSummary } from '../../api-clients/fixtures';
import type { QueryInput } from '../../api-clients/query-string';
import { audienceSummarySchema, GROUP_BY_OPTIONS, type GroupBy } from '../../schemas';
import { clients, lastBodyAs, queryFromTable, Remembered, stringParams } from '../../support/api-context';
import type { CustomWorld } from '../../support/world';

/**
 * The API rounds the means to 1 and 3 decimal places. The oracle keeps them unrounded and allows
 * half a unit in the last place, so the value check does not depend on matching a rounding
 * algorithm; the promised precision itself is asserted separately on every row.
 */
const WATCH_TIME_TOLERANCE = 0.05 + 1e-9;
const COMPLETION_TOLERANCE = 0.0005 + 1e-9;
const WATCH_TIME_DECIMALS = 1;
const COMPLETION_DECIMALS = 3;
const AUDIENCE_QUERY_KEYS = ['from', 'to', 'channelId', 'groupBy'] as const;

function asGroupBy(word: string): GroupBy {
  const groupBy = GROUP_BY_OPTIONS.find((option) => option === word);
  if (!groupBy) throw new Error(`groupBy must be one of ${GROUP_BY_OPTIONS.join(', ')}, got "${word}"`);
  return groupBy;
}

function rememberedAudienceQuery(world: CustomWorld): AudienceSummaryQuery {
  const picked = stringParams(world.recall<QueryInput>(Remembered.audienceQuery), AUDIENCE_QUERY_KEYS);
  if (picked.from === undefined || picked.to === undefined) {
    throw new Error('The dataset oracle needs both "from" and "to" to have been requested');
  }
  return {
    from: picked.from,
    to: picked.to,
    channelId: picked.channelId,
    groupBy: picked.groupBy === undefined ? undefined : asGroupBy(picked.groupBy),
  };
}

/** Valid, structured queries go through the typed client, so a misspelt parameter fails at compile time. */
async function requestSummary(world: CustomWorld, query: AudienceSummaryQuery): Promise<void> {
  world.remember(Remembered.audienceQuery, query);
  world.lastResponse = await clients(world).audience.summary(query);
}

/** Data-table input is sent verbatim (missing dates, impossible days, unknown keys) through the untyped client. */
async function requestSummaryWith(world: CustomWorld, query: QueryInput): Promise<void> {
  world.remember(Remembered.audienceQuery, query);
  world.lastResponse = await clients(world).audience.summaryWith(query);
}

/**
 * A value rounded to `places` decimals survives a round trip through toFixed unchanged; `21.63`
 * does not survive `toFixed(1)`. Exact comparison is safe because the API's own output is already
 * the nearest double to k / 10^places.
 */
function expectDecimalPlaces(value: number, places: number, label: string): void {
  expect(Number(value.toFixed(places)), `${label} should be rounded to ${places} decimal place(s)`).toBe(
    value,
  );
}

// --- When -------------------------------------------------------------------------------------

When(
  'I request an audience summary from {string} to {string}',
  async function (this: CustomWorld, from: string, to: string) {
    await requestSummary(this, { from, to });
  },
);

When(
  'I request an audience summary from {string} to {string} grouped by {string}',
  async function (this: CustomWorld, from: string, to: string, groupBy: string) {
    await requestSummary(this, { from, to, groupBy: asGroupBy(groupBy) });
  },
);

When(
  'I request an audience summary from {string} to {string} for channel {string}',
  async function (this: CustomWorld, from: string, to: string, channelId: string) {
    await requestSummary(this, { from, to, channelId });
  },
);

When(
  'I request an audience summary from {string} to {string} for channel {string} grouped by {string}',
  async function (this: CustomWorld, from: string, to: string, channelId: string, groupBy: string) {
    await requestSummary(this, { from, to, channelId, groupBy: asGroupBy(groupBy) });
  },
);

When('I request an audience summary with parameters:', async function (this: CustomWorld, table: DataTable) {
  await requestSummaryWith(this, queryFromTable(table));
});

// --- Then -------------------------------------------------------------------------------------

Then('the summary meta should echo the request', async function (this: CustomWorld) {
  const { meta } = lastBodyAs(this, audienceSummarySchema);
  const query = rememberedAudienceQuery(this);
  expect(meta).toEqual({
    from: query.from,
    to: query.to,
    groupBy: query.groupBy ?? 'channel',
    ...(query.channelId !== undefined ? { channelId: query.channelId } : {}),
    rows: meta.rows,
  });
});

Then(
  'the summary rows should match the aggregates computed from the dataset',
  async function (this: CustomWorld) {
    const { data, meta } = lastBodyAs(this, audienceSummarySchema);
    const expected = expectedAudienceSummary(rememberedAudienceQuery(this));

    expect(
      data.map((row) => row.key),
      'row keys',
    ).toEqual(expected.rows.map((row) => row.key));
    expect(meta.rows, 'meta.rows (daily rows aggregated)').toBe(expected.matchedRows);
    for (const [index, row] of data.entries()) {
      const want = expected.rows[index];
      expect(row.label, `label of ${row.key}`).toBe(want.label);
      expect(row.totalViewers, `totalViewers of ${row.key}`).toBe(want.totalViewers);
      expect(row.programmes, `distinct programmes of ${row.key}`).toBe(want.programmes);
      expect(
        Math.abs(row.avgWatchTimeMinutes - want.meanWatchTimeMinutes),
        `avgWatchTimeMinutes of ${row.key}`,
      ).toBeLessThanOrEqual(WATCH_TIME_TOLERANCE);
      expect(
        Math.abs(row.avgCompletionRate - want.meanCompletionRate),
        `avgCompletionRate of ${row.key}`,
      ).toBeLessThanOrEqual(COMPLETION_TOLERANCE);
      expectDecimalPlaces(row.avgWatchTimeMinutes, WATCH_TIME_DECIMALS, `avgWatchTimeMinutes of ${row.key}`);
      expectDecimalPlaces(row.avgCompletionRate, COMPLETION_DECIMALS, `avgCompletionRate of ${row.key}`);
    }
  },
);

Then('the summary rows should be sorted by key ascending', async function (this: CustomWorld) {
  const keys = lastBodyAs(this, audienceSummarySchema).data.map((row) => row.key);
  expect(keys).toEqual([...keys].sort(compareValues));
});

Then('the summary should contain no rows', async function (this: CustomWorld) {
  const { data, meta } = lastBodyAs(this, audienceSummarySchema);
  expect(data).toEqual([]);
  expect(meta.rows).toBe(0);
});

Then('the summary should contain {int} row(s)', async function (this: CustomWorld, count: number) {
  expect(lastBodyAs(this, audienceSummarySchema).data).toHaveLength(count);
});

Then(
  'the summary should include a row for key {string} labelled {string}',
  async function (this: CustomWorld, key: string, label: string) {
    const { data } = lastBodyAs(this, audienceSummarySchema);
    const row = data.find((item) => item.key === key);
    expect(
      row,
      `no row for key "${key}" among ${JSON.stringify(data.map((item) => item.key))}`,
    ).toBeDefined();
    expect(row?.label).toBe(label);
  },
);

Then(
  'every summary row key should be a date between {string} and {string}',
  async function (this: CustomWorld, from: string, to: string) {
    const { data } = lastBodyAs(this, audienceSummarySchema);
    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      expect(row.key >= from && row.key <= to, `key ${row.key} outside ${from}..${to}`).toBe(true);
    }
  },
);
