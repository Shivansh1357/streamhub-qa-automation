# ADR-0011: Self-healing — isolation of the brittle suite and safety of the healer

- Status: Accepted, 2026-10-28

## 1 — Problem

The brief asks for 3–5 deliberately broken locators left in the test files, a design document, and optionally a working POC.
Broken tests in a submission are a paradox: how do we keep them broken without making the whole submission look broken, and
how do we let an AI propose source-code changes without creating a code-injection path?

## 3 — Options (where the brittle locators live)

### A. Inside the production page objects used by the real scenarios

- First-order: literally "in your test files".
- Second-order: the main run and CI go red; a reviewer cannot tell intended failures from accidents; every evidence report
  carries noise.

### B. A separate page object and feature, tagged `@self-healing`, excluded from the default profile and the main CI jobs,
with its own report directory

- First-order: one more profile and a tag filter.
- Second-order: the default run stays green and the exercise stays reproducible (`npm run test:self-healing` → 4 expected
  failures, then `npm run heal`); the committed failing report is itself evidence.

### C. Comment the brittle locators out

- First-order: nothing fails.
- Second-order: they are not "left broken", so the exercise is not done.

## 3 — Options (how the healer changes code)

### A. Let the model emit Playwright code and evaluate it

- Second-order: a prompt-injection string on the third-party page becomes arbitrary code in our repository.

### B. Structured candidates (`strategy`, `value`, `role`, `name`) turned into locators by a `switch`, validated for uniqueness and
role compatibility in the saved DOM and optionally on the live page, written as a patch; `--apply` is opt-in, re-runs the one
scenario and reverts on failure; the Claude CLI backend runs with tools, MCP servers and settings disabled

- Second-order: the model can only ever produce a bad candidate, which the validator rejects; humans review a diff with
  confidence and rationale; CI runs the offline heuristic only, so no cost and no automatic changes on the pipeline.

### C. Heuristic matching only, no model

- Second-order: cheap and deterministic, but it stops being an AI exercise; kept as the offline fallback so the tool runs anywhere.

## 1 — Decision

**B and B.** Consequences accepted: a second page object that intentionally duplicates a few locators; a healer that is a tool,
not a library, so its code quality is held to the same gates (strict TypeScript, ESLint, Prettier). Revisit if healing moves
into CI; then a confidence threshold, an audit log and a human approval step become mandatory before any patch is applied.
