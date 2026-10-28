-- =============================================================================
-- Scenario 1: round-trip transfers
--
-- Find pairs where account A sends money to account B and B sends a similar
-- amount (within 10%) back to A, with both transactions inside a 24-hour window.
-- Flags quick round trips and potential payment reversals.
--
-- Design decisions
--   * Self-join on reversed accounts. t1 is the ORIGINAL leg (A -> B), t2 is the
--     RETURN leg (B -> A): t2 must flow from t1's recipient back to t1's sender.
--   * The window is DIRECTIONAL: the return must happen strictly AFTER the
--     original. A "return" that precedes the "original" is not a reversal of it,
--     and the strict lower bound also guarantees each pair is reported once
--     (with the earlier transaction as original) instead of once per direction.
--     The upper bound is INCLUSIVE: a return exactly 24 hours later still counts.
--   * The tolerance is RELATIVE TO THE ORIGINAL AMOUNT (10% of what A sent)
--     because the business rule says B sends "a similar amount back" - similarity
--     is judged against the money that went out, not against the money that came
--     back. The bound is INCLUSIVE: a return of exactly 90% or 110% counts.
--     amount is NUMERIC, so 0.10 * t1.amount is exact and the boundary comparison
--     is not subject to floating-point drift.
--   * Partial reversals (e.g. 92% returned) are included by design; the
--     pct_difference column lets a reviewer tell them apart from exact reversals.
--   * If one payment has several qualifying returns, EVERY return is reported
--     (one row per return) - the query does not guess which one "belongs".
--   * hours_between and pct_difference are rounded to 2 decimals for reporting;
--     the predicates use the unrounded values so rounding can never widen the
--     window or the tolerance.
-- =============================================================================
SELECT
  t1.txn_id        AS original_txn,
  t2.txn_id        AS return_txn,
  t1.from_account  AS account_a,
  t1.to_account    AS account_b,
  t1.amount        AS amount_out,
  t2.amount        AS amount_back,
  -- EXTRACT(EPOCH ...) is numeric on PostgreSQL 14+ and double precision before;
  -- the explicit cast keeps ROUND(x, 2) valid on both.
  ROUND((EXTRACT(EPOCH FROM (t2.txn_time - t1.txn_time)) / 3600)::NUMERIC, 2) AS hours_between,
  ROUND(ABS(t2.amount - t1.amount) * 100 / t1.amount, 2)                       AS pct_difference
FROM transactions AS t1
JOIN transactions AS t2
  ON  t2.from_account = t1.to_account                          -- reversed accounts:
  AND t2.to_account   = t1.from_account                        --   B -> A answers A -> B
  AND t2.txn_time     >  t1.txn_time                           -- return strictly after the original
  AND t2.txn_time     <= t1.txn_time + INTERVAL '24 hours'     -- ... and no later than 24h (inclusive)
  AND ABS(t2.amount - t1.amount) <= 0.10 * t1.amount           -- within 10% of the ORIGINAL (inclusive)
ORDER BY
  t1.txn_time,
  t1.txn_id,
  t2.txn_time,
  t2.txn_id;
