import { DataTable, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../../support/world';
import { cellText, expectRowsToEqualTable, recallResult, rowsWhere } from './query-result';

/** Exact integer arithmetic on '1234.56' style amounts, so the tolerance check cannot suffer float drift. */
function toCents(amount: unknown): number {
  const text = cellText(amount);
  if (!/^\d+\.\d{2}$/.test(text)) throw new Error(`Expected an amount with two decimals, got "${text}"`);
  return Number(text.replace('.', ''));
}

Then(
  'the result should contain exactly these round trips:',
  async function (this: CustomWorld, table: DataTable) {
    expectRowsToEqualTable(recallResult(this), table, 'round trips reported by the query');
  },
);

Then(
  'the round trips originating from transaction {string} should be exactly:',
  async function (this: CustomWorld, txnId: string, table: DataTable) {
    expectRowsToEqualTable(
      rowsWhere(recallResult(this), 'original_txn', txnId),
      table,
      `returns of ${txnId}`,
    );
  },
);

Then(
  'transaction {string} should not appear in the result',
  async function (this: CustomWorld, txnId: string) {
    const involved = recallResult(this).filter(
      (row) => cellText(row.original_txn) === txnId || cellText(row.return_txn) === txnId,
    );
    expect(involved, `${txnId} must not be reported as either leg of a round trip`).toEqual([]);
  },
);

Then(
  'every reported return should happen after its original and within {int} hours',
  async function (this: CustomWorld, maxHours: number) {
    for (const row of recallResult(this)) {
      const hours = Number(cellText(row.hours_between));
      expect(hours, `hours_between of ${cellText(row.return_txn)}`).toBeGreaterThan(0);
      expect(hours, `hours_between of ${cellText(row.return_txn)}`).toBeLessThanOrEqual(maxHours);
    }
  },
);

Then(
  'every reported return should be within {int} percent of the original amount',
  async function (this: CustomWorld, maxPercent: number) {
    for (const row of recallResult(this)) {
      const out = toCents(row.amount_out);
      const back = toCents(row.amount_back);
      // |back - out| <= maxPercent% of out, rearranged to stay in integers.
      expect(Math.abs(back - out) * 100, `tolerance of ${cellText(row.return_txn)}`).toBeLessThanOrEqual(
        out * maxPercent,
      );
    }
  },
);
