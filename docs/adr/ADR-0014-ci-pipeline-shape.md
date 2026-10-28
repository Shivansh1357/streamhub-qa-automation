# ADR-0014: CI pipeline shape

- Status: Accepted, 2026-10-28

## 1 — Problem

Which jobs should run on push, how should flakiness against a live third-party site be handled, and where does a suite that is
expected to fail (the self-healing demo) belong?

## 3 — Options

### A. One job running `npm test`

- First-order: one workflow, one status.
- Second-order: a single slow page load fails the API and SQL signal with it; the browser install slows every run; there is no
  per-suite artifact to open.

### B. One job per suite (quality gates, API, UI, SQL) with per-suite artifacts; the UI profile retries once only when `CI=true`;
the self-healing demo runs only on manual dispatch, with failures allowed and the offline healer producing a patch artifact

- First-order: four parallel jobs and a Postgres service container; the browser is installed only where needed
  (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` elsewhere).
- Second-order: API and SQL feedback arrives in about a minute regardless of the external site; a retry in CI absorbs a transient
  slow load but local runs keep `retry: 0` so flakiness is never hidden from the developer; the expected-failure suite can never
  turn `main` red.

### C. UI suite nightly only, everything else on push

- First-order: no third-party dependency on pull requests.
- Second-order: a locator regression is discovered a day late, which defeats the purpose of automation for a page we do not
  control.

## 1 — Decision

**Option B.** Consequences accepted: a retry is a known trade-off (documented in the README's limitations) and the UI job can
still fail on a real outage of the site, which is the correct signal. Revisit if the UI suite grows beyond a few minutes; then
sharding across workers and a hosted mirror of the page come next.
