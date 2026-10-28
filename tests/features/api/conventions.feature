@api @conventions
Feature: Cross-cutting HTTP conventions

  As an API consumer and as the operator who reads its logs
  I want every response, successful or not, to follow the same HTTP conventions
  So that clients can handle errors uniformly and a request can be traced end to end

  This feature deliberately works at the HTTP level (raw paths and methods) because the
  behaviour under test is the surface itself: read-only routes answer 405 with an Allow header,
  unknown routes answer 404 with the standard envelope, every response is JSON with a request id,
  and hostile input never produces a 5xx or reflected markup.

  Scenario: An unknown route is reported with the standard error envelope
    When I request GET "/api/v1/unknown"
    Then the response status should be 404
    And the response should match the ErrorEnvelope schema
    And the error code should be "NOT_FOUND"
    And the response content type should be JSON
    And the response should carry a request id header

  Scenario: An absurdly long path is still answered with a clean 404
    When I request an unknown route 5000 characters long
    Then the response status should be 404
    And the response should match the ErrorEnvelope schema
    And the error code should be "NOT_FOUND"

  Scenario: A path that cannot be percent-decoded is a client error, not a crash
    When I request GET "/api/v1/channels/%E0%A4"
    Then the response status should be 400
    And the response should match the ErrorEnvelope schema
    And the error code should be "VALIDATION_ERROR"

  Scenario Outline: <method> is refused on <path> because the API is read-only
    When I send a <method> request to "<path>"
    Then the response status should be 405
    And the response should match the ErrorEnvelope schema
    And the error code should be "METHOD_NOT_ALLOWED"
    And the Allow header should be "GET"

    Examples:
      | method | path                       |
      | POST   | /health                    |
      | DELETE | /health                    |
      | POST   | /api/v1/channels           |
      | DELETE | /api/v1/channels           |
      | POST   | /api/v1/channels/ch_001    |
      | DELETE | /api/v1/channels/ch_001    |
      | PATCH  | /api/v1/channels/ch_001    |
      | POST   | /api/v1/programmes         |
      | DELETE | /api/v1/programmes         |
      | POST   | /api/v1/programmes/prg_001 |
      | DELETE | /api/v1/programmes/prg_001 |
      | PUT    | /api/v1/programmes/prg_001 |
      | POST   | /api/v1/audience/summary   |
      | DELETE | /api/v1/audience/summary   |

  Scenario Outline: <description> is JSON and carries a request id
    When I request GET "<path>"
    Then the response status should be <status>
    And the response content type should be JSON
    And the response should carry a request id header

    Examples:
      | description          | path                                              | status |
      | A successful list    | /api/v1/channels                                  | 200    |
      | A single resource    | /api/v1/programmes/prg_001                        | 200    |
      | An aggregate         | /api/v1/audience/summary?from=2026-01-01&to=2026-01-07 | 200    |
      | A validation error   | /api/v1/programmes?limit=0                        | 400    |
      | A malformed id       | /api/v1/channels/ch_1                             | 400    |
      | A missing resource   | /api/v1/channels/ch_999                           | 404    |
      | An unknown route     | /api/v1/nothing-here                              | 404    |

  Scenario: A well-formed incoming request id is echoed back for tracing
    When I check the service health with the request id "qa-run-0042.alpha_beta"
    Then the response status should be 200
    And the response request id should be "qa-run-0042.alpha_beta"

  Scenario: A malformed incoming request id is replaced with a generated one
    When I check the service health with the request id "not a safe id!"
    Then the response status should be 200
    And the response request id should be a generated UUID

  Scenario Outline: A search for <description> never breaks the service or reflects markup
    When I search programmes for "<q>"
    Then the response should not be a server error
    And the response content type should be JSON
    And the response text should not contain "<script"

    Examples:
      | description         | q                           |
      | unicode symbols     | ☃☃                          |
      | accented letters    | Lumière                     |
      | emoji               | 😀😀                        |
      | an html tag         | <script>alert(1)</script>   |
      | query delimiters    | a&b=c                       |
      | a percent sign      | 100%                        |
      | an sql fragment     | '; DROP TABLE programmes;-- |
      | a path traversal    | ../../etc/passwd            |
