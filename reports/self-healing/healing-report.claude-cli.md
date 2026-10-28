# Self-healing locator report

- Generated: 2026-10-28T14:48:16.522Z
- Source report: `reports/self-healing/cucumber-report.json`
- Provider: **claude-cli** (requested (/Users/shivansh/.local/bin/claude)); model: `claude-opus-5-5`
- Live validation against the real page: yes; apply mode: no
- Command: `npm run heal -- --provider claude-cli --live`

## Summary

| # | Scenario | Error class | Original locator | Chosen fix | Confidence | Status |
|---|----------|-------------|------------------|------------|------------|--------|
| 1 | Switch to the Personal Loan tab (positional CSS locator) | locator-not-found | `locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a')` | `this.page.getByRole('link', { name: 'Personal Loan', exact: true })` | 0.93 | fix proposed |
| 2 | Enter an interest rate (index-based XPath locator) | ambiguous | `locator('xpath=(//div[contains(@class,"form-group")])[3]//input')` | `this.page.getByRole('textbox', { name: 'Interest Rate', exact: true })` | 0.95 | fix proposed |
| 3 | Enter a loan amount (typo in the id locator) | locator-not-found | `locator('#loanamountt')` | `this.page.getByRole('textbox', { name: 'Home Loan Amount', exact: true })` | 0.75 | fix proposed |
| 4 | Read the Loan EMI result (stale text locator) | locator-not-found | `getByText('Loan EMI Amount', { exact: true })` | `this.page.getByRole('heading', { name: 'Loan EMI', exact: true })` | 0.93 | fix proposed |

## 1. Switch to the Personal Loan tab (positional CSS locator)

- Feature: EMI calculator - deliberately brittle locators (self-healing exercise) (`tests/features/self-healing/brittle-locators.feature:13`)
- Failing step: `When I choose the "Personal Loan" loan product tab` (step definition `tests/steps/self-healing/brittle.steps.ts:23`)
- Original locator: `locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a')` (css), call `locator.click`
- Source: `tests/pages/self-healing/BrittleEmiCalculatorPage.ts:29` (expression match)
- Error class: **locator-not-found** - Playwright waited for the locator and it never resolved to an element.
- Inferred intent: action=click, roles=link|tab, tags=a
- Context sent: trimmed DOM 25070 of 445888 chars, 1848 candidate elements, 15 containers
- Provider: claude-cli / `claude-opus-5-5`; usage: input 2, cache write 52903, output 675, cost $0.4367, 12.8s

```
locator.click: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a')
```

### Candidates

| Rank | Strategy | Playwright code | Confidence | Snapshot matches | Compatible | Visible | Live matches | Verdict | Notes |
|------|----------|-----------------|------------|------------------|------------|---------|--------------|---------|-------|
| 1 | role | `this.page.getByRole('link', { name: 'Personal Loan', exact: true })` | 0.93 | 1 | yes | yes | 1 | validated | - |
| 2 | text | `this.page.getByText('Personal Loan', { exact: true })` | 0.72 | 1 | yes | yes | 1 | validated | - |
| 3 | css | `this.page.locator('#personal-loan > a')` | 0.90 | 1 | yes | yes | 1 | validated | - |
| 4 | css | `this.page.locator('ul.loanproduct-nav #personal-loan a')` | 0.85 | 1 | yes | yes | 1 | validated | - |

### Chosen fix

`this.page.getByRole('link', { name: 'Personal Loan', exact: true })` (confidence 0.93)

Rationale: The accessibility tree exposes the tab as a link named exactly "Personal Loan", and exact matching excludes the "Personal Loan Options" ad link.

```diff
- return this.page.locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a');
+ return this.page.getByRole('link', { name: 'Personal Loan', exact: true });
```

## 2. Enter an interest rate (index-based XPath locator)

- Feature: EMI calculator - deliberately brittle locators (self-healing exercise) (`tests/features/self-healing/brittle-locators.feature:17`)
- Failing step: `When I type "9.5" into the interest rate field` (step definition `tests/steps/self-healing/brittle.steps.ts:31`)
- Original locator: `locator('xpath=(//div[contains(@class,"form-group")])[3]//input')` (xpath), call `locator.fill`
- Source: `tests/pages/self-healing/BrittleEmiCalculatorPage.ts:40` (expression match)
- Error class: **ambiguous** - Strict mode violation: the locator resolved to 3 elements, so it is not specific enough.
- Inferred intent: action=fill, roles=textbox|searchbox|spinbutton|combobox, tags=input
- Context sent: trimmed DOM 25088 of 350344 chars, 1848 candidate elements, 15 containers
- Provider: claude-cli / `claude-opus-5-5`; usage: input 2, cache read 13741, cache write 40670, output 357, cost $0.3353, 9.5s

```
locator.fill: Error: strict mode violation: locator('xpath=(//div[contains(@class,"form-group")])[3]//input') resolved to 3 elements:
    1) <input value="20" type="text" id="loanterm" name="loanterm" class="form-control"/> aka getByRole('textbox', { name: 'Loan Tenure' })
    2) <input type="radio" tabindex="4" id="loanyears" name="loantenure" value="loanyears" checked="checked" autocomplete="off"/> aka getByRole('radio', { name: 'Yr' })
    3) <input type="radio" tabindex="5" id="loanmonths" name="loantenure" value="loanmonths" autocomplete="off"/> aka getByRole('radio', { name: 'Mo' })

Call log:
  - waiting for locator('xpath=(//div[contains(@class,"form-group")])[3]//input')
```

### Candidates

| Rank | Strategy | Playwright code | Confidence | Snapshot matches | Compatible | Visible | Live matches | Verdict | Notes |
|------|----------|-----------------|------------|------------------|------------|---------|--------------|---------|-------|
| 1 | role | `this.page.getByRole('textbox', { name: 'Interest Rate', exact: true })` | 0.95 | 1 | yes | yes | 1 | validated | - |
| 2 | label | `this.page.getByLabel('Interest Rate', { exact: true })` | 0.92 | 1 | yes | yes | 1 | validated | - |
| 3 | css | `this.page.locator('#loaninterest')` | 0.93 | 1 | yes | yes | 1 | validated | - |
| 4 | css | `this.page.locator('input[name="loaninterest"]')` | 0.88 | 1 | yes | yes | 1 | validated | - |

### Chosen fix

`this.page.getByRole('textbox', { name: 'Interest Rate', exact: true })` (confidence 0.95)

Rationale: The input's accessible name comes from its <label for="loaninterest">Interest Rate</label>, and the aria snapshot shows only one textbox with that name.

```diff
- return this.page.locator('xpath=(//div[contains(@class,"form-group")])[3]//input');
+ return this.page.getByRole('textbox', { name: 'Interest Rate', exact: true });
```

## 3. Enter a loan amount (typo in the id locator)

- Feature: EMI calculator - deliberately brittle locators (self-healing exercise) (`tests/features/self-healing/brittle-locators.feature:21`)
- Failing step: `When I type "30,00,000" into the loan amount field` (step definition `tests/steps/self-healing/brittle.steps.ts:39`)
- Original locator: `locator('#loanamountt')` (css), call `locator.fill`
- Source: `tests/pages/self-healing/BrittleEmiCalculatorPage.ts:47` (expression match)
- Error class: **locator-not-found** - Playwright waited for the locator and it never resolved to an element.
- Inferred intent: action=fill, roles=textbox|searchbox|spinbutton|combobox, tags=input|textarea
- Context sent: trimmed DOM 25088 of 446165 chars, 1848 candidate elements, 14 containers
- Provider: claude-cli / `claude-opus-5-5`; usage: input 2, cache read 13741, cache write 40056, output 523, cost $0.3337, 11.4s

```
locator.fill: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#loanamountt')
```

### Candidates

| Rank | Strategy | Playwright code | Confidence | Snapshot matches | Compatible | Visible | Live matches | Verdict | Notes |
|------|----------|-----------------|------------|------------------|------------|---------|--------------|---------|-------|
| 1 | role | `this.page.getByRole('textbox', { name: 'Home Loan Amount', exact: true })` | 0.75 | 1 | yes | yes | 1 | validated | - |
| 2 | label | `this.page.getByLabel('Home Loan Amount', { exact: true })` | 0.70 | 1 | yes | yes | 1 | validated | - |
| 3 | css | `this.page.locator('#loanamount')` | 0.97 | 1 | yes | yes | 1 | validated | - |
| 4 | css | `this.page.locator('[name="loanamount"]')` | 0.90 | 1 | yes | yes | 1 | validated | - |

### Chosen fix

`this.page.getByRole('textbox', { name: 'Home Loan Amount', exact: true })` (confidence 0.75)

Rationale: This is the accessible textbox the user sees, but its label includes the selected product and will change on the Personal or Car Loan tabs.

```diff
- return this.page.locator('#loanamountt');
+ return this.page.getByRole('textbox', { name: 'Home Loan Amount', exact: true });
```

## 4. Read the Loan EMI result (stale text locator)

- Feature: EMI calculator - deliberately brittle locators (self-healing exercise) (`tests/features/self-healing/brittle-locators.feature:25`)
- Failing step: `Then the Loan EMI result heading should be visible` (step definition `tests/steps/self-healing/brittle.steps.ts:51`)
- Original locator: `getByText('Loan EMI Amount', { exact: true })` (text), call `expect(locator).toBeVisible()`
- Source: `tests/pages/self-healing/BrittleEmiCalculatorPage.ts:58` (expression match)
- Error class: **locator-not-found** - The expectation found no element for the locator.
- Inferred intent: action=assert, roles=heading
- Context sent: trimmed DOM 25088 of 260567 chars, 1848 candidate elements, 17 containers
- Provider: claude-cli / `claude-opus-5-5`; usage: input 2, cache read 13741, cache write 40665, output 511, cost $0.3383, 10.9s

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Loan EMI Amount', { exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
```

### Candidates

| Rank | Strategy | Playwright code | Confidence | Snapshot matches | Compatible | Visible | Live matches | Verdict | Notes |
|------|----------|-----------------|------------|------------------|------------|---------|--------------|---------|-------|
| 1 | role | `this.page.getByRole('heading', { name: 'Loan EMI', exact: true })` | 0.93 | 1 | yes | yes | 1 | validated | - |
| 2 | text | `this.page.getByText('Loan EMI', { exact: true })` | 0.78 | 1 | yes | yes | 1 | validated | - |
| 3 | css | `this.page.locator('#emiamount h4')` | 0.85 | 1 | yes | yes | 1 | validated | - |

### Chosen fix

`this.page.getByRole('heading', { name: 'Loan EMI', exact: true })` (confidence 0.93)

Rationale: The accessibility tree shows exactly one level-4 heading named "Loan EMI" in the payment summary, which is the result heading the stale "Loan EMI Amount" text meant.

```diff
- return this.page.getByText('Loan EMI Amount', { exact: true });
+ return this.page.getByRole('heading', { name: 'Loan EMI', exact: true });
```
