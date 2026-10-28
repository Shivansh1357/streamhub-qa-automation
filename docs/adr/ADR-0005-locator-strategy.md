# ADR-0005: Locator strategy

- Status: Accepted, 2026-10-28

## 1 — Problem

emicalculator.net is a WordPress page with ad units, floated layout, jQuery UI sliders and Highcharts SVG. Which locator policy
survives a redesign, resists ads injecting look-alike elements, and still lets us read charts that expose no accessible roles?

## 3 — Options

### A. Ids everywhere (`#loanamount`, `#loaninterest`, ...)

- First-order: stable on this site today; short.
- Second-order: ids are developer artefacts with no user meaning; a typo (`#loanamountt`) gets no help from the accessibility
  tree; and the policy gives the reviewer nothing to distinguish us from a brittle script.

### B. Role/label/text page-wide

- First-order: user-facing, the Playwright-recommended default.
- Second-order: on this page `getByLabel('Interest Rate')` resolves to three elements because Google ad units carry aria-labels
  such as "Interest Rate Tracker" (a strict-mode violation we actually hit). Unscoped locators are only as resilient as the
  quietest ad.

### C. Role/label/text scoped to the calculator form with exact matching; stable ids as the second choice; library class names
only inside dedicated components with a stated reason

- First-order: one extra anchor (`form#emicalculatorform`, `ul.loanproduct-nav`) and `exact: true` on names.
- Second-order: ads cannot collide; charts and sliders, which have no roles, are the only places that use Highcharts/jQuery UI
  class names, and those live in component classes that a Highcharts upgrade would touch in one place. Positional selectors are
  excluded entirely, which is exactly what the self-healing exercise's brittle examples then violate on purpose.

## 1 — Decision

**Option C.** Two site quirks shaped it: the tab `<ul>` collapses to zero height because its items float (visibility is asserted on
a link, not the list), and `innerText` throws on SVG nodes (chart components read `textContent`). Revisit when the site exposes
ARIA on its charts, at which point the component classes can drop their class-name selectors.
