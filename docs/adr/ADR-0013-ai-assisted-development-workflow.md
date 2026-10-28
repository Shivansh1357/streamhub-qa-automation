# ADR-0013: AI-assisted development workflow

- Status: Accepted, 2026-10-28

## 1 — Problem

The brief expects Claude Code to be used throughout, "as a genuine pair programmer", and wants to know how. How do we get the
speed of AI-generated code without inheriting its failure modes (plausible-but-wrong selectors, invented APIs, confident
summaries of work that did not happen)?

## 3 — Options

### A. One long linear AI session that builds everything in sequence

- First-order: simple to run.
- Second-order: the context fills with every file ever read, each step gets slower and less reliable, and nothing checks the
  session's own claims.

### B. Describe the framework in plain language, scaffold a verified foundation first, then run parallel tracks (API, API tests,
UI, SQL, self-healing) on disjoint directories under explicit written contracts, with mandatory verification runs, an
independent review pass, and a security review on commits

- First-order: coordination overhead; contracts (the API spec, the DOM facts for the page objects) must be written before code.
- Second-order: the API tests could be designed against the contract rather than the implementation; two tracks were killed by
  upstream errors mid-task and the on-disk state, not their summaries, became the source of truth; the review pass found a real
  assertion bug, an OpenAPI schema error and a dropped SQL edge case before anything was published. AI output is treated as a
  draft until a command has executed it.

### C. Hand-write everything, use AI only for explanations

- First-order: maximum control.
- Second-order: slower, and it ignores what the brief explicitly asks to see.

## 1 — Decision

**Option B.** Working rules that came out of it: inspect the real DOM before writing a locator; never trust a count or a selector
until it has run; independent reviewers never edit, owners fix; every claim in the README is checked by running the command it
cites. The README's reflection section records what the assistant got wrong and how it was caught. Revisit the rules each time
a new failure mode appears; they are a living list.
