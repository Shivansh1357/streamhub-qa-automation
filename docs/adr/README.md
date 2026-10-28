# Architecture Decision Records

Every non-obvious decision in this repository is recorded here so a reviewer can see not just *what* was built but *why*,
and what was consciously given up.

**Format: 1 / 3 / 1.** Each record states **one** problem, weighs **three** options, and lands on **one** decision.
For every option the record separates the **first-order effect** (what happens immediately) from the **second-order effect**
(what that leads to later: for the next engineer, for CI, for the reviewer, for the moment the system under test changes).
The decision section lists the consequences we accept and the trigger that would make us revisit it.

| ADR | Decision |
| --- | --- |
| [0001](ADR-0001-section-b-over-section-a.md) | Complete Section B (API + UI on a third-party site) rather than Section A |
| [0002](ADR-0002-cucumber-with-playwright-library.md) | Cucumber-js on top of the Playwright library, TypeScript via ts-node transpile-only |
| [0003](ADR-0003-layering-and-tag-driven-fixtures.md) | Feature → step → page object / API client layering with tag-driven fixtures |
| [0004](ADR-0004-environment-configuration.md) | Typed environment loader with committed per-environment files |
| [0005](ADR-0005-locator-strategy.md) | Role/label locators scoped to the form, ids second, chart classes confined |
| [0006](ADR-0006-independent-oracles.md) | Every assertion has an oracle computed independently of the system under test |
| [0007](ADR-0007-driving-sliders-like-a-user.md) | Sliders are driven by clicks and keys, never by setting values |
| [0008](ADR-0008-chart-assertions-from-the-dom.md) | Chart values come from rendered labels and tooltips, cross-checked against the page's own tables |
| [0009](ADR-0009-api-strictness-and-error-contract.md) | Express 5 + zod, unknown parameters rejected, one error envelope, 405 with `Allow` |
| [0010](ADR-0010-sql-on-postgresql-with-executable-tests.md) | PostgreSQL, executable tests over the same `.sql` files, documented interpretations |
| [0011](ADR-0011-self-healing-isolation-and-safety.md) | Brittle suite isolated in its own profile; healing proposes, validates, never auto-applies |
| [0012](ADR-0012-evidence-and-reporting-policy.md) | Commit reports and SQL evidence, ignore raw artifacts, viewport screenshots |
| [0013](ADR-0013-ai-assisted-development-workflow.md) | AI as pair programmer under contracts, verification gates and independent review |
| [0014](ADR-0014-ci-pipeline-shape.md) | One CI job per suite, UI retried once in CI only, self-healing demo on demand |
