# ADR-0008: Chart assertions from the rendered DOM

- Status: Accepted, 2026-10-28

## 1 — Problem

The pie and bar charts are Highcharts SVG with no accessible roles. The brief asks us to verify visibility, extract both pie
values, count the bars and validate a tooltip. Which source of truth do we read?

## 3 — Options

### A. Inspect Highcharts' JavaScript model (`Highcharts.charts[n].series[0].data`)

- First-order: exact numbers, no SVG parsing.
- Second-order: it verifies the data model, not what a user sees; a chart that failed to render would still "pass"; the test is
  coupled to a page global that any Highcharts upgrade may move.

### B. Visual regression (screenshot comparison)

- First-order: proves rendering.
- Second-order: ad slots, animations and font differences make it brittle, and a pixel diff cannot tell the reviewer that the
  interest slice is 36.9 %.

### C. Read the rendered DOM: data labels for the pie percentages, hover each slice and bar for its tooltip, count bars inside the
series group, read axis years; cross-check against the summary tiles and the payment schedule table

- First-order: Highcharts class names (confined to `PieChart` / `BarChart` with a comment), SVG quirks (`textContent` rather than
  `innerText`), and a lesson learnt: the naive `rect.highcharts-point` count was 44 on a 21-year chart because legend symbols
  are also points.
- Second-order: assertions describe what the user sees and are cross-validated against independent numbers on the same page
  (tooltip ₹69,756 equals the 2029 schedule row), so a mismatch between chart and table is detected. Screenshots are attached as
  evidence, not used as oracles.

## 1 — Decision

**Option C.** Consequences accepted: the chart components are the only files allowed to depend on Highcharts internals.
Revisit when Highcharts' accessibility module is enabled on the site; then role-based reads replace the class names.
