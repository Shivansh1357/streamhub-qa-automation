import { DataTable, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../../support/world';
import { expectRowsToEqualTable, recallResult, rowsWhere } from './query-result';

Then(
  'the result should contain exactly these streaks:',
  async function (this: CustomWorld, table: DataTable) {
    expectRowsToEqualTable(recallResult(this), table, 'streaks reported by the query');
  },
);

Then(
  'the streaks for player {string} should be exactly:',
  async function (this: CustomWorld, playerName: string, table: DataTable) {
    expectRowsToEqualTable(
      rowsWhere(recallResult(this), 'player_name', playerName),
      table,
      `streaks of ${playerName}`,
    );
  },
);

Then(
  'player {string} should not appear in the result',
  async function (this: CustomWorld, playerName: string) {
    expect(
      rowsWhere(recallResult(this), 'player_name', playerName),
      `${playerName} must not have a streak`,
    ).toEqual([]);
  },
);
