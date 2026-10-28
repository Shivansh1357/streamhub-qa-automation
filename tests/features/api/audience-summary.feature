@api @audience
Feature: Audience summary

  As an audience analyst
  I want daily audience rows aggregated over a date range by channel, genre or day
  So that I can report reach and engagement for a period without summing raw rows myself

  Expected aggregates are recomputed from api/data/audience.json, programmes.json and
  channels.json: totalViewers is an exact sum, the two averages are plain arithmetic means over the
  matched daily rows (checked to within the API's documented rounding), programmes counts distinct
  programmes and meta.rows is the number of daily rows that fell inside the filter. The fixture
  covers 2026-01-01 to 2026-03-31 and has rows on both of those boundary days.

  Scenario Outline: The full quarter can be grouped by <groupBy>
    When I request an audience summary from "2026-01-01" to "2026-03-31" grouped by "<groupBy>"
    Then the response status should be 200
    And the response should match the AudienceSummary schema
    And the summary meta should echo the request
    And the summary rows should be sorted by key ascending
    And the summary rows should match the aggregates computed from the dataset

    Examples:
      | groupBy |
      | channel |
      | genre   |
      | date    |

  Scenario Outline: A single channel can be summarised by <groupBy>
    When I request an audience summary from "2026-01-01" to "2026-03-31" for channel "<channelId>" grouped by "<groupBy>"
    Then the response status should be 200
    And the response should match the AudienceSummary schema
    And the summary meta should echo the request
    And the summary rows should match the aggregates computed from the dataset

    Examples:
      | channelId | groupBy |
      | ch_002    | channel |
      | ch_002    | genre   |
      | ch_002    | date    |
      | ch_007    | genre   |

  Scenario: Grouping by channel is the default
    When I request an audience summary from "2026-02-01" to "2026-02-28"
    Then the response status should be 200
    And the summary meta should echo the request
    And the summary rows should match the aggregates computed from the dataset

  Scenario: Summarising one channel by channel yields exactly that channel
    When I request an audience summary from "2026-01-01" to "2026-03-31" for channel "ch_002"
    Then the response status should be 200
    And the summary should contain 1 row
    And the summary should include a row for key "ch_002" labelled "Thames Sports"

  Scenario: Rows are labelled with the channel name or the genre in title case
    When I request an audience summary from "2026-01-01" to "2026-03-31" grouped by "genre"
    Then the response status should be 200
    And the summary should include a row for key "documentary" labelled "Documentary"
    When I request an audience summary from "2026-01-01" to "2026-03-31" grouped by "channel"
    Then the summary should include a row for key "ch_003" labelled "Canal Lumière"

  Scenario: A range with no measured days is an empty summary, not an error
    When I request an audience summary from "2025-01-01" to "2025-01-31"
    Then the response status should be 200
    And the response should match the AudienceSummary schema
    And the summary should contain no rows
    And the summary meta should echo the request

  Scenario: A well-formed channel with no data is an empty summary, not an error
    When I request an audience summary from "2026-01-01" to "2026-03-31" for channel "ch_999"
    Then the response status should be 200
    And the summary should contain no rows

  Scenario Outline: A one-day range on the <boundary> boundary includes that day
    When I request an audience summary from "<day>" to "<day>"
    Then the response status should be 200
    And the summary should include a row for key "ch_001" labelled "Streamhub One"
    And the summary rows should match the aggregates computed from the dataset

    Examples:
      | boundary | day        |
      | first    | 2026-01-01 |
      | last     | 2026-03-31 |

  Scenario: Grouping by date only yields days inside the requested range
    When I request an audience summary from "2026-02-10" to "2026-02-20" grouped by "date"
    Then the response status should be 200
    And every summary row key should be a date between "2026-02-10" and "2026-02-20"
    And the summary rows should match the aggregates computed from the dataset

  Scenario: The maximum span of 366 days is accepted
    When I request an audience summary from "2025-03-30" to "2026-03-31"
    Then the response status should be 200
    And the summary rows should match the aggregates computed from the dataset
