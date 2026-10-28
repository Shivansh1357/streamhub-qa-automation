@ui
Feature: EMI calculator page
  The calculator at the configured UI base URL opens on the Home Loan product with a worked example,
  so a reviewer can see results before touching any control.

  Scenario: The calculator loads with the Home Loan tab active and default results
    Given I open the EMI calculator
    Then the "Home Loan" tab should be active
    And the loan summary should show an EMI, total interest and total payment greater than zero
