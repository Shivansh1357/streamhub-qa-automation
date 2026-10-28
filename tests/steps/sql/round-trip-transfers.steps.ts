import { DataTable, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../../support/world';
import { cellText, expectRowsToEqualTable, recallResult, rowsWhere } from './query-result';
import type { ResultRow } from './sql-files';

/** Exact integer arithmetic on '1234.56' style amounts, so the tolerance check cannot suffer float drift. */
function toCents(amount: unknown): bigint {
  const text = cellText(amount);
  if (!/^\d+\.\d{2}$/.test(text)) throw new Error(`Expected an amount with two decimals, got "${text}"`);
  return BigInt(text.replace('.', ''));
}

/** One leg of a reported pair, read straight from the transactions table rather than from the query output. */
interface LedgerLeg {
  txnId: string;
  /** txn_time as PostgreSQL prints it, for failure messages. */
  txnTime: string;
  /** txn_time as whole microseconds since the epoch - PostgreSQL's full precision, compared exactly as a bigint. */
  txnTimeMicros: bigint;
  /** amount as the exact NUMERIC text ('1100.10'); never parsed into a float. */
  amount: string;
}

const MICROS_PER_HOUR = 3_600_000_000n;

/**
 * Second, independent query: fetch the raw ledger rows behind every txn_id the query reported.
 * The business rule is then re-applied to these values in the steps below, so a rounding or
 * display error in the query's own hours_between / pct_difference columns cannot mask a
 * pair that breaks the window or the tolerance.
 */
async function loadLedgerLegs(world: CustomWorld, rows: ResultRow[]): Promise<Map<string, LedgerLeg>> {
  const ids = [...new Set(rows.flatMap((row) => [cellText(row.original_txn), cellText(row.return_txn)]))];
  const { rows: legs } = await world.getDb().query<{
    txn_id: string;
    txn_time: string;
    txn_time_micros: string;
    amount: string;
  }>(
    `SELECT txn_id,
            txn_time::text                                    AS txn_time,
            (EXTRACT(EPOCH FROM txn_time) * 1000000)::BIGINT  AS txn_time_micros,
            amount::text                                      AS amount
       FROM transactions
      WHERE txn_id = ANY($1::text[])`,
    [ids],
  );
  const byId = new Map(
    legs.map((leg) => [
      leg.txn_id,
      {
        txnId: leg.txn_id,
        txnTime: leg.txn_time,
        txnTimeMicros: BigInt(leg.txn_time_micros),
        amount: leg.amount,
      },
    ]),
  );
  for (const id of ids) {
    if (!byId.has(id)) throw new Error(`Reported transaction ${id} does not exist in the transactions table`);
  }
  return byId;
}

interface LedgerPair {
  original: LedgerLeg;
  returned: LedgerLeg;
}

async function reportedPairsOnLedger(world: CustomWorld): Promise<LedgerPair[]> {
  const rows = recallResult(world);
  const legs = await loadLedgerLegs(world, rows);
  return rows.map((row) => ({
    original: legs.get(cellText(row.original_txn)) as LedgerLeg,
    returned: legs.get(cellText(row.return_txn)) as LedgerLeg,
  }));
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

/** Every row in which the transaction is EITHER leg - proves a pair is reported once, not once per direction. */
Then(
  'the round trips involving transaction {string} should be exactly:',
  async function (this: CustomWorld, txnId: string, table: DataTable) {
    const involved = recallResult(this).filter(
      (row) => cellText(row.original_txn) === txnId || cellText(row.return_txn) === txnId,
    );
    expectRowsToEqualTable(involved, table, `round trips in which ${txnId} is either leg`);
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
  'the raw transactions table should show every reported return posted at or after its original and within {int} hours',
  async function (this: CustomWorld, maxHours: number) {
    for (const { original, returned } of await reportedPairsOnLedger(this)) {
      const gap = returned.txnTimeMicros - original.txnTimeMicros;
      const where = `${returned.txnId} (${returned.txnTime}) vs its original ${original.txnId} (${original.txnTime})`;
      expect(gap >= 0n, `${where}: the return must not be posted before the original`).toBe(true);
      expect(
        gap <= BigInt(maxHours) * MICROS_PER_HOUR,
        `${where}: the return must be posted no more than ${maxHours} hours after the original`,
      ).toBe(true);
    }
  },
);

Then(
  'the raw transactions table should show every reported return within {int} percent of its original amount',
  async function (this: CustomWorld, maxPercent: number) {
    for (const { original, returned } of await reportedPairsOnLedger(this)) {
      const out = toCents(original.amount);
      const back = toCents(returned.amount);
      const diff = back > out ? back - out : out - back;
      // |back - out| <= maxPercent% of out, rearranged to stay in exact integers (cents * 100).
      expect(
        diff * 100n <= out * BigInt(maxPercent),
        `${returned.txnId} returned ${returned.amount} for ${original.txnId}'s ${original.amount}: ` +
          `outside the ${maxPercent}% tolerance of the original amount`,
      ).toBe(true);
    }
  },
);
