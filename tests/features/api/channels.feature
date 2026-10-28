@api @channels
Feature: Channel catalogue

  As an analytics consumer
  I want to list the channels we measure, filter them by market and delivery type, and look one up
  So that dashboards can offer the right channel pickers and resolve a channel id to its details

  The list is small enough not to be paginated. Expected results are computed from the committed
  dataset (api/data/channels.json), never from the API itself, so a wrong filter or sort order is
  caught even when the response is well-formed.

  Scenario: Listing without filters returns every channel ordered by name
    When I list channels
    Then the response status should be 200
    And the response should match the ChannelList schema
    And the channel list should match the dataset for the same query
    And the channels should be sorted by "name" ascending
    And the reported total should equal the number of channels returned

  Scenario Outline: Channels can be filtered by <filter>
    When I list channels with parameters:
      | <filter> | <value> |
    Then the response status should be 200
    And the response should match the ChannelList schema
    And every returned channel should have <filter> "<value>"
    And the channel list should match the dataset for the same query

    Examples:
      | filter  | value  |
      | country | GB     |
      | country | DE     |
      | country | FR     |
      | type    | linear |
      | type    | vod    |

  Scenario Outline: Channels can be sorted by <field> <direction>
    When I list channels sorted by "<field>" <direction>
    Then the response status should be 200
    And the channels should be sorted by "<field>" <direction>
    And the channel list should match the dataset for the same query

    Examples:
      | field      | direction  |
      | name       | ascending  |
      | name       | descending |
      | launchedAt | ascending  |
      | launchedAt | descending |

  Scenario: A filter and a sort order can be combined
    When I list channels filtered by country "GB" sorted by "launchedAt" descending
    Then the response status should be 200
    And every returned channel should have country "GB"
    And the channels should be sorted by "launchedAt" descending
    And the channel list should match the dataset for the same query

  Scenario: A combination that matches nothing is an empty list, not an error
    When I list channels with parameters:
      | country | FR     |
      | type    | linear |
    Then the response status should be 200
    And the response should match the ChannelList schema
    And the channel list should contain 0 channels

  Scenario: A channel can be fetched by its id
    When I fetch the channel "ch_003"
    Then the response status should be 200
    And the response should match the Channel schema
    And the channel should equal the dataset entry for "ch_003"

  Scenario Outline: A malformed channel id is rejected before any lookup
    When I fetch the channel "<id>"
    Then the response status should be 400
    And the response should match the ErrorEnvelope schema
    And the error code should be "INVALID_ID"
    And the error details should mention the field "id"

    Examples:
      | id      |
      | ch_1    |
      | CH_001  |
      | ch_0001 |
      | prg_001 |
      | 001     |

  Scenario: A well-formed id with no channel behind it is not found
    When I fetch the channel "ch_999"
    Then the response status should be 404
    And the response should match the ErrorEnvelope schema
    And the error code should be "NOT_FOUND"
