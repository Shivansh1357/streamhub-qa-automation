import { DataTable, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { ChannelListQuery, ChannelSort } from '../../api-clients/ChannelsClient';
import {
  channelById,
  expectedChannelList,
  findSortViolation,
  sortToken,
  type SortableField,
} from '../../api-clients/fixtures';
import type { QueryInput } from '../../api-clients/query-string';
import { type Channel, channelListSchema, channelSchema, CHANNEL_TYPES } from '../../schemas';
import type { CustomWorld } from '../../support/world';
import {
  asSortDirection,
  clients,
  lastBodyAs,
  queryFromTable,
  Remembered,
  stringParams,
} from './api-context';

const CHANNEL_QUERY_KEYS = ['country', 'type', 'sort'] as const;

/** Rebuilds the typed query from whatever a "When" step remembered, for the dataset oracle. */
function rememberedChannelQuery(world: CustomWorld): ChannelListQuery {
  const picked = stringParams(world.recall<QueryInput>(Remembered.channelQuery), CHANNEL_QUERY_KEYS);
  const type = picked.type === undefined ? undefined : CHANNEL_TYPES.find((option) => option === picked.type);
  if (picked.type !== undefined && type === undefined)
    throw new Error(`"${picked.type}" is not a channel type`);
  return { country: picked.country, type, sort: picked.sort as ChannelSort | undefined };
}

async function listChannels(world: CustomWorld, query: QueryInput): Promise<void> {
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
  await listChannels(this, queryFromTable(table));
});

When(
  'I list channels sorted by {string} {word}',
  async function (this: CustomWorld, field: string, direction: string) {
    await listChannels(this, { sort: sortToken(field, asSortDirection(direction)) });
  },
);

When(
  'I list channels filtered by {word} {string} sorted by {string} {word}',
  async function (this: CustomWorld, filter: string, value: string, field: string, direction: string) {
    await listChannels(this, { [filter]: value, sort: sortToken(field, asSortDirection(direction)) });
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
