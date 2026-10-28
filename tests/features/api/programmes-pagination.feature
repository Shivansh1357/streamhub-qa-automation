@api @programmes
Feature: Programme pagination

  As an analytics consumer
  I want page metadata I can trust and pages that neither overlap nor leave gaps
  So that a client can walk the catalogue, or jump to a page, without losing programmes

  The dataset holds 40 programmes. Expected page counts are computed from that total and the
  requested page size (ceil(total / limit)); the contract says a page beyond the end is an empty
  200, not an error, and that `total` always describes the whole filtered set.

  Scenario Outline: With <limit> per page the catalogue spans <pages> pages
    When I request page 1 of programmes with <limit> per page
    Then the response status should be 200
    And the response should match the ProgrammeList schema
    And the page meta should report page 1 and limit <limit>
    And totalPages should be the dataset total divided by <limit> rounded up
    And the reported total should equal the number of programmes in the dataset
    And the page should contain <onPage> programmes
    And the programme page should match the dataset for the same query

    Examples: page sizes including both documented boundaries
      | limit | pages | onPage |
      | 1     | 40    | 1      |
      | 7     | 6     | 7      |
      | 10    | 4     | 10     |
      | 50    | 1     | 40     |

  Scenario: The last page holds only the remainder
    When I request page 6 of programmes with 7 per page
    Then the response status should be 200
    And the page should be the final page
    And the page should contain 5 programmes
    And the programme page should match the dataset for the same query

  Scenario Outline: A page beyond the end is empty but still describes the whole set
    When I request page <page> of programmes with 7 per page
    Then the response status should be 200
    And the response should match the ProgrammeList schema
    And the response data should be empty
    And the page meta should report page <page> and limit 7
    And the reported total should equal the number of programmes in the dataset
    And totalPages should be the dataset total divided by 7 rounded up

    Examples:
      | page |
      | 7    |
      | 1000 |

  Scenario: Walking every page visits each programme exactly once
    When I collect every page of programmes with 7 per page
    Then the number of collected pages should equal the reported totalPages
    And no two collected pages should share a programme
    And every programme in the dataset should appear exactly once across the collected pages

  Scenario: Pagination applies to the filtered set, not the whole catalogue
    When I list programmes with parameters:
      | genre | news |
      | limit | 3    |
      | page  | 3    |
    Then the response status should be 200
    And every returned programme should have genre "news"
    And the page should be the final page
    And the page should contain 2 programmes
    And the programme page should match the dataset for the same query
