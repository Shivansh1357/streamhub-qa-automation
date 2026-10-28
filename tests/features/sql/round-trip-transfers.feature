@sql
Feature: Round-trip transfers

  As a payments analyst
  I want to find money that leaves an account and comes straight back
  So that quick round trips and payment reversals can be reviewed

  A round trip is a transfer A -> B followed by a transfer B -> A that happens
  after it and no more than 24 hours later, for an amount within 10% of what A
  sent. Both limits are inclusive. The scenarios run sql/queries/01_round_trip_transfers.sql
  against sql/seed.sql, whose cases are documented in sql/README.md.

  Background:
    Given the analytics schema and seed data are loaded

  Scenario: Every round trip is reported once, with the earlier transfer as the original
    When I run the "01_round_trip_transfers" query
    Then the result should contain exactly these round trips:
      | original_txn | return_txn | account_a | account_b | amount_out | amount_back | hours_between | pct_difference |
      | TXN-101      | TXN-102    | AC-1001   | AC-1002   | 1000.00    | 980.00      | 6.50          | 2.00           |
      | TXN-201      | TXN-202    | AC-1003   | AC-1004   | 500.00     | 500.00      | 24.00         | 0.00           |
      | TXN-301      | TXN-302    | AC-1005   | AC-1006   | 2000.00    | 1800.00     | 12.00         | 10.00          |
      | TXN-401      | TXN-402    | AC-1007   | AC-1008   | 1250.00    | 1150.00     | 3.25          | 8.00           |
      | TXN-501      | TXN-502    | AC-1009   | AC-1010   | 750.00     | 700.00      | 3.00          | 6.67           |
      | TXN-501      | TXN-503    | AC-1009   | AC-1010   | 750.00     | 745.00      | 21.00         | 0.67           |

  Scenario Outline: The limits are inclusive - <case>
    When I run the "01_round_trip_transfers" query
    Then the round trips originating from transaction "<original_txn>" should be exactly:
      | return_txn   | hours_between   | pct_difference   |
      | <return_txn> | <hours_between> | <pct_difference> |

    Examples:
      | case                               | original_txn | return_txn | hours_between | pct_difference |
      | returned exactly 24 hours later    | TXN-201      | TXN-202    | 24.00         | 0.00           |
      | returned exactly 10 percent lower  | TXN-301      | TXN-302    | 12.00         | 10.00          |

  Scenario: A partial reversal within the tolerance is a round trip
    When I run the "01_round_trip_transfers" query
    Then the round trips originating from transaction "TXN-401" should be exactly:
      | return_txn | amount_out | amount_back | pct_difference |
      | TXN-402    | 1250.00    | 1150.00     | 8.00           |

  Scenario: A payment returned in two instalments inside 24 hours is reported once per return
    When I run the "01_round_trip_transfers" query
    Then the round trips originating from transaction "TXN-501" should be exactly:
      | return_txn | amount_out | amount_back | hours_between | pct_difference |
      | TXN-502    | 750.00     | 700.00      | 3.00          | 6.67           |
      | TXN-503    | 750.00     | 745.00      | 21.00         | 0.67           |

  Scenario Outline: Look-alike transfers are not reported - <reason>
    When I run the "01_round_trip_transfers" query
    Then transaction "<transaction>" should not appear in the result

    Examples:
      | reason                                           | transaction |
      | returned 25 hours later                          | TXN-601     |
      | returned 24 hours and one second later           | TXN-1301    |
      | returned 15 percent lower                        | TXN-701     |
      | returned 10.01 percent lower                     | TXN-1201    |
      | the same payment was sent twice in one direction | TXN-801     |
      | the money was forwarded to a third account       | TXN-901     |
      | the "reversal" was booked before the original    | TXN-1002    |
      | the money came back through a chain A->B->C->A   | TXN-1101    |

  Scenario: Every reported round trip satisfies the business rule
    When I run the "01_round_trip_transfers" query
    Then every reported return should happen after its original and within 24 hours
    And every reported return should be within 10 percent of the original amount
