@ui @self-healing
Feature: EMI calculator - deliberately brittle locators (self-healing exercise)

  These four scenarios are EXPECTED TO FAIL and are excluded from the default and CI profiles.
  Each one exercises exactly one deliberately broken locator in BrittleEmiCalculatorPage, and each
  also contains steps that use healthy locators, so the failure is clearly the locator and not the
  product. The failures, DOM snapshots and screenshots they produce are the input to `npm run heal`
  (see docs/SELF_HEALING.md).

  Background:
    Given the EMI calculator has loaded with its default Home Loan figures

  Scenario: Switch to the Personal Loan tab (positional CSS locator)
    When I choose the "Personal Loan" loan product tab
    Then the loan amount field should be labelled "Personal Loan Amount"

  Scenario: Enter an interest rate (index-based XPath locator)
    When I type "9.5" into the interest rate field
    Then the interest rate field should contain "9.5"

  Scenario: Enter a loan amount (typo in the id locator)
    When I type "30,00,000" into the loan amount field
    Then the loan amount field should contain "30,00,000"

  Scenario: Read the Loan EMI result (stale text locator)
    When I type "10" into the loan tenure field
    Then the Loan EMI result heading should be visible
    And the Loan EMI amount should be shown in rupees
