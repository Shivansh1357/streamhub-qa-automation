@api @validation
Feature: Request validation

  As an API consumer
  I want every malformed, out-of-range or unknown query parameter rejected with a 400 that names the field
  So that a typo such as "genere=news" can never silently return the wrong numbers

  The contract says validation never produces a 5xx, always uses the standard error envelope with
  code VALIDATION_ERROR, and lists every offending parameter in details[] so a client can fix a
  request in one round-trip. Numbers are coerced strictly: "1.5", "abc" and "" are not integers.

  Rule: Programme listing parameters are validated strictly

    Scenario Outline: <param>=<value> is rejected
      When I list programmes with parameters:
        | <param> | <value> |
      Then the response status should be 400
      And the response should match the ErrorEnvelope schema
      And the error code should be "VALIDATION_ERROR"
      And the error details should mention the field "<param>"

      Examples: page size outside 1..50 or not an integer
        | param | value |
        | limit | 0     |
        | limit | 51    |
        | limit | abc   |
        | limit | 1.5   |
        | limit | -1    |

      Examples: page number below 1 or not an integer
        | param | value |
        | page  | 0     |
        | page  | -1    |
        | page  | abc   |
        | page  | 1.5   |

      Examples: rating outside 0..10 or not a number
        | param     | value |
        | minRating | 11    |
        | minRating | -1    |
        | minRating | foo   |

      Examples: values outside the documented vocabulary
        | param     | value   |
        | genre     | unknown |
        | channelId | ch_1    |
        | channelId | CH_001  |
        | sort      | foo     |
        | sort      | -foo    |

      Examples: search term shorter than 2 characters
        | param | value |
        | q     | a     |

      Examples: parameters the endpoint does not know
        | param  | value |
        | genere | news  |
        | offset | 10    |

    Scenario: A single-programme lookup accepts no query parameters at all
      When I fetch the programme "prg_001" with parameters:
        | expand | channel |
      Then the response status should be 400
      And the response should match the ErrorEnvelope schema
      And the error code should be "VALIDATION_ERROR"
      And the error details should mention the field "expand"

    Scenario: A search term longer than 50 characters is rejected
      When I search programmes for a title of 51 characters
      Then the response status should be 400
      And the error code should be "VALIDATION_ERROR"
      And the error detail for field "q" should say "must be at most 50 characters"

    Scenario Outline: A search term of <length> characters sits inside the allowed range
      When I search programmes for a title of <length> characters
      Then the response status should be 200
      And the response should match the ProgrammeList schema

      Examples:
        | length |
        | 2      |
        | 50     |

    Scenario: An empty value is a validation error, not an absent parameter
      When I list programmes with parameters:
        | limit |  |
      Then the response status should be 400
      And the error code should be "VALIDATION_ERROR"
      And the error details should mention the field "limit"

    Scenario: A repeated parameter is rejected rather than silently picking one value
      When I list programmes with the "genre" parameter repeated as "news" and "drama"
      Then the response status should be 400
      And the error code should be "VALIDATION_ERROR"
      And the error details should mention the field "genre"

    Scenario: Every invalid parameter is reported in a single response
      When I list programmes with parameters:
        | page      | abc |
        | limit     | 51  |
        | minRating | 11  |
        | foo       | bar |
      Then the response status should be 400
      And the error code should be "VALIDATION_ERROR"
      And the error details should mention the fields:
        | page      |
        | limit     |
        | minRating |
        | foo       |

  Rule: Channel listing parameters are validated strictly

    Scenario Outline: <param>=<value> is rejected
      When I list channels with parameters:
        | <param> | <value> |
      Then the response status should be 400
      And the response should match the ErrorEnvelope schema
      And the error code should be "VALIDATION_ERROR"
      And the error details should mention the field "<param>"

      Examples:
        | param   | value  |
        | country | gbr    |
        | country | gb     |
        | country | G1     |
        | type    | cable  |
        | sort    | foo    |
        | sort    | -genre |
        | region  | GB     |

    Scenario: A single-channel lookup accepts no query parameters at all
      When I fetch the channel "ch_001" with parameters:
        | fields | name |
      Then the response status should be 400
      And the response should match the ErrorEnvelope schema
      And the error code should be "VALIDATION_ERROR"
      And the error details should mention the field "fields"

    Scenario: Several bad channel parameters are reported together
      When I list channels with parameters:
        | country | gb    |
        | type    | cable |
        | sort    | foo   |
      Then the response status should be 400
      And the error details should mention the fields:
        | country |
        | type    |
        | sort    |

  Rule: Audience summary parameters are validated strictly

    Scenario Outline: <description> is rejected
      When I request an audience summary with parameters:
        | from    | <from>  |
        | to      | <to>    |
        | <param> | <value> |
      Then the response status should be 400
      And the response should match the ErrorEnvelope schema
      And the error code should be "VALIDATION_ERROR"
      And the error details should mention the field "<field>"

      Examples:
        | description                        | from       | to         | param     | value   | field     |
        | a start date after the end date    | 2026-03-01 | 2026-02-01 | groupBy   | channel | from      |
        | an impossible calendar day         | 2026-02-30 | 2026-03-01 | groupBy   | channel | from      |
        | an impossible month                | 2026-01-01 | 2026-13-01 | groupBy   | channel | to        |
        | a date in the wrong format         | 01/01/2026 | 2026-01-31 | groupBy   | channel | from      |
        | a span of 367 days                 | 2025-03-29 | 2026-03-31 | groupBy   | channel | to        |
        | a span of well over a year         | 2025-01-01 | 2026-03-31 | groupBy   | channel | to        |
        | an unknown grouping                | 2026-01-01 | 2026-01-31 | groupBy   | foo     | groupBy   |
        | a malformed channel id             | 2026-01-01 | 2026-01-31 | channelId | ch_1    | channelId |
        | a parameter the endpoint lacks     | 2026-01-01 | 2026-01-31 | region    | GB      | region    |

    Scenario: A missing start date is reported as required
      When I request an audience summary with parameters:
        | to | 2026-01-31 |
      Then the response status should be 400
      And the error code should be "VALIDATION_ERROR"
      And the error detail for field "from" should say "is required"

    Scenario: A missing end date is reported as required
      When I request an audience summary with parameters:
        | from | 2026-01-01 |
      Then the response status should be 400
      And the error code should be "VALIDATION_ERROR"
      And the error detail for field "to" should say "is required"

    Scenario: Both dates missing are reported together
      When I request an audience summary with parameters:
        | groupBy | genre |
      Then the response status should be 400
      And the error details should mention the fields:
        | from |
        | to   |

    Scenario: Every invalid summary parameter is reported in a single response
      When I request an audience summary with parameters:
        | from      | yesterday |
        | to        | 2026-02-30 |
        | groupBy   | week      |
        | channelId | ch_1      |
        | extra     | 1         |
      Then the response status should be 400
      And the error details should mention the fields:
        | from      |
        | to        |
        | groupBy   |
        | channelId |
        | extra     |
