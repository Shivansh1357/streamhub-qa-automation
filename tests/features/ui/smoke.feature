@ui @smoke
Feature: Framework smoke test

  Scenario: The EMI calculator home page loads
    Given I open the EMI calculator
    Then the page title should contain "EMI Calculator"
