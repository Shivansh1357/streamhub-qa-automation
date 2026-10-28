# ADR-0007: Driving the sliders like a user

- Status: Accepted, 2026-10-28

## 1 — Problem

Test Case 2 requires the Personal Loan values (10L, 12 %, 5 years) to be set by interacting with the sliders. The sliders are
jQuery UI widgets with no ARIA role or value, bound to text inputs. How do we move them reliably without cheating?

## 3 — Options

### A. Fill the bound text inputs and tab away

- First-order: trivial and deterministic.
- Second-order: it is what Test Case 1 does, and it skips the requirement entirely; a reviewer comparing the two test cases
  would see no slider interaction at all.

### B. Set the widget's value through its API (`$('#slider').slider('value', x)` in `page.evaluate`)

- First-order: exact, no coordinate maths.
- Second-order: it tests jQuery UI's API, not the page; a broken drag handler or a hidden track would never be noticed, and the
  step is invisible to anyone watching the run.

### C. Click the track at the proportional position through the locator, then nudge with arrow keys until the bound input shows
the target, and assert the handle's `left: NN%`

- First-order: needs the slider's range (passed in by the page object; it can be cross-checked read-only against the widget),
  coordinate maths, and a bounded fine-tuning loop.
- Second-order: the widget is exercised the way a user does it, Playwright's actionability checks catch an ad overlay covering
  the track (review feedback moved the coarse click from `page.mouse` to `locator.click({ position })` for exactly this reason),
  and the handle-position assertion proves the slider itself moved, not just the input.

## 1 — Decision

**Option C** in `LoanSlider`. Consequences accepted: slider ranges per loan product live in the page objects and must change if
the site changes its limits. Revisit if the site adopts `<input type="range">` or ARIA slider roles; then `fill`/keyboard on the
accessible control replaces coordinate clicks.
