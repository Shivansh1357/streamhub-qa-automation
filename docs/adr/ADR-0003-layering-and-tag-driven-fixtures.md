# ADR-0003: Layering and tag-driven fixtures

- Status: Accepted, 2026-10-28

## 1 — Problem

Where do locators, HTTP calls and database access live, and how does a scenario get the resources it needs without every
scenario paying for a browser, an API server and a connection pool?

## 3 — Options

### A. Steps own locators and HTTP calls directly

- First-order: quickest to write; fewer files.
- Second-order: a single DOM change touches many step files, scenarios drift into copy-paste, and a self-healing tool has no
  single place to patch. Features start to leak CSS into business language.

### B. Page objects and resource clients behind intent-level steps; hooks keyed on `@ui` / `@api` / `@sql`

- First-order: a few more files; steps read like `amountSlider.setValue(1_000_000)` and `expectEmi(33_038)`.
- Second-order: one place to change (or heal) a locator; a scenario only gets what its tag asks for, so API scenarios run in
  about a second without a browser and scenarios cannot share state by accident. Missing tags fail loudly through the World's
  guarded getters.

### C. Screenplay pattern (actors, tasks, questions)

- First-order: very expressive, highly reusable.
- Second-order: more abstraction than a suite of this size can justify; reviewers unfamiliar with it spend their time on the
  pattern rather than the tests.

## 1 — Decision

**Option B.** Steps contain no locators or HTTP details (the one deliberate exception is `conventions.feature`, where the HTTP
surface itself is under test). Consequences accepted: a shared `World` and hook module to maintain. Revisit if a second
application under test appears; then page objects move under per-application folders.
