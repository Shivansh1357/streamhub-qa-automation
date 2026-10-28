# Self-healing locator report

- Generated: 2026-10-28T14:50:01.694Z
- Source report: `reports/self-healing/cucumber-report.json`
- Provider: **offline** (requested); model: `claude-opus-5-5`
- Live validation against the real page: no; apply mode: no
- Command: `npm run heal -- --provider offline`

## Summary

| # | Scenario | Error class | Original locator | Chosen fix | Confidence | Status |
|---|----------|-------------|------------------|------------|------------|--------|
| 1 | Switch to the Personal Loan tab (positional CSS locator) | locator-not-found | `locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a')` | `this.page.getByRole('link', { name: 'Personal Loan', exact: true })` | 1.00 | fix proposed |
| 2 | Enter an interest rate (index-based XPath locator) | ambiguous | `locator('xpath=(//div[contains(@class,"form-group")])[3]//input')` | `this.page.getByRole('textbox', { name: 'Interest Rate', exact: true })` | 0.77 | fix proposed |
| 3 | Enter a loan amount (typo in the id locator) | locator-not-found | `locator('#loanamountt')` | `this.page.getByRole('textbox', { name: 'Home Loan Amount', exact: true })` | 1.00 | fix proposed |
| 4 | Read the Loan EMI result (stale text locator) | locator-not-found | `getByText('Loan EMI Amount', { exact: true })` | `this.page.getByRole('heading', { name: 'Loan EMI', exact: true })` | 0.77 | fix proposed |

## 1. Switch to the Personal Loan tab (positional CSS locator)

- Feature: EMI calculator - deliberately brittle locators (self-healing exercise) (`tests/features/self-healing/brittle-locators.feature:13`)
- Failing step: `When I choose the "Personal Loan" loan product tab` (step definition `tests/steps/self-healing/brittle.steps.ts:23`)
- Original locator: `locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a')` (css), call `locator.click`
- Source: `tests/pages/self-healing/BrittleEmiCalculatorPage.ts:29` (expression match)
- Error class: **locator-not-found** - Playwright waited for the locator and it never resolved to an element.
- Inferred intent: action=click, roles=link|tab, tags=a
- Context sent: trimmed DOM 25070 of 445888 chars, 1848 candidate elements, 15 containers
- Provider: offline / `heuristic (no model)`; usage: 0.0s

```
locator.click: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a')
```

### Candidates

| Rank | Strategy | Playwright code | Confidence | Snapshot matches | Compatible | Visible | Live matches | Verdict | Notes |
|------|----------|-----------------|------------|------------------|------------|---------|--------------|---------|-------|
| 1 | role | `this.page.getByRole('link', { name: 'Personal Loan', exact: true })` | 1.00 | 1 | yes | yes | - | validated | - |
| 2 | text | `this.page.getByText('Personal Loan', { exact: true })` | 0.85 | 1 | yes | yes | - | validated | - |

Rationales:

1. getByRole keeps the link role the step relies on. Matched <div#emicalculatordashboard.col-sm-8 > ul.loanproduct-nav > li#personal-loan > a> (score 1.00): lexical match 0.77 to the step and the broken locator; its name equals "personal loan", quoted in the step.
2. The element is static text the user reads. Matched <div#emicalculatordashboard.col-sm-8 > ul.loanproduct-nav > li#personal-loan > a> (score 1.00): lexical match 0.77 to the step and the broken locator; its name equals "personal loan", quoted in the step.

### Chosen fix

`this.page.getByRole('link', { name: 'Personal Loan', exact: true })` (confidence 1.00)

Rationale: getByRole keeps the link role the step relies on. Matched <div#emicalculatordashboard.col-sm-8 > ul.loanproduct-nav > li#personal-loan > a> (score 1.00): lexical match 0.77 to the step and the broken locator; its name equals "personal loan", quoted in the step.

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
- Provider: offline / `heuristic (no model)`; usage: 0.0s

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
| 1 | role | `this.page.getByRole('textbox', { name: 'Interest Rate', exact: true })` | 0.77 | 1 | yes | yes | - | validated | - |
| 2 | label | `this.page.getByLabel('Interest Rate', { exact: true })` | 0.73 | 1 | yes | yes | - | validated | - |
| 3 | css | `this.page.locator('#loaninterest')` | 0.58 | 1 | yes | yes | - | validated | - |

Rationales:

1. getByRole keeps the textbox role the step relies on. Matched <div.sep > div.col-lg-6 > div.input-group > input#loaninterest.form-control> (score 0.77): lexical match 0.77 to the step and the broken locator.
2. The control has a visible <label>. Matched <div.sep > div.col-lg-6 > div.input-group > input#loaninterest.form-control> (score 0.77): lexical match 0.77 to the step and the broken locator.
3. Its id is short, human-readable and not generated. Matched <div.sep > div.col-lg-6 > div.input-group > input#loaninterest.form-control> (score 0.77): lexical match 0.77 to the step and the broken locator.

### Chosen fix

`this.page.getByRole('textbox', { name: 'Interest Rate', exact: true })` (confidence 0.77)

Rationale: getByRole keeps the textbox role the step relies on. Matched <div.sep > div.col-lg-6 > div.input-group > input#loaninterest.form-control> (score 0.77): lexical match 0.77 to the step and the broken locator.

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
- Provider: offline / `heuristic (no model)`; usage: 0.0s

```
locator.fill: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#loanamountt')
```

### Candidates

| Rank | Strategy | Playwright code | Confidence | Snapshot matches | Compatible | Visible | Live matches | Verdict | Notes |
|------|----------|-----------------|------------|------------------|------------|---------|--------------|---------|-------|
| 1 | role | `this.page.getByRole('textbox', { name: 'Home Loan Amount', exact: true })` | 1.00 | 1 | yes | yes | - | validated | - |
| 2 | label | `this.page.getByLabel('Home Loan Amount', { exact: true })` | 0.95 | 1 | yes | yes | - | validated | - |
| 3 | css | `this.page.locator('#loanamount')` | 0.75 | 1 | yes | yes | - | validated | - |

Rationales:

1. getByRole keeps the textbox role the step relies on. Matched <div.row > div.col-lg-6 > div.input-group > input#loanamount.form-control> (score 1.00): lexical match 0.77 to the step and the broken locator; id "loanamount" is within a typo of "loanamountt".
2. The control has a visible <label>. Matched <div.row > div.col-lg-6 > div.input-group > input#loanamount.form-control> (score 1.00): lexical match 0.77 to the step and the broken locator; id "loanamount" is within a typo of "loanamountt".
3. Its id is short, human-readable and not generated. Matched <div.row > div.col-lg-6 > div.input-group > input#loanamount.form-control> (score 1.00): lexical match 0.77 to the step and the broken locator; id "loanamount" is within a typo of "loanamountt".

### Chosen fix

`this.page.getByRole('textbox', { name: 'Home Loan Amount', exact: true })` (confidence 1.00)

Rationale: getByRole keeps the textbox role the step relies on. Matched <div.row > div.col-lg-6 > div.input-group > input#loanamount.form-control> (score 1.00): lexical match 0.77 to the step and the broken locator; id "loanamount" is within a typo of "loanamountt".

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
- Provider: offline / `heuristic (no model)`; usage: 0.0s

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
| 1 | role | `this.page.getByRole('heading', { name: 'Loan EMI', exact: true })` | 0.77 | 1 | yes | yes | - | validated | - |
| 2 | role | `this.page.getByRole('heading', { name: 'Home Loan EMI Calculator', exact: true })` | 0.50 | 1 | yes | yes | - | validated | - |
| 3 | text | `this.page.getByText('Loan EMI', { exact: true })` | 0.65 | 1 | yes | yes | - | validated | - |
| 4 | text | `this.page.getByText('Home Loan EMI Calculator', { exact: true })` | 0.42 | 2 | - | - | - | rejected | matches 2 elements in the saved DOM (must be exactly 1) |

Rationales:

1. getByRole keeps the heading role the step relies on. Matched <div.row > div#emipaymentsummary.col-sm-5 > div#emiamount > h4> (score 0.77): lexical match 0.77 to the step and the broken locator.
2. getByRole keeps the heading role the step relies on. Matched <ul.sow-features-list > li.sow-features-feature > div.textwidget > h5.sow-features-feature-title> (score 0.50): lexical match 0.50 to the step and the broken locator.
3. The element is static text the user reads. Matched <div.row > div#emipaymentsummary.col-sm-5 > div#emiamount > h4> (score 0.77): lexical match 0.77 to the step and the broken locator.
4. The element is static text the user reads. Matched <ul.sow-features-list > li.sow-features-feature > div.textwidget > h5.sow-features-feature-title> (score 0.50): lexical match 0.50 to the step and the broken locator.

### Chosen fix

`this.page.getByRole('heading', { name: 'Loan EMI', exact: true })` (confidence 0.77)

Rationale: getByRole keeps the heading role the step relies on. Matched <div.row > div#emipaymentsummary.col-sm-5 > div#emiamount > h4> (score 0.77): lexical match 0.77 to the step and the broken locator.

```diff
- return this.page.getByText('Loan EMI Amount', { exact: true });
+ return this.page.getByRole('heading', { name: 'Loan EMI', exact: true });
```
