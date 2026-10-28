-- =============================================================================
-- Scenario 2 (alternative interpretation): consecutive TEAM FIXTURES
--
-- Same question as 02_scoring_streaks.sql, but "consecutive matches" means
-- consecutive fixtures of the player's team. A fixture the player did not bat in
-- (absent, or did not bat) counts as a non-scoring match and BREAKS the streak.
--
-- This reading is stricter and is the one to use if the business question is
-- "did the player deliver in every one of three straight games for the team".
-- Seed player P06 (Ishaan Mehra) qualifies under 02 but not here, because he
-- missed fixture M06 between two 30+ innings.
--
-- Technique: build the full fixture list per player (players x their team's
-- matches), LEFT JOIN the innings so missing ones become NULL, then apply the
-- same gaps-and-islands numbering over the fixture sequence.
-- =============================================================================
WITH fixtures AS (
  SELECT
    p.player_id,
    m.match_id,
    m.match_date,
    bs.runs,
    COALESCE(bs.runs >= 30, FALSE) AS reached_30,   -- no innings -> did not reach 30
    ROW_NUMBER() OVER (PARTITION BY p.player_id ORDER BY m.match_date, m.match_id) AS fixture_no
  FROM players AS p
  JOIN matches AS m
    ON p.team IN (m.home_team, m.away_team)
  LEFT JOIN batting_scores AS bs
    ON bs.match_id = m.match_id
   AND bs.player_id = p.player_id
),
islands AS (
  SELECT
    fixtures.*,
    fixture_no
      - ROW_NUMBER() OVER (PARTITION BY player_id, reached_30 ORDER BY match_date, match_id) AS island
  FROM fixtures
)
SELECT
  p.player_name,
  MIN(f.match_date) AS streak_start_date,
  MAX(f.match_date) AS streak_end_date,
  COUNT(*)          AS matches_in_streak,
  SUM(f.runs)       AS runs_in_streak
FROM islands AS f
JOIN players AS p ON p.player_id = f.player_id
WHERE f.reached_30
GROUP BY p.player_id, p.player_name, f.island
HAVING COUNT(*) >= 3
ORDER BY p.player_name, streak_start_date;
