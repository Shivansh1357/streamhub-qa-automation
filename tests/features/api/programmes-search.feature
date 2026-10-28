@api @programmes
Feature: Programme search and lookup

  As an analytics consumer
  I want to narrow the programme catalogue by channel, genre, rating and title, and fetch a single programme
  So that I can find the programmes behind an audience figure without downloading the whole catalogue

  Every expected result is derived from api/data/programmes.json by applying the documented rules
  (filter, then sort, then page) independently of the API, so the oracle never trusts the response.

  Scenario: Listing with no parameters uses the documented defaults
    When I list programmes
    Then the response status should be 200
    And the response should match the ProgrammeList schema
    And the page meta should report page 1 and limit 10
    And the page meta should report sort "title"
    And the reported total should equal the number of programmes in the dataset
    And the page should contain 10 programmes
    And the programme page should match the dataset for the same query

  Scenario Outline: Programmes can be filtered by channel <channelId>
    When I list programmes on channel "<channelId>"
    Then the response status should be 200
    And every returned programme should belong to channel "<channelId>"
    And the programme page should match the dataset for the same query

    Examples:
      | channelId |
      | ch_001    |
      | ch_005    |
      | ch_008    |

  Scenario Outline: Programmes can be filtered by genre <genre>
    When I list programmes in genre "<genre>"
    Then the response status should be 200
    And every returned programme should have genre "<genre>"
    And the programme page should match the dataset for the same query

    Examples:
      | genre       |
      | drama       |
      | news        |
      | sport       |
      | documentary |
      | comedy      |
      | kids        |
      | reality     |

  Scenario Outline: A minimum rating of <minRating> is inclusive
    When I list programmes rated at least <minRating>
    Then the response status should be 200
    And every returned programme should be rated at least <minRating>
    And the programme page should match the dataset for the same query

    Examples:
      | minRating |
      | 8.4       |
      | 7.5       |
      | 9         |
      | 0         |

  Scenario: A minimum rating above every programme yields an empty page rather than an error
    When I list programmes rated at least 10
    Then the response status should be 200
    And the response data should be empty
    And the reported total should be 0

  Scenario Outline: Title search "<q>" is a case-insensitive substring match
    When I search programmes for "<q>"
    Then the response status should be 200
    And every returned programme title should contain "<q>" ignoring case
    And the reported total should be <total>
    And the programme page should match the dataset for the same query

    Examples:
      | q         | total |
      | morning   | 3     |
      | MORNING   | 3     |
      | MoRnInG   | 3     |
      | late      | 2     |
      | The       | 5     |

  Scenario: Surrounding whitespace in the search term is ignored
    When I search programmes for "   late   "
    Then the response status should be 200
    And every returned programme title should contain "late" ignoring case
    And the reported total should be 2
    And the programme page should match the dataset for the same query

  Scenario: A search that matches nothing is an empty page
    When I search programmes for "zzzz"
    Then the response status should be 200
    And the response data should be empty
    And the reported total should be 0

  Scenario: All filters can be combined and narrow the result together
    When I list programmes with parameters:
      | channelId | ch_001 |
      | genre     | news   |
      | minRating | 7.5    |
      | q         | report |
    Then the response status should be 200
    And every returned programme should belong to channel "ch_001"
    And every returned programme should have genre "news"
    And every returned programme should be rated at least 7.5
    And every returned programme title should contain "report" ignoring case
    And the page should contain exactly the programmes "prg_005"
    And the programme page should match the dataset for the same query

  Scenario: A programme can be fetched by id together with its channel
    When I fetch the programme "prg_012"
    Then the response status should be 200
    And the response should match the ProgrammeDetail schema
    And the programme should equal the dataset entry for "prg_012"
    And the embedded channel should match the programme's channel in the dataset

  Scenario Outline: A malformed programme id is rejected before any lookup
    When I fetch the programme "<id>"
    Then the response status should be 400
    And the response should match the ErrorEnvelope schema
    And the error code should be "INVALID_ID"
    And the error details should mention the field "id"

    Examples:
      | id       |
      | prg_1    |
      | PRG_001  |
      | prg_0001 |
      | ch_001   |

  Scenario: A well-formed id with no programme behind it is not found
    When I fetch the programme "prg_999"
    Then the response status should be 404
    And the response should match the ErrorEnvelope schema
    And the error code should be "NOT_FOUND"
