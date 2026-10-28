@sql
Feature: Batting streaks of 30 or more runs

  As a performance analyst for the 2024 season
  I want to know which players scored 30+ runs in at least three consecutive matches
  So that in-form players can be highlighted together with the date their streak commenced

  "Consecutive" is taken to mean consecutive innings the player batted in
  (sql/queries/02_scoring_streaks.sql). The stricter reading, consecutive team
  fixtures where a missed match breaks the streak, is provided as
  sql/queries/02b_scoring_streaks_team_matches.sql and the two are compared below.
  The data set is synthetic and documented in sql/README.md.

  Background:
    Given the analytics schema and seed data are loaded

  Scenario: Every qualifying streak is reported with the date it commenced
    When I run the "02_scoring_streaks" query
    Then the result should contain exactly these streaks:
      | player_name      | streak_start_date | streak_end_date | matches_in_streak | runs_in_streak |
      | Arjun Vellore    | 2024-03-31        | 2024-04-12      | 3                 | 105            |
      | Devansh Kulkarni | 2024-04-12        | 2024-05-05      | 3                 | 90             |
      | Ishaan Mehra     | 2024-03-23        | 2024-04-14      | 3                 | 129            |
      | Rohan Dasgupta   | 2024-03-23        | 2024-04-24      | 5                 | 232            |
      | Siddharth Rao    | 2024-03-24        | 2024-04-07      | 3                 | 116            |
      | Siddharth Rao    | 2024-04-21        | 2024-05-21      | 3                 | 139            |

  Scenario: A streak of exactly three innings qualifies and ends when the player falls short
    When I run the "02_scoring_streaks" query
    Then the streaks for player "Arjun Vellore" should be exactly:
      | streak_start_date | streak_end_date | matches_in_streak | runs_in_streak |
      | 2024-03-31        | 2024-04-12      | 3                 | 105            |

  Scenario: A longer streak is reported as one row covering every innings in it
    When I run the "02_scoring_streaks" query
    Then the streaks for player "Rohan Dasgupta" should be exactly:
      | streak_start_date | streak_end_date | matches_in_streak | runs_in_streak |
      | 2024-03-23        | 2024-04-24      | 5                 | 232            |

  Scenario: A player with two separate streaks gets one row per streak
    When I run the "02_scoring_streaks" query
    Then the streaks for player "Siddharth Rao" should be exactly:
      | streak_start_date | streak_end_date | matches_in_streak | runs_in_streak |
      | 2024-03-24        | 2024-04-07      | 3                 | 116            |
      | 2024-04-21        | 2024-05-21      | 3                 | 139            |

  Scenario: Scoring exactly 30 counts towards a streak
    When I run the "02_scoring_streaks" query
    Then the streaks for player "Devansh Kulkarni" should be exactly:
      | streak_start_date | streak_end_date | matches_in_streak | runs_in_streak |
      | 2024-04-12        | 2024-05-05      | 3                 | 90             |

  Scenario Outline: Players without three consecutive 30+ innings are not reported - <reason>
    When I run the "02_scoring_streaks" query
    Then player "<player>" should not appear in the result

    Examples:
      | reason                                       | player        |
      | the streak was broken by an innings of 29    | Kabir Anand   |
      | batted in every match but never reached 30   | Vikram Sethi  |
      | only two consecutive innings of 30 or more   | Naveen Pillai |

  Scenario: A missed fixture between two 30+ innings does not break a streak of innings
    When I run the "02_scoring_streaks" query
    Then the streaks for player "Ishaan Mehra" should be exactly:
      | streak_start_date | streak_end_date | matches_in_streak | runs_in_streak |
      | 2024-03-23        | 2024-04-14      | 3                 | 129            |

  Scenario: Under the stricter team-fixture definition a missed fixture breaks the streak
    When I run the "02b_scoring_streaks_team_matches" query
    Then player "Ishaan Mehra" should not appear in the result
    And the result should contain exactly these streaks:
      | player_name      | streak_start_date | streak_end_date | matches_in_streak | runs_in_streak |
      | Arjun Vellore    | 2024-03-31        | 2024-04-12      | 3                 | 105            |
      | Devansh Kulkarni | 2024-04-12        | 2024-05-05      | 3                 | 90             |
      | Rohan Dasgupta   | 2024-03-23        | 2024-04-24      | 5                 | 232            |
      | Siddharth Rao    | 2024-03-24        | 2024-04-07      | 3                 | 116            |
      | Siddharth Rao    | 2024-04-21        | 2024-05-21      | 3                 | 139            |
