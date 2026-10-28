# AI self-healing locators

This document answers the AI exercise of the Streamhub QA Automation Assessment: four locators in
`tests/pages/self-healing/BrittleEmiCalculatorPage.ts` are broken on purpose and stay broken; `npm run heal`
is a working proof of concept that **detects** the locator failures, asks a backend (offline heuristic,
Anthropic SDK or the Claude Code CLI) for replacement locators, **validates** every candidate before anything
is touched, and writes a reviewable patch and report. `--apply` goes one step further: it edits the page
object, re-runs the single failing scenario and keeps the change only if that scenario passes.

Evidence from real runs lives in `reports/self-healing/`:

| File | Produced by |
| --- | --- |
| `cucumber-report.{json,html}`, `junit.xml` | `npm run test:self-healing` (4 expected failures) |
| `dom-snapshots/`, `screenshots/`, `traces/` (git-ignored) | the UI After hook, one set per failed scenario |
| `healing-report.offline.md`, `proposed-fixes.offline.patch` | `npm run heal -- --provider offline` |
| `healing-report.claude-cli.md`, `proposed-fixes.claude-cli.patch` | `npm run heal -- --provider claude-cli --live` |
| `healing-report.{md,json}`, `proposed-fixes.patch` | the most recent `npm run heal` |
| `apply-demo.log` | `npm run heal -- --provider offline --apply --max-failures 1` |

## 1. The four brittle locators

All four live in `BrittleEmiCalculatorPage` and are marked `BRITTLE ON PURPOSE`. Every scenario in
`tests/features/self-healing/brittle-locators.feature` also uses healthy locators (the Background asserts the
Loan Tenure field and the Home Loan Amount textbox), so each failure is unambiguously the locator, not the site.

| # | Getter | Broken locator | Why it is brittle | Playwright symptom | Correct locator |
| --- | --- | --- | --- | --- | --- |
| 1 | `personalLoanTab` | `locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a')` | Positional CSS chain that encodes the dashboard's nesting; the tab strip is the first child, not the second | `locator.click: Timeout 20000ms exceeded … waiting for locator(...)` (0 elements) | `getByRole('link', { name: 'Personal Loan', exact: true })` |
| 2 | `interestRateField` | `locator('xpath=(//div[contains(@class,"form-group")])[3]//input')` | Index-based XPath; the third form group is Loan Tenure (a text box plus two radios) | `strict mode violation … resolved to 3 elements` | `getByRole('textbox', { name: 'Interest Rate', exact: true })` or `getByLabel('Interest Rate', { exact: true })` |
| 3 | `loanAmountField` | `locator('#loanamountt')` | Typo in the id; a raw CSS id gets no help from the accessibility tree | `locator.fill: Timeout 20000ms exceeded` (0 elements) | `locator('#loanamount')` (stable id: the label changes with the loan product, see 8.1) |
| 4 | `emiResultHeading` | `getByText('Loan EMI Amount', { exact: true })` | Stale copy: the heading now reads "Loan EMI" | `expect(locator).toBeVisible() failed … element(s) not found` | `getByRole('heading', { name: 'Loan EMI', exact: true })` |

## 2. Detection: locator failure or product bug?

Healing a locator that failed because the product is broken would hide a real defect, so detection is the
most important step and it is deliberately conservative. The detector (`tools/self-heal/detect.ts`) reads the
Cucumber JSON report (`reports/self-healing/cucumber-report.json`), finds the first failed step of every
scenario and classifies it from the Playwright error text (ANSI colour codes stripped first, because Cucumber
keeps Playwright's dimmed call log in `error_message`).

### 2.1 Playwright error signatures

| Error text | What it means | Class |
| --- | --- | --- |
| `locator.click: Timeout … waiting for locator('…')` with no `locator resolved to` line | the locator never matched anything | `locator-not-found` |
| `expect(locator).toBeVisible() failed … Error: element(s) not found` | assertion on a locator that matched nothing | `locator-not-found` |
| `strict mode violation: locator('…') resolved to 3 elements` | the locator is not specific enough | `ambiguous` |
| `waiting for locator('…')` + `locator resolved to <div …>` + `element is not visible / not enabled / not an <input>` | the locator points at the wrong (or a non-actionable) element | `wrong-element` |
| `expect(locator).toHaveValue() failed … Expected: "9.5" Received: "10.5"` (element found, state differs) | the element exists; the value is wrong: a product or test-data issue | `not-a-locator-failure` (never healed) |
| no Playwright locator in the message (navigation error, thrown assertion, timeout in a hook) | not a locator problem | `not-a-locator-failure` (never healed) |

The parsed locator (`expression`, `kind` and the first string `literal`) is mapped back to the page object by
searching `tests/pages/**/*.ts` for the exact expression first and the literal second (`findSource`). If the
expression occurs on more than one line the tool refuses to build a patch and marks the fix report-only.

### 2.2 Step intent versus element role

The step wording and the failed call give an **intent** (`tools/self-heal/intent.ts`): `locator.fill` means a
text input, `locator.click` on a "tab" means a link or tab, `toBeVisible` on "heading" means a heading. The
tag at the end of the broken CSS/XPath (`… > a`, `//input`) is the strongest hint, then the step's nouns,
then the action verb. The intent is handed to the prompt and, more importantly, to validation: a candidate
that resolves to the right text in the wrong kind of element (a `<label>` instead of its `<input>`) is rejected.

### 2.3 DOM diff against the last passing snapshot

The After hook saves the full DOM and the aria snapshot for every failure. In a mature setup the same hook
would also keep a *golden* snapshot from the last green run of each scenario. Diffing the two answers
"did the page change?" before any model is involved: a locator that fails while the DOM around it is
unchanged is almost always a test bug (typo, wrong index), while a changed subtree points at a redesign that
the healer should follow. This POC keeps the artefacts but does not diff them yet (see 8.2).

### 2.4 Flake check

Timeouts also come from slow networks and animations. The CI profile retries `@ui` scenarios once
(`retry: 1`), so only a failure that reproduces reaches the healer; locally, re-running the single scenario
(`npx cucumber-js --profile selfHealing --name "<scenario>"`) is the cheapest first check, and it is exactly
what `--apply` does after patching.

### 2.5 Artefacts captured on failure

`tests/support/hooks.ts` saves, per failed `@ui` scenario, named by the scenario slug:

- `dom-snapshots/<slug>.html` - `page.content()` at the moment of failure (the healer's main input);
- `dom-snapshots/<slug>.aria.yml` - `locator('body').ariaSnapshot()`, the accessibility tree as Playwright sees it;
- `screenshots/<slug>.png` - full-page screenshot, also attached to the Cucumber report;
- `traces/<slug>.zip` - Playwright trace (`UI_TRACE=on-failure`) for `npx playwright show-trace`.

The DOM and the aria snapshot go to the model; the screenshot and trace are for the human reviewer.

## 3. Prompt approach

### 3.1 What the model receives

`tools/self-heal/providers/prompt.ts` builds one user message per failure from:

| Section | Content | Why |
| --- | --- | --- |
| Failing step | feature, scenario, `When I type "9.5" into the interest rate field` | the step is the clearest statement of what the author meant |
| Original locator | expression, kind (css / xpath / text / role …), the Playwright call, the page-object file and line | the broken locator still carries intent ("interest", "loanamountt") |
| Error class | `ambiguous: strict mode violation … resolved to 3 elements`, the inferred intent (`action=fill, roles=textbox…, tags=input`) and the trimmed Playwright error | tells the model what went wrong, not only that it went wrong |
| Trimmed DOM | ~25 000 characters of the 450 000-character snapshot (see 3.2) | the ground truth of what was on the page |
| Aria excerpt | ~4 000 characters of the aria snapshot around the best lexical matches | accessible names and roles exactly as Playwright computes them, which is what `getByRole` will match |
| Answer format | the JSON shape, "respond with ONLY this JSON object" | the contract validation relies on |

The system prompt carries the role ("you repair broken Playwright locators in a TypeScript page object"),
the **locator policy** (role > label > text > test id > stable id > css; never positional) and the rules:
keep the element kind the step intended, prefer names that do not change with page state, every candidate
must match exactly one element, at most five candidates with a rationale and a confidence each.

### 3.2 Trimming the DOM (`tools/self-heal/context.ts`)

A saved emicalculator.net page is ~450 KB; sending it whole would cost ~110 000 input tokens per failure
and bury the target in ads and menus. The trimmer parses the snapshot with a small dependency-free HTML
tokenizer (`html.ts`), removes noise subtrees (`script`, `style`, `svg`, `iframe`, images, ad containers),
keeps *interesting* elements (form controls, links, labels, headings, short text, anything with a role, an
aria-label or a test id) together with the ancestors that lead to them, and ranks containers by lexical
similarity to the step + locator tokens so the most relevant markup is emitted first. Attributes are
whitelisted (`id`, `class`, `name`, `type`, `for`, `role`, `aria-*`, `placeholder`, `value`, `href`, test
ids); long values are clipped. The result for every failure in this repo is ~25 000 characters (about 7 000
tokens) and still contains the target element - checked, not assumed.

Similarity (`similarity.ts`) is the F-measure of fuzzy precision and recall between the query tokens (step
words minus verbs such as "type"/"into"/"field", plus the broken locator's meaningful tokens) and each
element field, with bigram Dice for typos and compound ids, so `#loanamountt` finds `loanamount` and
"Personal Loan" beats "Loan Calculators & Widgets".

### 3.3 The structured JSON contract

Every backend must produce the same object, validated with zod (`CandidatesSchema`):

```json
{
  "candidates": [
    {
      "strategy": "role | label | text | testid | placeholder | css",
      "role": "textbox",
      "name": "Interest Rate",
      "exact": true,
      "value": "Interest Rate",
      "rationale": "one sentence",
      "confidence": 0.9
    }
  ]
}
```

Candidates are **data, never code**: the validator turns them into Playwright locators with a `switch` on
`strategy` (`page.getByRole(role, { name, exact })`, `getByLabel`, `getByText`, `getByTestId`,
`getByPlaceholder`, `page.locator(css)`). Nothing the model returns is ever evaluated as JavaScript.

### 3.4 Backends (`--provider`)

| Provider | How | When |
| --- | --- | --- |
| `offline` | deterministic heuristic: ranks the trimmed DOM's elements against the step and locator tokens, keeps only elements compatible with the intent, boosts an exact match on a phrase quoted in the step and an id within a typo of the broken one, then emits role / label / text / test-id / css candidates with a confidence | runs anywhere, no network, CI default; also the baseline the model is compared with |
| `anthropic` | official SDK, `client.messages.parse` with `output_config.format = zodOutputFormat(CandidatesSchema)` so the JSON contract is enforced by the API; typed errors (`AuthenticationError`, `RateLimitError`, `APIError`) are turned into clear messages; `response.usage` is reported | `ANTHROPIC_API_KEY` is set |
| `claude-cli` | spawns `claude -p <prompt> --output-format json --model <id> --max-turns 1` with `CLAUDECODE` removed from the environment (a nested CLI refuses to start otherwise) and a temp cwd (so the CLI does not load this repository as context); parses the JSON envelope, extracts the first `{…}` from `result`, validates with the same schema; reports `total_cost_usd` and `usage` | a developer machine logged in to Claude Code without an API key |
| `auto` (default) | `anthropic` if `ANTHROPIC_API_KEY` is set, else `claude-cli` if a `claude` executable is on `PATH`, else `offline` | |

The model id comes from `--model` or `SELF_HEAL_MODEL` (default `claude-opus-5-5`).

### 3.5 Prompt caching and the context budget

- The system prompt is identical for every failure and sits first, so the SDK backend can cache it; it is
  shorter than the minimum cacheable prefix on its own, which is why the next step (8.3) is to move the
  trimmed DOM of a page into a cached block shared by all failures on that page - in this repo all four
  failures are on the same page, so three of the four DOM payloads would be cache reads.
- Budgets are explicit (`DEFAULT_BUDGET`: 25 000 DOM chars, 4 000 aria chars) and reported per failure in
  the healing report, so cost is predictable: roughly 10 000 input tokens and a few hundred output tokens per
  failure with the SDK backend (the CLI backend adds its own context, see 6.2). `max_tokens` is 16 000 so a long rationale is never cut off.
- Only the failing step's context is sent: no feature file, no step definitions, no page object source.

## 4. Validation before applying a fix

A suggestion is only as good as the check that follows it. `tools/self-heal/validate.ts` runs every
candidate through the gates below; a candidate is **validated** only when it passes all of them.

| Gate | How | Outcome |
| --- | --- | --- |
| Buildable | role must be an ARIA role Playwright accepts; CSS must parse | otherwise rejected ("invalid locator") |
| Unique in the saved DOM | the snapshot is loaded into a headless Chromium page with `page.route('**/*', r => r.abort())` (no network, no site JS) and `page.setContent(html)`; `locator.count()` must be exactly 1 | 0 or ≥ 2 matches are rejected |
| Same kind of element | the matched element's tag and implicit ARIA role (`roles.ts`) are checked against the intent: an input stays an input, a link stays a link, a heading stays a heading | a candidate that finds the right words in the wrong element is rejected |
| Visible | `locator.isVisible()` on the snapshot | **advisory only**: the snapshot has no site CSS, so hidden-by-CSS elements look visible |
| Unique on the live page (`--live`) | the real page is opened once and the uniqueness check is repeated for every candidate that passed the snapshot | rejected if not exactly 1 on the live page; if the page cannot be opened the report says "live check skipped" instead of pretending |

Validated candidates are ranked by the locator policy first (role > label > text > test id > placeholder >
css) and by confidence second; the top one becomes the proposed fix.

### 4.1 What a reviewer sees

- `proposed-fixes.patch` - a unified diff that replaces only the locator expression on its page-object line
  (receiver and indentation untouched; `patch -p1 --dry-run < reports/self-healing/proposed-fixes.patch`).
- `healing-report.md` - per failure: scenario, step, original locator and source line, error class, intent,
  context size, provider/model and token or cost usage, every candidate with its validation results, the
  chosen fix with its rationale and confidence.
- `healing-report.json` - the same data for tooling (e.g. a PR comment bot).

### 4.2 `--apply`: re-run before keeping anything

With `--apply` the tool replaces the exact original line, runs that one scenario with
`npx cucumber-js --profile selfHealing --name "^<escaped scenario>$"`, and keeps the edit only when the run
exits 0 - otherwise the file is restored byte for byte. The profile's own report files are preserved across
the re-run, and everything is logged to `apply-demo.log`.

### 4.3 Guardrails

- **Never auto-apply in CI.** The CI job runs `npm run heal -- --provider offline` and uploads the patch as an
  artefact; a human opens the PR. `--apply` is a local, opt-in convenience.
- **Confidence is shown, not trusted.** Validation decides; confidence only orders equally valid candidates.
  A reasonable policy is to require ≥ 0.7 before a fix is even proposed as "ready".
- **One line, one locator.** The patch never touches anything but the broken expression; refactors stay human.
- **Audit log.** Provider, model, usage/cost, prompt sizes and every candidate verdict are in the report, so
  a reviewer can see why a locator changed; the apply log records every edit, re-run and revert.
- **Cost limits.** `--max-failures` caps model calls; context budgets cap tokens per call; the CLI backend
  has a hard 240 s timeout and is killed on expiry.
- **No secrets in output.** The SDK backend reads `ANTHROPIC_API_KEY` from the environment and never logs it.

## 5. How to run

```bash
npm run test:self-healing                       # 4 scenarios, 4 expected failures; writes reports/self-healing/
npm run heal -- --provider offline              # propose + validate, no model, no network
npm run heal -- --provider claude-cli --live    # Claude Code CLI backend, re-check uniqueness on the live page
npm run heal -- --provider anthropic            # Anthropic SDK backend (needs ANTHROPIC_API_KEY)
npm run heal -- --provider offline --apply --max-failures 1   # patch the first failure, re-run it, keep or revert
npm run heal -- --help
```

Options: `--report <path>` (default `reports/self-healing/cucumber-report.json`), `--provider auto|anthropic|claude-cli|offline`
(default `SELF_HEAL_PROVIDER`), `--model <id>` (default `SELF_HEAL_MODEL`), `--live`, `--apply`, `--out <dir>`,
`--max-failures <n>`. Exit code 0 when every locator failure has a validated candidate, 1 otherwise.

## 6. Worked example (real runs, 28 Oct 2026)

`npm run test:self-healing`: `4 scenarios (4 failed), 25 steps (17 passed, 4 skipped, 4 failed)` in 57 s; the
17 passing steps are the healthy locators around each broken one.

### 6.1 `npm run heal -- --provider offline` (`healing-report.offline.md`)

| # | Scenario | Error class | Chosen fix | Confidence |
| --- | --- | --- | --- | --- |
| 1 | Switch to the Personal Loan tab | locator-not-found | `getByRole('link', { name: 'Personal Loan', exact: true })` | 1.00 |
| 2 | Enter an interest rate | ambiguous | `getByRole('textbox', { name: 'Interest Rate', exact: true })` | 0.77 |
| 3 | Enter a loan amount | locator-not-found | `getByRole('textbox', { name: 'Home Loan Amount', exact: true })` | 1.00 |
| 4 | Read the Loan EMI result | locator-not-found | `getByRole('heading', { name: 'Loan EMI', exact: true })` | 0.77 |

12 candidates were proposed, 11 validated; the one rejection was `getByText('Home Loan EMI Calculator', { exact: true })`
("matches 2 elements in the saved DOM"), which is exactly the kind of near-miss the uniqueness gate exists
for. Failure 2 in full, as the report prints it:

```
- Failing step: `When I type "9.5" into the interest rate field`
- Original locator: `locator('xpath=(//div[contains(@class,"form-group")])[3]//input')` (xpath), call `locator.fill`
- Source: `tests/pages/self-healing/BrittleEmiCalculatorPage.ts:40` (expression match)
- Error class: **ambiguous** - Strict mode violation: the locator resolved to 3 elements, so it is not specific enough.
- Inferred intent: action=fill, roles=textbox|searchbox|spinbutton|combobox, tags=input
- Context sent: trimmed DOM 25088 of 350344 chars, 1848 candidate elements, 15 containers

| Rank | Strategy | Playwright code                                                   | Conf. | Snapshot | Compatible | Visible | Verdict   |
| 1    | role     | this.page.getByRole('textbox', { name: 'Interest Rate', exact: true }) | 0.77 | 1   | yes        | yes     | validated |
| 2    | label    | this.page.getByLabel('Interest Rate', { exact: true })            | 0.73  | 1        | yes        | yes     | validated |
| 3    | css      | this.page.locator('#loaninterest')                                | 0.58  | 1        | yes        | yes     | validated |
```

and the corresponding hunk of `proposed-fixes.offline.patch`:

```diff
   get interestRateField(): Locator {
-    return this.page.locator('xpath=(//div[contains(@class,"form-group")])[3]//input');
+    return this.page.getByRole('textbox', { name: 'Interest Rate', exact: true });
   }
```

### 6.2 `npm run heal -- --provider claude-cli --live` (`healing-report.claude-cli.md`)

One run, first attempt, model `claude-opus-5-5` through the Claude Code CLI; every candidate was also
checked on the live https://emicalculator.net/ page (live matches = 1 for all 15 validated candidates).

| # | Candidates | Validated | Chosen fix (same as offline) | Model confidence | Usage per call | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 4 | 4 | `getByRole('link', { name: 'Personal Loan', exact: true })` | 0.93 | cache write 52 903, output 675, 12.8 s | $0.4367 |
| 2 | 4 | 4 | `getByRole('textbox', { name: 'Interest Rate', exact: true })` | 0.95 | cache read 13 741, cache write 40 670, output 357, 9.5 s | $0.3353 |
| 3 | 4 | 4 | `getByRole('textbox', { name: 'Home Loan Amount', exact: true })` | 0.75 | cache read 13 741, cache write 40 056, output 523, 11.4 s | $0.3337 |
| 4 | 3 | 3 | `getByRole('heading', { name: 'Loan EMI', exact: true })` | 0.93 | cache read 13 741, cache write 40 665, output 511, 10.9 s | $0.3383 |

Total: **$1.44** for four failures. The model's rationales were specific and correct, e.g. for #1
"exact matching excludes the 'Personal Loan Options' ad link", and for #4 "exactly one level-4 heading named
'Loan EMI' in the payment summary, which is the result heading the stale 'Loan EMI Amount' text meant".

Two things worth noticing:

- **The model disagreed with the policy on #3, and it was right to.** It gave `locator('#loanamount')` 0.97
  and the role locator only 0.75, with the rationale "its label includes the selected product and will change
  on the Personal or Car Loan tabs". The ranking still proposed the role locator because the policy orders
  strategies before confidence; the reviewer reads the candidates table, sees both validated, and picks the
  stable id. This is the human-review step working as designed, and a candidate for confidence-aware
  ranking (8.1).
- **The CLI backend is ~5x more expensive than the SDK would be.** Each call wrote ~40 000 tokens to the
  prompt cache and read ~13 700 (calls 2-4), i.e. ~54 000 input tokens per failure, of which our own prompt is
  roughly 10 000; the rest is Claude Code's system prompt and tool definitions. The SDK backend sends only
  our prompt.

### 6.3 `npm run heal -- --provider offline --apply --max-failures 1` (`apply-demo.log`)

```
APPLY tests/pages/self-healing/BrittleEmiCalculatorPage.ts:29
  - return this.page.locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a');
  + return this.page.getByRole('link', { name: 'Personal Loan', exact: true });
RUN npx cucumber-js --profile selfHealing --name "^Switch to the Personal Loan tab \(positional CSS locator\)$"
  | 1 scenario (1 passed)
  | 6 steps (6 passed)
KEEP tests/pages/self-healing/BrittleEmiCalculatorPage.ts:29 (scenario passed)
```

The page object was then restored by hand so the exercise stays reproducible (the four locators are still
broken in the repository).

## 7. Limitations and next steps

1. **Policy versus stability (confidence-aware ranking).** As 6.2 shows, the best locator by policy is not
   always the most stable one. Next: let a validated lower-ranked candidate win when the provider's confidence
   exceeds the policy winner's by a margin, and let the offline heuristic detect state-dependent names by
   comparing the snapshots of different scenarios (the loan-amount label differs between them).
2. **No golden-snapshot diff yet.** Detection relies on error signatures and intent; a DOM diff against the
   last green run (2.3) would separate "test bug" from "page changed" before any model call.
3. **Prompt caching across failures.** All four failures are on one page, yet each SDK call would send the
   DOM again; a shared cached block per page would cut input cost by roughly 70 % for this suite.
4. **The snapshot has no CSS.** Visibility is advisory and `getByRole` on the snapshot can see elements the
   live page hides; `--live` covers the latter but needs network access and the page's default state.
5. **Single-line source mapping.** A locator split over several lines, built from variables, or declared
   twice under `tests/pages/` is reported but not patched. A TypeScript AST (ts-morph) would make this robust.
6. **One page object per failure, one failure per scenario.** Only the first failed step of a scenario is
   analysed; after a fix the scenario may reveal a second broken locator, so re-run and heal again.
7. **Heuristic recall.** The offline provider is lexical: it finds typos, stale copy and positional
   selectors whose step text names the target, but not a renamed element with no textual link to the step.
8. **Model non-determinism and cost.** The CLI backend returned the same chosen fixes as the heuristic this
   time; that is not guaranteed, which is why validation, not the model, has the final say. Budget: ~$0.35
   per failure via the CLI, far less via the SDK; `--max-failures` caps spend.
9. **Only Playwright error shapes are parsed.** Custom assertion helpers that hide the locator in their
   message are classified as not-a-locator-failure and left alone, on purpose.
