@api @health
Feature: Service health

  As an operator of the Audience Analytics API
  I want a liveness probe that answers quickly with a stable shape
  So that deployments and test runs can tell a healthy instance from a broken one

  Scenario: A running instance reports that it is healthy
    When I check the service health
    Then the response status should be 200
    And the response should match the Health schema
    And the response content type should be JSON
    And the response should carry a request id header

  Scenario: The probe tolerates a cache-busting query parameter
    When I check the service health with parameters:
      | t | 1730000000 |
    Then the response status should be 200
    And the response should match the Health schema

  # A smoke check, not a performance SLA: the measured duration is attached to the report and only a
  # pathologically slow probe (an instance that is up but stuck) fails the generous budget.
  Scenario: The probe answers within a generous smoke-check budget
    When I check the service health
    Then the response status should be 200
    And the measured response time should be within the 5000 ms smoke budget
