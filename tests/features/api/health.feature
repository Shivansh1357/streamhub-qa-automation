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

  Scenario: The probe answers promptly
    When I check the service health
    Then the response status should be 200
    And the response time should be under 1000 ms
