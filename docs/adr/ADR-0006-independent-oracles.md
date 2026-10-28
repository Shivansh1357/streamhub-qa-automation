# ADR-0006: Independent oracles for every assertion

- Status: Accepted, 2026-10-28

## 1 — Problem

The brief asks for the EMI to be "calculated within your code" and compared with the application. More generally: what should a
test compare the system's output against so that a wrong number actually fails?

## 3 — Options

### A. Assert on whatever the system returns (presence, type, non-zero)

- First-order: easy, never flaky.
- Second-order: a test that cannot fail for a wrong value is a smoke test; the suite would report "green" against an API that
  paginates incorrectly or a calculator that rounds wrongly.

### B. Golden values hardcoded in features (EMI 33,038; total 2,33,344 ...)

- First-order: precise and readable for two UI scenarios.
- Second-order: does not scale to 173 API scenarios over 40 programmes; any seed or data change means re-deriving numbers by
  hand; the formula is hidden, so a reviewer cannot tell whether the expected value is right.

### C. Recompute the expectation independently: the EMI formula in `tests/utils/emi.ts`, API expectations from `api/data/*.json`
in `fixtures.ts`, SQL expectations designed into the seed and cross-checked by mutation

- First-order: more code (oracle helpers, fixtures loaders) and the risk of mirroring the implementation's rounding.
- Second-order: tests fail for real bugs (the API suite caught unknown query parameters being accepted on single-resource routes;
  the SQL review caught same-instant round trips being dropped). The rounding risk is handled with explicit tolerances (EMI ±1
  rupee, totals ±2, shares ±0.15 %) and separate precision assertions, so the oracle checks the value and the format without
  copying the algorithm.

## 1 — Decision

**Option C**, with a few golden anchors kept as sanity checks (the site's own 50L / 9 % / 20 y example). Consequences accepted:
the oracles need their own reasoning in comments, and a change to the data files legitimately changes expectations. Revisit if
the API gains write endpoints; then fixtures must be re-derived per scenario rather than loaded once.
