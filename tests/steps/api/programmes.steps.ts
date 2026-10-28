import { DataTable, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import {
  channelById,
  expectedProgrammePage,
  findSortViolation,
  programmeById,
  programmes as datasetProgrammes,
  sortToken,
  totalPagesFor,
  type SortableField,
} from '../../api-clients/fixtures';
import type { ProgrammeListQuery } from '../../api-clients/ProgrammesClient';
import type { QueryInput } from '../../api-clients/query-string';
import {
  GENRES,
  type Genre,
  type Programme,
  type ProgrammeList,
  type ProgrammeSort,
  programmeDetailSchema,
  programmeListSchema,
} from '../../schemas';
import type { CustomWorld } from '../../support/world';
import {
  asSortDirection,
  clients,
  idList,
  lastBodyAs,
  queryFromTable,
  Remembered,
  stringParams,
} from './api-context';

const MAX_PAGE_SIZE = 50;
const STRING_KEYS = ['channelId', 'genre', 'q', 'sort'] as const;
const NUMBER_KEYS = ['minRating', 'page', 'limit'] as const;

function asGenre(word: string): Genre {
  const genre = GENRES.find((option) => option === word);
  if (!genre) throw new Error(`genre must be one of ${GENRES.join(', ')}, got "${word}"`);
  return genre;
}

/** Rebuilds the typed query the oracle needs from what the "When" step sent (valid scenarios only). */
function rememberedProgrammeQuery(world: CustomWorld): ProgrammeListQuery {
  const input = world.recall<QueryInput>(Remembered.programmeQuery);
  const strings = stringParams(input, STRING_KEYS);
  const numbers: Partial<Record<(typeof NUMBER_KEYS)[number], number>> = {};
  for (const key of NUMBER_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
      throw new Error(`Parameter "${key}" must be numeric to be checked against the dataset`);
    numbers[key] = parsed;
  }
  return {
    channelId: strings.channelId,
    genre: strings.genre === undefined ? undefined : asGenre(strings.genre),
    q: strings.q,
    sort: strings.sort as ProgrammeSort | undefined,
    ...numbers,
  };
}

async function listProgrammes(world: CustomWorld, query: QueryInput): Promise<void> {
  world.remember(Remembered.programmeQuery, query);
  world.lastResponse = await clients(world).programmes.listWith(query);
}

function currentPage(world: CustomWorld): ProgrammeList {
  return lastBodyAs(world, programmeListSchema);
}

function returnedProgrammes(world: CustomWorld): Programme[] {
  const data = currentPage(world).data;
  expect(data.length, 'expected at least one programme to check').toBeGreaterThan(0);
  return data;
}

// --- When -------------------------------------------------------------------------------------

When('I list programmes', async function (this: CustomWorld) {
  await listProgrammes(this, {});
});

When('I list programmes with parameters:', async function (this: CustomWorld, table: DataTable) {
  await listProgrammes(this, queryFromTable(table));
});

When('I list programmes on channel {string}', async function (this: CustomWorld, channelId: string) {
  await listProgrammes(this, { channelId });
});

When('I list programmes in genre {string}', async function (this: CustomWorld, genre: string) {
  await listProgrammes(this, { genre });
});

When('I list programmes rated at least {float}', async function (this: CustomWorld, minRating: number) {
  await listProgrammes(this, { minRating });
});

When('I search programmes for {string}', async function (this: CustomWorld, q: string) {
  await listProgrammes(this, { q });
});

When(
  'I search programmes for a title of {int} characters',
  async function (this: CustomWorld, length: number) {
    await listProgrammes(this, { q: 'a'.repeat(length) });
  },
);

When(
  'I list programmes with the {string} parameter repeated as {string} and {string}',
  async function (this: CustomWorld, name: string, first: string, second: string) {
    await listProgrammes(this, { [name]: [first, second] });
  },
);

When(
  'I list all programmes sorted by {string} {word}',
  async function (this: CustomWorld, field: string, direction: string) {
    // The largest permitted page: the whole fixture fits, so the full order can be checked at once.
    await listProgrammes(this, { sort: sortToken(field, asSortDirection(direction)), limit: MAX_PAGE_SIZE });
  },
);

When(
  'I request page {int} of programmes with {int} per page',
  async function (this: CustomWorld, page: number, limit: number) {
    await listProgrammes(this, { page, limit });
  },
);

When(
  'I collect every page of programmes with {int} per page',
  async function (this: CustomWorld, limit: number) {
    const pages: ProgrammeList[] = [];
    let page = 1;
    // totalPages comes from the first response; the guard keeps a broken server from looping forever.
    do {
      await listProgrammes(this, { page, limit });
      pages.push(currentPage(this));
      page += 1;
    } while (page <= pages[0].meta.totalPages && page <= 1000);
    this.remember(Remembered.collectedPages, pages);
  },
);

When('I fetch the programme {string}', async function (this: CustomWorld, id: string) {
  this.lastResponse = await clients(this).programmes.getById(id);
});

When(
  'I fetch the programme {string} with parameters:',
  async function (this: CustomWorld, id: string, table: DataTable) {
    this.lastResponse = await clients(this).programmes.getById(id, queryFromTable(table));
  },
);

// --- Then: filters ----------------------------------------------------------------------------

Then(
  'every returned programme should belong to channel {string}',
  async function (this: CustomWorld, channelId: string) {
    for (const programme of returnedProgrammes(this))
      expect(programme.channelId, programme.id).toBe(channelId);
  },
);

Then(
  'every returned programme should have genre {string}',
  async function (this: CustomWorld, genre: string) {
    for (const programme of returnedProgrammes(this)) expect(programme.genre, programme.id).toBe(genre);
  },
);

Then(
  'every returned programme should be rated at least {float}',
  async function (this: CustomWorld, minRating: number) {
    for (const programme of returnedProgrammes(this))
      expect(programme.rating, programme.id).toBeGreaterThanOrEqual(minRating);
  },
);

Then(
  'every returned programme title should contain {string} ignoring case',
  async function (this: CustomWorld, fragment: string) {
    const needle = fragment.trim().toLowerCase();
    for (const programme of returnedProgrammes(this)) {
      expect(programme.title.toLowerCase(), programme.id).toContain(needle);
    }
  },
);

// --- Then: ordering ---------------------------------------------------------------------------

Then(
  'the programmes should be sorted by {string} {word}',
  async function (this: CustomWorld, field: string, direction: string) {
    const data = returnedProgrammes(this);
    const spec = { field: field as SortableField<Programme>, direction: asSortDirection(direction) };
    const violation = findSortViolation(data, spec);
    expect(violation, `order breaks at index ${violation}: ${JSON.stringify(data.map((p) => p.id))}`).toBe(
      -1,
    );
  },
);

Then(
  'programmes with equal {string} should be ordered by id ascending',
  async function (this: CustomWorld, field: string) {
    const data = returnedProgrammes(this);
    const key = field as SortableField<Programme>;
    let tiesSeen = 0;
    for (let i = 1; i < data.length; i += 1) {
      if (data[i - 1][key] !== data[i][key]) continue;
      tiesSeen += 1;
      expect(
        data[i - 1].id < data[i].id,
        `${data[i - 1].id} should precede ${data[i].id} (same ${field})`,
      ).toBe(true);
    }
    expect(
      tiesSeen,
      `the dataset should contain ties on ${field} for this check to mean anything`,
    ).toBeGreaterThan(0);
  },
);

Then(
  'the programmes rated {float} should appear in the order {string}',
  async function (this: CustomWorld, rating: number, ids: string) {
    const actual = returnedProgrammes(this)
      .filter((programme) => programme.rating === rating)
      .map((programme) => programme.id);
    expect(actual).toEqual(idList(ids));
  },
);

// --- Then: page contents and meta -------------------------------------------------------------

Then('the programme page should match the dataset for the same query', async function (this: CustomWorld) {
  const { data, meta } = currentPage(this);
  const expected = expectedProgrammePage(rememberedProgrammeQuery(this));
  expect(data).toEqual(expected.data);
  expect(meta).toEqual(expected.meta);
});

Then(
  'the page meta should report page {int} and limit {int}',
  async function (this: CustomWorld, page: number, limit: number) {
    const { meta } = currentPage(this);
    expect(meta.page).toBe(page);
    expect(meta.limit).toBe(limit);
  },
);

Then('the page meta should report sort {string}', async function (this: CustomWorld, sort: string) {
  expect(currentPage(this).meta.sort).toBe(sort);
});

Then(
  'the reported total should equal the number of programmes in the dataset',
  async function (this: CustomWorld) {
    expect(currentPage(this).meta.total).toBe(datasetProgrammes().length);
  },
);

Then('the reported total should be {int}', async function (this: CustomWorld, total: number) {
  expect(currentPage(this).meta.total).toBe(total);
});

Then(
  'totalPages should be the dataset total divided by {int} rounded up',
  async function (this: CustomWorld, limit: number) {
    const { meta } = currentPage(this);
    expect(meta.totalPages).toBe(totalPagesFor(datasetProgrammes().length, limit));
  },
);

Then('the page should contain {int} programme(s)', async function (this: CustomWorld, count: number) {
  expect(currentPage(this).data).toHaveLength(count);
});

Then('the page should be the final page', async function (this: CustomWorld) {
  const { meta } = currentPage(this);
  expect(meta.page).toBe(meta.totalPages);
});

Then(
  'the page should contain exactly the programmes {string}',
  async function (this: CustomWorld, ids: string) {
    expect(currentPage(this).data.map((programme) => programme.id)).toEqual(idList(ids));
  },
);

// --- Then: walking every page -----------------------------------------------------------------

function collectedPages(world: CustomWorld): ProgrammeList[] {
  return world.recall<ProgrammeList[]>(Remembered.collectedPages);
}

Then(
  'every programme in the dataset should appear exactly once across the collected pages',
  async function (this: CustomWorld) {
    const seen = collectedPages(this).flatMap((page) => page.data.map((programme) => programme.id));
    expect([...seen].sort()).toEqual(
      datasetProgrammes()
        .map((programme) => programme.id)
        .sort(),
    );
  },
);

Then('no two collected pages should share a programme', async function (this: CustomWorld) {
  const seen = new Map<string, number>();
  for (const [index, page] of collectedPages(this).entries()) {
    for (const programme of page.data) {
      expect(
        seen.has(programme.id),
        `${programme.id} is on page ${seen.get(programme.id)} and page ${index + 1}`,
      ).toBe(false);
      seen.set(programme.id, index + 1);
    }
  }
});

Then(
  'the number of collected pages should equal the reported totalPages',
  async function (this: CustomWorld) {
    const pages = collectedPages(this);
    expect(pages).toHaveLength(pages[0].meta.totalPages);
  },
);

// --- Then: single programme -------------------------------------------------------------------

Then(
  'the programme should equal the dataset entry for {string}',
  async function (this: CustomWorld, id: string) {
    const detail = lastBodyAs(this, programmeDetailSchema);
    // The embedded channel has its own step; here only the programme's own fields are compared.
    expect(detail).toEqual({ ...programmeById(id), channel: detail.channel });
  },
);

Then(
  "the embedded channel should match the programme's channel in the dataset",
  async function (this: CustomWorld) {
    const detail = lastBodyAs(this, programmeDetailSchema);
    const channel = channelById(programmeById(detail.id).channelId);
    expect(detail.channel).toEqual({ id: channel.id, name: channel.name });
  },
);
