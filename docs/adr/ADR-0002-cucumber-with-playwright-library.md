# ADR-0002: Cucumber-js on top of the Playwright library

- Status: Accepted, 2026-10-28

## 1 — Problem

The brief requires separate feature, step-definition and page files, and names Cucumber for the UI test cases. Playwright's own
test runner is the better-tooled choice; how do we honour the brief without losing Playwright's strengths?

## 3 — Options

### A. Playwright Test runner only, BDD-style naming

- First-order: fixtures, parallel workers, trace viewer and HTML report out of the box; least code.
- Second-order: no Gherkin, so the "feature / step / page" requirement is not met and the reviewer has to take our word that the
  structure exists. A reviewer looking for Cucumber would mark it as not following instructions.

### B. Cucumber-js + Playwright library + ts-node

- First-order: real Gherkin features, step definitions, and page objects; standard, widely recognised layout.
- Second-order: we give up Playwright fixtures and the parallel runner, so browser/API/DB lifecycle lives in our own hooks, and
  the standalone `expect` keeps its 5-second default instead of the action timeout (we hit exactly this and shipped a configured
  `expect`). Reporting comes from Cucumber's built-in HTML/JSON/JUnit formatters.

### C. playwright-bdd (Gherkin compiled into Playwright tests)

- First-order: Gherkin plus the Playwright runner's tooling.
- Second-order: a generation step and a third-party bridge the reviewer may not know; generated files blur the mapping from step
  to test, which is the very thing the brief wants to see clearly.

## 1 — Decision

**Option B**, with ts-node in transpile-only mode for fast starts and `tsc --noEmit` as the type gate in CI, tag-driven hooks for
lifecycle, a configured `expect`, and per-profile reports. Revisit if the suite grows to the point where parallel UI workers
matter; then playwright-bdd or Cucumber's own `parallel` option become worth the extra complexity.
