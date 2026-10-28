@api @programmes
Feature: Programme sort order

  As an analytics consumer paging through programmes
  I want every sort option to produce one deterministic, total order
  So that consecutive pages never skip or repeat a programme

  The contract promises code-unit string ordering (identical on every machine) and that ties are
  broken by id ascending even for descending sorts. The expected order is produced independently
  from api/data/programmes.json with those same rules, and the whole catalogue is requested on one
  page (the maximum page size) so the complete order is checked at once.

  Scenario Outline: Programmes can be sorted by <field> <direction>
    When I list all programmes sorted by "<field>" <direction>
    Then the response status should be 200
    And the response should match the ProgrammeList schema
    And the page meta should report sort "<sort>"
    And the programmes should be sorted by "<field>" <direction>
    And the programme page should match the dataset for the same query

    Examples:
      | field        | direction  | sort          |
      | title        | ascending  | title         |
      | title        | descending | -title        |
      | firstAiredAt | ascending  | firstAiredAt  |
      | firstAiredAt | descending | -firstAiredAt |
      | rating       | ascending  | rating        |
      | rating       | descending | -rating       |

  Scenario: Equal ratings are broken by id ascending even when sorting descending
    When I list all programmes sorted by "rating" descending
    Then the response status should be 200
    And programmes with equal "rating" should be ordered by id ascending
    And the programmes rated 8.4 should appear in the order "prg_006, prg_017, prg_040"

  Scenario: Title ascending is the default sort
    When I list programmes
    Then the response status should be 200
    And the page meta should report sort "title"
    And the programmes should be sorted by "title" ascending

  Scenario: Sorting applies within a filtered set
    When I list programmes with parameters:
      | genre | sport   |
      | sort  | -rating |
      | limit | 50      |
    Then the response status should be 200
    And every returned programme should have genre "sport"
    And the programmes should be sorted by "rating" descending
    And the programme page should match the dataset for the same query
