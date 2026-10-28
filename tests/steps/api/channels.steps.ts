import { DataTable, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import {
  CHANNEL_SORT_OPTIONS,
  type ChannelListQuery,
  type ChannelSort,
} from '../../api-clients/ChannelsClient';
import {
  channelById,
  expectedChannelList,
  findSortViolation,
  sortToken,
  type SortableField,
} from '../../api-clients/fixtures';
import type { QueryInput } from '../../api-clients/query-string';
import {
  type Channel,
  channelListSchema,
  channelSchema,
  CHANNEL_TYPES,
  type ChannelType,
} from '../../schemas';
import {
  asSortDirection,
  clients,
  lastBodyAs,
  queryFromTable,
  Remembered,
  stringParams,
} from '../../support/api-context';
import type { CustomWorld } from '../../support/world';

const CHANNEL_QUERY_KEYS = ['country', 'type', 'sort'] as const;

function asChannelType(word: string): ChannelType {
  const type = CHANNEL_TYPES.find((option) => option === word);
  if (!type) throw new Error(`type must be one of ${CHANNEL_TYPES.join(', ')}, got "${word}"`);
  return type;
}

function asChannelSort(token: string): ChannelSort {
  const sort = CHANNEL_SORT_OPTIONS.find((option) => option === token);
  if (!sort) throw new Error(`sort must be one of ${CHANNEL_SORT_OPTIONS.join(', ')}, got "${token}"`);
  return sort;
}

/** `country "GB"` / `type "vod"` as written in a step -> the one typed filter it names. */
function channelFilter(name: string, value: string): Pick<ChannelListQuery, 'country' | 'type'> {
  if (name === 'country') return { country: value };
  if (name === 'type') return { type: asChannelType(value) };
  throw new Error(`"${name}" is not a channel filter (country | type)`);
}

/** Rebuilds the typed query from whatever a "When" step remembered, for the dataset oracle. */
function rememberedChannelQuery(world: CustomWorld): ChannelListQuery {
  const picked = stringParams(world.recall<QueryInput>(Remembered.channelQuery), CHANNEL_QUERY_KEYS);
  return {
    country: picked.country,
    type: picked.type === undefined ? undefined : asChannelType(picked.type),
    sort: picked.sort === undefined ? undefined : asChannelSort(picked.sort),
  };
}

/** Valid, structured queries go through the typed client, so a misspelt parameter fails at compile time. */
async function listChannels(world: CustomWorld, query: ChannelListQuery): Promise<void> {
  world.remember(Remembered.channelQuery, query);
  world.lastResponse = await clients(world).channels.list(query);
}

/** Data-table input is sent verbatim (unknown keys, wrong types) through the untyped client. */
async function listChannelsWith(world: CustomWorld, query: QueryInput): Promise<void> {
  world.remember(Remembered.channelQuery, query);
  world.lastResponse = await clients(world).channels.listWith(query);
}

function returnedChannels(world: CustomWorld): Channel[] {
  return lastBodyAs(world, channelListSchema).data;
}

// --- When -------------------------------------------------------------------------------------

When('I list channels', async function (this: CustomWorld) {
  await listChannels(this, {});
});

When('I list channels with parameters:', async function (this: CustomWorld, table: DataTable) {
  await listChannelsWith(this, queryFromTable(table));
});

When(
  'I list channels sorted by {string} {word}',
  async function (this: CustomWorld, field: string, direction: string) {
    await listChannels(this, { sort: asChannelSort(sortToken(field, asSortDirection(direction))) });
  },
);

When(
  'I list channels filtered by {word} {string} sorted by {string} {word}',
  async function (this: CustomWorld, filter: string, value: string, field: string, direction: string) {
    await listChannels(this, {
      ...channelFilter(filter, value),
      sort: asChannelSort(sortToken(field, asSortDirection(direction))),
    });
  },
);

When('I fetch the channel {string}', async function (this: CustomWorld, id: string) {
  this.lastResponse = await clients(this).channels.getById(id);
});

When(
  'I fetch the channel {string} with parameters:',
  async function (this: CustomWorld, id: string, table: DataTable) {
    this.lastResponse = await clients(this).channels.getById(id, queryFromTable(table));
  },
);

// --- Then -------------------------------------------------------------------------------------

Then(
  'every returned channel should have {word} {string}',
  async function (this: CustomWorld, field: string, value: string) {
    const data = returnedChannels(this);
    expect(data.length, 'expected at least one channel to check').toBeGreaterThan(0);
    for (const channel of data) {
      expect(channel[field as keyof Channel], `channel ${channel.id}`).toBe(value);
    }
  },
);

Then(
  'the channels should be sorted by {string} {word}',
  async function (this: CustomWorld, field: string, direction: string) {
    const data = returnedChannels(this);
    const spec = { field: field as SortableField<Channel>, direction: asSortDirection(direction) };
    const violation = findSortViolation(data, spec);
    expect(violation, `order breaks at index ${violation}: ${JSON.stringify(data.map((c) => c.id))}`).toBe(
      -1,
    );
  },
);

Then('the channel list should match the dataset for the same query', async function (this: CustomWorld) {
  const { data, meta } = lastBodyAs(this, channelListSchema);
  const expected = expectedChannelList(rememberedChannelQuery(this));
  expect(data).toEqual(expected);
  expect(meta.total).toBe(expected.length);
});

Then('the channel list should contain {int} channel(s)', async function (this: CustomWorld, count: number) {
  const { data, meta } = lastBodyAs(this, channelListSchema);
  expect(data).toHaveLength(count);
  expect(meta.total).toBe(count);
});

Then('the reported total should equal the number of channels returned', async function (this: CustomWorld) {
  const { data, meta } = lastBodyAs(this, channelListSchema);
  expect(meta.total).toBe(data.length);
});

Then(
  'the channel should equal the dataset entry for {string}',
  async function (this: CustomWorld, id: string) {
    expect(lastBodyAs(this, channelSchema)).toEqual(channelById(id));
  },
);
