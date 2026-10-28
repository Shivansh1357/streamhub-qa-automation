@ui
Feature: EMI pie chart on the Home Loan tab (Test Case 1)
  The EMI is recalculated independently in the test (EMI = P·r·(1+r)^n / ((1+r)^n − 1)) and compared with the
  figures the application displays. The pie chart's two sections (principal vs. total interest) must both be
  visible and greater than zero, and their percentages must agree with the independent calculation.

  Background:
    Given I open the EMI calculator
    And I navigate to the "Home Loan" tab

  Scenario Outline: Scenario <scenario> - validate the EMI and the payment break-up pie chart
    When I enter a loan amount of <amount>, an interest rate of <rate>% and a tenure of <years> years
    Then the displayed EMI should match the EMI calculated for the same inputs
    And the displayed total interest and total payment should match the calculated values
    And the pie chart should be visible
    And both sections of the pie chart should show values greater than zero
    And the pie chart sections should match the calculated principal and interest shares

    Examples:
      | scenario | amount  | rate | years |
      | A        | 2500000 | 10   | 10    |
      | B        | 5000000 | 7.5  | 15    |
