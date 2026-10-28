-- =============================================================================
-- Streamhub QA Assessment - Section B4 schema
--
-- Two independent domains share one database so a single `psql -f` sets up both
-- SQL scenarios:
--   * payments  : accounts, transactions          (scenario 1 - round-trip transfers)
--   * cricket   : players, matches, batting_scores (scenario 2 - scoring streaks)
--
-- The file is idempotent: it drops and recreates everything, so it can be run
-- against a dirty database (and is run before every automated scenario).
-- =============================================================================

-- Quiet the "table does not exist, skipping" notices on a fresh database.
SET client_min_messages = WARNING;

BEGIN;

DROP TABLE IF EXISTS batting_scores CASCADE;
DROP TABLE IF EXISTS matches        CASCADE;
DROP TABLE IF EXISTS players        CASCADE;
DROP TABLE IF EXISTS transactions   CASCADE;
DROP TABLE IF EXISTS accounts       CASCADE;

-- -----------------------------------------------------------------------------
-- Payments
-- -----------------------------------------------------------------------------
CREATE TABLE accounts (
  account_id   TEXT PRIMARY KEY,
  holder_name  TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('CURRENT', 'SAVINGS', 'BUSINESS'))
);

CREATE TABLE transactions (
  txn_id       TEXT PRIMARY KEY,
  from_account TEXT NOT NULL REFERENCES accounts (account_id),
  to_account   TEXT NOT NULL REFERENCES accounts (account_id),
  -- NUMERIC, never FLOAT: the 10% tolerance test must be exact at the boundary
  -- (0.10 * 2000.00 = 200.00 must compare equal to 2000.00 - 1800.00).
  amount       NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  -- TIMESTAMPTZ so the 24-hour window is evaluated on absolute instants rather
  -- than on wall-clock time that depends on the session's time zone.
  txn_time     TIMESTAMPTZ NOT NULL,
  reference    TEXT,
  CONSTRAINT transactions_no_self_transfer CHECK (from_account <> to_account)
);

-- The round-trip query looks up, for every transaction, the transactions that
-- flow in the opposite direction within a time range. Leading with the two
-- account columns (both equality predicates) and ending with txn_time (range
-- predicate) lets that lookup be an index range scan.
CREATE INDEX transactions_reverse_leg_idx ON transactions (to_account, from_account, txn_time);
CREATE INDEX transactions_txn_time_idx    ON transactions (txn_time);

-- -----------------------------------------------------------------------------
-- Cricket (synthetic IPL-style 2024 season)
-- -----------------------------------------------------------------------------
CREATE TABLE players (
  player_id   TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  team        TEXT NOT NULL
);

CREATE TABLE matches (
  match_id   TEXT PRIMARY KEY,
  match_date DATE NOT NULL,
  home_team  TEXT NOT NULL,
  away_team  TEXT NOT NULL,
  venue      TEXT NOT NULL,
  CONSTRAINT matches_distinct_teams CHECK (home_team <> away_team)
);

-- One row per innings a player actually batted in. A player who did not play,
-- or played but did not bat, simply has no row for that match.
CREATE TABLE batting_scores (
  match_id    TEXT    NOT NULL REFERENCES matches (match_id),
  player_id   TEXT    NOT NULL REFERENCES players (player_id),
  runs        INTEGER NOT NULL CHECK (runs >= 0),
  balls_faced INTEGER NOT NULL CHECK (balls_faced >= 0),
  dismissed   BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (match_id, player_id)
);

-- The streak query partitions by player; the PK leads with match_id so a
-- dedicated player index is needed to avoid a full scan per partition.
CREATE INDEX batting_scores_player_idx ON batting_scores (player_id);
CREATE INDEX matches_match_date_idx    ON matches (match_date);
CREATE INDEX matches_home_team_idx     ON matches (home_team);
CREATE INDEX matches_away_team_idx     ON matches (away_team);

COMMIT;
