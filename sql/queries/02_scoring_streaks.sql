-- =============================================================================
-- Scenario 2: scoring streaks (IPL-style 2024 season)
--
-- Players who scored 30+ runs in at least three consecutive matches, with the
-- date each streak commenced.
--
-- Interpretation of "consecutive"
--   This query treats "consecutive matches" as consecutive INNINGS THE PLAYER
--   BATTED IN, ordered by match date. A match the player did not play (or
--   played without batting) has no batting_scores row and is simply skipped;
--   it neither extends nor breaks a streak. This is how batting streaks are
--   usually quoted ("30+ in three consecutive innings") and it does not punish
--   a player for being rested or not being required to bat.
--
--   The alternative reading - consecutive TEAM FIXTURES, where a missed match
--   breaks the streak - is implemented in 02b_scoring_streaks_team_matches.sql.
--   Seed player P06 (Ishaan Mehra) is the case that separates the two.
--
-- Technique: gaps-and-islands
--   1. Number each player's innings in date order (innings_no).
--   2. Number the innings again, but only among innings that share the same
--      reached_30 flag (flag_no).
--   3. innings_no - flag_no is constant for every run of consecutive innings
--      with the same flag, so it identifies the "island". Grouping by it, keeping
--      only reached_30 islands, and HAVING COUNT(*) >= 3 yields the streaks.
--   match_id is a tie-breaker in the ORDER BY so the numbering is deterministic
--   even if a data set ever contained two innings on the same date.
--
-- Boundaries: 30 runs is inclusive (>= 30); a not-out innings counts the same as
-- any other. A player with two separate streaks gets one row per streak.
-- =============================================================================
WITH innings AS (
  SELECT
    bs.player_id,
    m.match_id,
    m.match_date,
    bs.runs,
    bs.runs >= 30 AS reached_30,
    ROW_NUMBER() OVER (PARTITION BY bs.player_id ORDER BY m.match_date, m.match_id) AS innings_no
  FROM batting_scores AS bs
  JOIN matches        AS m ON m.match_id = bs.match_id
),
islands AS (
  SELECT
    innings.*,
    innings_no
      - ROW_NUMBER() OVER (PARTITION BY player_id, reached_30 ORDER BY match_date, match_id) AS island
  FROM innings
)
SELECT
  p.player_name,
  MIN(i.match_date) AS streak_start_date,   -- the date the streak commenced
  MAX(i.match_date) AS streak_end_date,
  COUNT(*)          AS matches_in_streak,
  SUM(i.runs)       AS runs_in_streak
FROM islands AS i
JOIN players AS p ON p.player_id = i.player_id
WHERE i.reached_30
GROUP BY p.player_id, p.player_name, i.island
HAVING COUNT(*) >= 3
ORDER BY p.player_name, streak_start_date;
