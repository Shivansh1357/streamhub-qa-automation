# Streamhub QA Automation Assessment — Section B

[![CI](https://github.com/Shivansh1357/streamhub-qa-automation/actions/workflows/ci.yml/badge.svg)](https://github.com/Shivansh1357/streamhub-qa-automation/actions/workflows/ci.yml)

A Playwright + Cucumber automation framework (TypeScript) covering **Section B** of the assessment:

| Part | What | Where | Evidence |
| --- | --- | --- | --- |
| B1 | A mock **Audience Analytics API** (Express 5 + zod, JSON-backed) with filtering, sorting, pagination, search and strict validation | [`api/`](api/README.md), [`api/openapi.yaml`](api/openapi.yaml) | curl table in [`api/README.md`](api/README.md) |
| B2 | **API automation** — Playwright request context driven by Cucumber features, independent oracles computed from the data files | [`tests/features/api/`](tests/features/api), [`tests/api-clients/`](tests/api-clients) | [`reports/api/cucumber-report.html`](reports/api/cucumber-report.html) |
| B3 | **UI automation** of the EMI pie chart and bar chart test cases on [emicalculator.net](https://emicalculator.net/) — sliders, calendar widget, Highcharts tooltips | [`tests/features/ui/`](tests/features/ui), [`tests/pages/`](tests/pages) | [`reports/ui/cucumber-report.html`](reports/ui/cucumber-report.html) |
| B4 | **SQL scenarios** (round-trip transfers, IPL scoring streaks) on PostgreSQL, with the *same* `.sql` files executed by automated tests | [`sql/`](sql/README.md) | [`sql/screenshots/`](sql/screenshots), [`sql/outputs/`](sql/outputs), [`reports/sql/cucumber-report.html`](reports/sql/cucumber-report.html) |
| AI | **Self-healing locators** — 4 deliberately brittle locators, a design doc, and a working POC that detects, proposes, validates and (optionally) applies fixes | [`docs/SELF_HEALING.md`](docs/SELF_HEALING.md), [`tools/self-heal/`](tools/self-heal) | [`reports/self-healing/`](reports/self-healing) |

> **Why Section B?** Automating a third-party page I don't control (ad-heavy, jQuery UI sliders, Highcharts SVG, a date picker) is a
> much stronger test of locator strategy and synchronisation than testing an app whose `data-testid`s I chose myself, and building
> the API still covers the full-stack half of the brief.

---

## 1. Quick start

```bash
# prerequisites: Node.js >= 20, npm; Docker (or a local PostgreSQL 16) for the SQL scenarios
npm ci                       # installs dependencies and the Chromium build Playwright needs

npm run test:api             # B2 — starts the API automatically, runs the API features
npm run test:ui              # B3 — headless Chromium against https://emicalculator.net/
docker compose up -d --wait  # PostgreSQL 16 seeded with the assessment schema + data
TEST_ENV=ci npm run test:sql # B4 — executes sql/queries/*.sql and asserts exact rows
TEST_ENV=ci npm test         # everything above in one run (the deliberately broken self-healing suite is excluded)
```

`TEST_ENV=ci` matches the Docker credentials (`postgres:postgres`). With a PostgreSQL server of your own, point `DATABASE_URL` at it
(or use the default `TEST_ENV=local`, which expects a passwordless local server) and drop the prefix. The combined HTML report is
written to `reports/default/cucumber-report.html`.

Every profile writes `reports/<profile>/cucumber-report.{html,json}` and `junit.xml`. Failing UI scenarios additionally get a
viewport screenshot (attached inside the HTML report), a Playwright trace, and DOM + accessibility snapshots (the raw material for
the self-healing tool; the trace covers the rest of the page).

Useful switches (all read through [`config/env.ts`](config/env.ts), never from `process.env` in test code):

| Variable | Default (`config/env/local.env`) | Purpose |
| --- | --- | --- |
| `TEST_ENV` | `local` | Picks `config/env/<name>.env` (`local`, `ci`); a git-ignored `.env` overrides values; real env vars override everything |
| `UI_BASE_URL` / `API_BASE_URL` | `https://emicalculator.net/` / `http://127.0.0.1:4010` | No URL is hardcoded anywhere in `tests/` |
| `HEADLESS`, `BROWSER`, `SLOW_MO_MS` | `true`, `chromium`, `0` | e.g. `HEADLESS=false SLOW_MO_MS=200 npm run test:ui` to watch a run |
| `UI_TRACE` | `on-failure` | `on` records a trace for every scenario (`npx playwright show-trace reports/ui/traces/<scenario>.zip`) |
| `API_AUTO_START` | `true` | Set `false` to test an API you started yourself (`npm run api:start`) or a deployed one |
| `DATABASE_URL` | `postgres://localhost:5432/streamhub_qa` | PostgreSQL for the SQL scenarios (`ci.env` matches `docker-compose.yml`) |

---

## 2. Requirements → implementation → evidence

| Assessment requirement | How it is met | Proof |
| --- | --- | --- |
| Framework, not a script: separate feature / step / page files | `tests/features/**` (Gherkin only), `tests/steps/**` (no locators), `tests/pages/**` + `tests/api-clients/**` (all locators / HTTP) | repo layout below |
| Environment configuration, no hardcoded URLs | `config/env.ts` + `config/env/*.env`, `.env` overrides; `grep -rn "https\?://" tests/` returns nothing | `config/` |
| Dynamic, resilient locators | role / label / text first (scoped to the form to dodge ad units), stable ids second, Highcharts class names only inside chart components with a comment; no positional selectors for interactive controls (chart components iterate Highcharts point collections by index, which is inherent to SVG charts) | `tests/pages/` |
| B1 API: 2–3+ endpoints, query params, status codes & error messages | 6 endpoints, filter/sort/paginate/search, consistent error envelope (`400/404/405`, never a 5xx), OpenAPI 3.1 spec | `api/README.md`, `api/openapi.yaml` |
| B2 happy paths per endpoint and parameter combination | Scenario Outlines per endpoint (173 scenarios in total); expected values computed from `api/data/*.json`, not from the response | `tests/features/api/*.feature` |
| B2 invalid / edge parameters, correct status codes & shape | ~40 negative cases (bounds, types, unknown params, malformed ids, bad dates, wrong method, unicode) validated against zod response schemas | `tests/features/api/*.feature`, `tests/schemas/` |
| B3 TC1: Home Loan tab, scenarios A & B, EMI computed in code, pie visible, both sections > 0 | `emi-pie-chart.feature` + `HomeLoanPage` + `PieChart` component; EMI formula in `tests/utils/emi.ts` with ±1 rupee tolerance | `reports/ui/cucumber-report.html` |
| B3 TC2: Personal Loan tab, sliders, calendar month, bar chart visible, bar count, tooltip values | `emi-bar-chart.feature` + `PersonalLoanPage` + `LoanSlider`, `MonthPicker`, `BarChart`, `PaymentScheduleTable` components; tooltip cross-checked against the schedule table | `reports/ui/cucumber-report.html` |
| B4 SQL with schema and screenshots | `sql/schema.sql`, `sql/seed.sql`, `sql/queries/*.sql`, psql outputs + rendered screenshots, **and** `npm run test:sql` executing the same files | `sql/README.md`, `sql/screenshots/` |
| 3–5 broken locators left broken | 4 in `tests/pages/self-healing/BrittleEmiCalculatorPage.ts`, each marked `BRITTLE ON PURPOSE` | `npm run test:self-healing` → 4 expected failures |
| Markdown on AI self-healing (detection, prompt, validation) + POC bonus | `docs/SELF_HEALING.md`; `npm run heal` (offline heuristic, Anthropic SDK, or Claude Code CLI backends) | `reports/self-healing/healing-report*.md` |
| Execution results in the repo | HTML/JSON/JUnit reports per profile, SQL outputs and screenshots, self-healing reports and patches | `reports/`, `sql/outputs`, `sql/screenshots` |
| README with setup, run, architecture, Claude Code reflection | this file | — |

---

## 3. Architecture

```
                 ┌────────────────────────────────────────────────────────────────┐
                 │  tests/features/**/*.feature     Gherkin — business language   │
                 └───────────────┬────────────────────────────────────────────────┘
                                 │ Cucumber (profiles in cucumber.js, tags select fixtures)
                 ┌───────────────▼────────────────────────────────────────────────┐
                 │  tests/steps/**                  step definitions — no locators │
                 │  tests/support/world.ts          per-scenario state + helpers   │
                 │  tests/support/hooks.ts          @ui → browser, @api → API +   │
                 │                                  server, @sql → pg pool        │
                 └──────┬─────────────────┬─────────────────────┬────────────────┘
                        │                 │                     │
          ┌─────────────▼──────┐  ┌───────▼──────────┐  ┌──────▼─────────────────┐
          │ tests/pages/**     │  │ tests/api-clients│  │ tests/steps/sql/*      │
          │ page objects +     │  │ typed clients +  │  │ runs sql/queries/*.sql │
          │ components         │  │ tests/schemas    │  │ through node-postgres  │
          └─────────────┬──────┘  └───────┬──────────┘  └──────┬─────────────────┘
                        │                 │                     │
          ┌─────────────▼──────┐  ┌───────▼──────────┐  ┌──────▼─────────────────┐
          │ emicalculator.net  │  │ api/ (Express 5) │  │ PostgreSQL 16          │
          └────────────────────┘  └──────────────────┘  └────────────────────────┘
                                 config/env.ts ← config/env/<TEST_ENV>.env ← .env ← shell
```

Design decisions worth knowing about:

- **Tags provision fixtures.** `@ui`, `@api` and `@sql` hooks create exactly what a scenario needs (a fresh browser context, a
  request context with the API started on demand, a connection pool). Scenarios can't accidentally share state.
- **Independent oracles.** UI tests compute the EMI themselves; API tests derive expected totals, orderings and aggregates from the
  JSON data files; SQL tests assert exact rows designed into the seed. A test that merely echoes the system under test proves nothing.
- **Locators live in one place.** Steps call intent-level methods (`amountSlider.setValue(1_000_000)`, `expectEmi(33_038)`); page
  objects own locators; chart components isolate the only non-semantic selectors (Highcharts renders unlabeled SVG).
- **Reports are first-class.** Each profile has its own report directory; failure artifacts are attached to the HTML report and saved
  to disk; CI uploads them as artifacts.
- **Self-healing is a separate profile.** The deliberately broken suite is excluded from `npm test` and CI's main jobs, so the default
  run is green while the exercise stays reproducible (`npm run test:self-healing` then `npm run heal`).

```
streamhub-qa-automation/
├── api/                      # B1 — mock API (src/, data/*.json, openapi.yaml, README.md)
├── config/                   # env.ts (typed loader) + env/local.env, env/ci.env
├── docs/SELF_HEALING.md      # AI self-healing design + worked example
├── sql/                      # B4 — schema, seed, queries, scripts, outputs, screenshots, README
├── tests/
│   ├── features/{api,ui,sql,self-healing}/   # Gherkin
│   ├── steps/{api,ui,sql,self-healing}/      # step definitions
│   ├── pages/                # page objects + components/ (+ self-healing/ brittle demo)
│   ├── api-clients/          # typed HTTP clients + fixtures loader
│   ├── schemas/              # zod response schemas
│   ├── support/              # world, hooks, api-server launcher, db pool, artifacts
│   └── utils/                # emi.ts (maths), money.ts (₹ parsing)
├── tools/self-heal/          # the self-healing POC (npm run heal)
├── reports/                  # committed execution results per profile
├── cucumber.js               # profiles: default | api | ui | sql | selfHealing (UI retries once when CI=true)
├── docker-compose.yml        # PostgreSQL 16 pre-seeded for the SQL scenarios
└── .github/workflows/ci.yml  # typecheck + lint, API, UI, SQL jobs; self-healing demo on demand
```

---

## 4. Test execution results

All suites were executed from this repository on 28 October 2026 (macOS, Node 22, headless Chromium, PostgreSQL 16) and the
reports are committed. Open the HTML reports directly, or read the JSON/JUnit files for machine-readable results.

| Suite | Command | Result | Report |
| --- | --- | --- | --- |
| API (B2) | `npm run test:api` | 173 scenarios / 820 steps passed, 0 failed (≈0.8 s) | [`reports/api/cucumber-report.html`](reports/api/cucumber-report.html) · [JSON](reports/api/cucumber-report.json) · [JUnit](reports/api/junit.xml) |
| UI (B3) | `npm run test:ui` | 4 scenarios / 29 steps passed, 0 failed (≈15 s), stable across repeated runs | [`reports/ui/cucumber-report.html`](reports/ui/cucumber-report.html) · [JSON](reports/ui/cucumber-report.json) · [JUnit](reports/ui/junit.xml) |
| SQL (B4) | `npm run test:sql` | 27 scenarios / 83 steps passed, 0 failed (≈0.5 s) | [`reports/sql/cucumber-report.html`](reports/sql/cucumber-report.html) · psql outputs in [`sql/outputs/`](sql/outputs) · screenshots in [`sql/screenshots/`](sql/screenshots) |
| Combined (default profile) | `npm test` | 204 scenarios / 932 steps passed, 0 failed (≈32 s; API + SQL + UI, self-healing excluded) | [`reports/default/cucumber-report.html`](reports/default/cucumber-report.html) · [JSON](reports/default/cucumber-report.json) · [JUnit](reports/default/junit.xml) |
| Self-healing demo | `npm run test:self-healing` | 4 scenarios failed **as designed** (one per brittle locator); `npm run heal` then produced validated fixes for 4/4 with the offline heuristic and 4/4 with Claude (`--provider claude-cli --live`, US$1.44 for four calls), and `--apply` re-ran one healed scenario green | [`reports/self-healing/cucumber-report.html`](reports/self-healing/cucumber-report.html) · [`healing-report.md`](reports/self-healing/healing-report.md) |

What the UI report contains, per step: the independently calculated EMI next to the displayed one (e.g. ₹33,038 displayed vs
33,037.68 calculated for 25L / 10 % / 10 y), the pie-section percentages read from the chart, screenshots of both charts, the slider
settings, the start-month change (e.g. "Oct 2026" → "Jan 2027"), the bar count (10 bars across 2027–2031), the raw tooltip text
("Year : 2029 Interest : ₹ 69,756 Total Payment : ₹ 2,66,933") and the matching payment-schedule row.

Failure artifacts (screenshots, traces, DOM snapshots) are written next to the reports but are git-ignored; CI uploads them as
workflow artifacts.

---

## 5. Notes per part

### B1 — Audience Analytics API

Streamhub measures TV and streaming audiences, so the mock API serves *channels*, *programmes* and daily *audience* rows from JSON
files. Highlights: strict query validation (unknown parameters are rejected, every invalid field is reported at once), ids are
validated before lookup (`400 INVALID_ID` vs `404 NOT_FOUND`), wrong methods answer `405` with an `Allow` header, every response
carries `X-Request-Id`, and the process never falls over on a handler error. Full details and a curl walkthrough: [`api/README.md`](api/README.md).

### B3 — UI automation notes

- **EMI maths** (`tests/utils/emi.ts`): `EMI = P·r·(1+r)^n / ((1+r)^n − 1)`. The site rounds the displayed EMI to the rupee but
  derives the totals from the unrounded EMI, so the assertions use ±1 rupee for the EMI and ±2 for the totals.
- **Sliders** (`tests/pages/components/LoanSlider.ts`): click the track at the proportional position for the target, read the linked
  input back, then nudge with `ArrowLeft`/`ArrowRight` (one step per key press) until it matches. Values are never typed for TC2.
- **Charts** are Highcharts SVG without accessible roles; the components read the data labels / tooltip text and cross-check them
  against the summary panel and the payment schedule table. Bar counting is scoped to the series group because the legend symbols
  are also `rect.highcharts-point` (a first naive locator counted 44 "bars" on a 21-year chart).
- **Month picker**: a bootstrap-datepicker in month view. The test picks January of next year so a 5-year loan spans exactly five
  calendar years, which makes the expected bar count (2 series × 5 years = 10) deterministic.

### B4 — SQL

Both scenarios are in [`sql/README.md`](sql/README.md) with the interpretation decisions spelled out (directional 24-hour window with
inclusive bounds, 10 % tolerance relative to the original amount, "consecutive" = consecutive innings batted, with an alternative
query for consecutive team fixtures). The automated tests execute the very same `.sql` files, and a mutation check confirmed the
boundary scenarios fail if either bound is made exclusive.

### AI self-healing exercise

Four locators in `tests/pages/self-healing/BrittleEmiCalculatorPage.ts` are broken on purpose (positional CSS chain, index-based
XPath, a typo'd id, stale text). `npm run test:self-healing` fails all four; `npm run heal` reads the Cucumber JSON report, classifies
each failure, trims the saved DOM, asks a backend for ranked candidates (role > label > text > test-id > stable id > css), validates
every candidate for uniqueness and role compatibility in the saved DOM (and optionally on the live page), and writes a human-reviewable
patch plus a report. Nothing is applied unless `--apply` is passed, and even then the fix is kept only if the scenario passes.
Both the offline heuristic and the model-backed run proposed the same four fixes (for example
`getByRole('link', { name: 'Personal Loan', exact: true })` for the positional tab selector); the Claude run cost about US$1.44 for
four calls through the Claude Code CLI. Candidates are data, never code: the validator builds locators by switching on the strategy,
so a model cannot inject JavaScript. Design, worked example and limitations: [`docs/SELF_HEALING.md`](docs/SELF_HEALING.md).

---

## 6. Claude Code reflection

I used Claude Code as the pair programmer for the whole assessment, not just for scaffolding. What that looked like in practice:

**How I worked with it**

- I started by describing the framework in plain language (Section B, Cucumber features → step definitions → page objects / API
  clients, typed environment config, tag-driven fixtures, per-profile reports) and let it scaffold the foundation. I ran a one-scenario
  smoke test against the live site before building anything on top of it — cheap insurance that the ts-node + Cucumber + Playwright
  wiring actually worked.
- Instead of guessing selectors for emicalculator.net, I had Claude Code drive a real browser and dump the DOM: slider ranges per
  loan product, the Highcharts class names, the exact tooltip text, how the month picker is built. Every locator in `tests/pages`
  comes from that inspection, and the facts went into the briefs for the other pieces of work.
- The work was split into four tracks that ran in parallel (API, API tests, UI tests, SQL, self-healing) with explicit contracts —
  the API contract was written down before any API code existed, so the API tests could be designed against the contract rather than
  against whatever got built.

**What it got wrong, and how I caught it**

- Bar counting: the first locator for "bars" (`rect.highcharts-point`) returned 44 on a 21-year chart. The legend symbols are also
  `rect.highcharts-point`, and the markers group carries the column-series class. Scoping to the series group fixed it (42 = 2 × 21).
  This is exactly the kind of plausible-but-wrong selector that only verification catches.
- `getByLabel('Interest Rate')` is the textbook "resilient" locator — and it failed with a strict-mode violation because Google ad
  units on the page carry aria-labels like "Interest Rate Tracker". Scoping to the calculator form with `exact: true` was the fix.
- `expect(tabList).toBeVisible()` failed even though the tabs were on screen: the `<ul>` collapses to zero height because its items
  float. The assertion now targets a tab link. Likewise `innerText()` throws on SVG nodes, so the chart components read `textContent`.
- Standalone Playwright `expect` has a 5-second default that silently ignores the action timeout from the environment config; the
  framework now ships a configured `expect` (`tests/support/expect.ts`).
- PostgreSQL `DATE` columns came back as JavaScript `Date` objects shifted by the local timezone; the SQL steps read them as text.
- Two of the parallel tracks were killed mid-task by upstream API errors and reported nothing; the summaries from the surviving
  tracks had to be checked against the file system rather than trusted. I restarted the missing pieces with tighter briefs.

**What I kept for myself**

Choosing Section B, the tolerances (±1 rupee EMI, ±2 totals, ±0.15 % shares), interpreting "consecutive matches" as consecutive
innings batted (with the alternative query provided), rejecting unknown API parameters with a 400, and never letting the self-healing
tool apply a locator fix without a validated candidate and a green re-run of the scenario.

---

## 7. CI

`.github/workflows/ci.yml` runs four jobs on pushes to `main` and on pull requests: type-check + lint + format check, API tests, UI tests (Chromium with system
deps) and SQL tests against a PostgreSQL 16 service container. Each job uploads its `reports/<profile>` directory as an artifact. The
self-healing demo job runs on demand (`workflow_dispatch`): it executes the broken suite (failures expected) and then the offline
healer, uploading the proposed patch.

## 8. Known limitations and next steps

- **The UI suite depends on a live third-party site.** emicalculator.net is ad-heavy and occasionally slow; the framework copes with
  web-first waits and a 20 s assertion budget, and CI retries UI scenarios once (the `ui` profile sets `retry: 1` with `retryTagFilter: '@ui'` when `CI=true`). A hosted mirror of the page
  would be the next step for deterministic CI.
- **Highcharts has no accessible roles.** The chart components rely on Highcharts class names; those are stable across minor versions
  but would need updating on a major Highcharts upgrade (which is precisely what the self-healing tool is for).
- **SQL tests need PostgreSQL.** They run locally against `DATABASE_URL` or the provided `docker-compose.yml`; there is no SQLite
  fallback because the window-function queries are written for PostgreSQL on purpose.
- **Self-healing is a proof of concept.** The offline heuristic is deliberately simple; the model-backed providers are stronger but cost
  money per failure. Fix application is gated behind `--apply` and a green re-run, and should stay out of CI.
- **Next steps I would take:** visual regression on the charts (Playwright `toHaveScreenshot` with masks), contract tests generated from
  `api/openapi.yaml`, a flake dashboard built from the JUnit output, and parallel UI workers once a mirror of the page exists.
