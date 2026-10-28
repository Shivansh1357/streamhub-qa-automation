@ui
Feature: EMI bar chart on the Personal Loan tab (Test Case 2)
  The loan is configured only through the sliders, the schedule start month is changed with the calendar
  widget, and the yearly payment bar chart is checked for visibility, bar count and tooltip values.
  Tooltip amounts are cross-checked against the payment schedule table for the same year.

  Scenario: Validate the yearly payment bar chart for a 10 lakh personal loan
    Given I open the EMI calculator
    And I navigate to the "Personal Loan" tab
    When I set the loan amount to 1000000 using the slider
    And I set the interest rate to 12% using the slider
    And I set the loan tenure to 5 years using the slider
    And I change the schedule start month to January of next year
    Then the bar chart should be visible
    And the bar chart should show 5 years of payments with 2 bars per year
    And the tooltip of a bar should show its year and amounts greater than zero
    And the tooltip amounts should match the payment schedule table for that year
