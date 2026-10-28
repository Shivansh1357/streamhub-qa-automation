# ADR-0001: Complete Section B rather than Section A

- Status: Accepted, 2026-10-28
- Decider: Shivansh Tripathi (Claude Code as pair programmer)

## 1 — Problem

The brief allows either Section A (build a small web app, test it, test JSONPlaceholder, SQL) or Section B (build a small API,
test it, test emicalculator.net with Cucumber, SQL). Which one produces the strongest evidence for a QA automation role, given
the reviewer has limited time?

## 3 — Options

### A. Section A — build and test my own web app

- First-order: full control over the DOM (my own `data-testid`s), deterministic, fast to make green.
- Second-order: locator resilience is never really tested because I chose every hook myself; the JSONPlaceholder API accepts
  anything and returns `201`, so its "negative" tests can only document that validation does not exist. The reviewer sees a toy
  being tested by its author.

### B. Section B — build an API, automate a live third-party page

- First-order: harder UI work (jQuery UI sliders, Highcharts SVG, a date picker, ad units) and a dependency on a site I do not
  control, which can be slow or change.
- Second-order: synchronisation, locator scoping and chart extraction are exactly the skills an analytics company's QA team uses
  daily, and the API half still shows full-stack ability. The flake risk has to be engineered away (web-first waits, scoped
  locators, retries in CI, traces), which is itself evidence.

### C. Both sections

- First-order: maximum coverage.
- Second-order: doubles the review surface, dilutes depth, and ignores an explicit instruction ("complete either A or B"), which
  reads as poor judgement rather than extra effort.

## 1 — Decision

**Section B.** Consequences accepted: an external dependency in the UI suite, mitigated by a 20-second assertion budget, locators
scoped away from ad units, one retry in CI only, and trace/DOM artifacts on failure. Revisit if the page changes so much that the
self-healing tool cannot keep the page objects current, in which case a hosted mirror of the page becomes the test target.
