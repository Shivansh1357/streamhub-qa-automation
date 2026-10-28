-- =============================================================================
-- Streamhub QA Assessment - Section B4 seed data
--
-- Every row below exists to prove or disprove one business rule, and every
-- group is labelled with the expected outcome so a reviewer can check the
-- query output against this file by eye. All data is synthetic.
--
-- Conventions
--   * Transfers: the hundreds digit of a txn_id is the case number
--     (TXN-101/TXN-102 belong to case RT-1, TXN-1301/TXN-1302 to case DC-8,
--     TXN-1501/TXN-1502 to case RT-6). Every case sits on its own date, at
--     least three days away from any other case, so cases can never pair with
--     each other across the 24-hour window.
--   * Timestamps are written with an explicit +00 offset so the seed means the
--     same thing whatever the session time zone is.
--   * Cricket: an IPL-style 2024 season (22 March - 26 May 2024) with invented
--     teams and players. It is NOT real statistics.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------
INSERT INTO accounts (account_id, holder_name, account_type) VALUES
  ('AC-1001', 'Alice Carter',    'CURRENT'),
  ('AC-1002', 'Bob Mehta',       'SAVINGS'),
  ('AC-1003', 'Chen Wu',         'BUSINESS'),
  ('AC-1004', 'Dana Okafor',     'CURRENT'),
  ('AC-1005', 'Eli Novak',       'SAVINGS'),
  ('AC-1006', 'Farah Siddiqui',  'BUSINESS'),
  ('AC-1007', 'Grace Lindqvist', 'CURRENT'),
  ('AC-1008', 'Hiro Tanaka',     'SAVINGS'),
  ('AC-1009', 'Ines Moreau',     'CURRENT'),
  ('AC-1010', 'Jonah Reyes',     'BUSINESS');

-- -----------------------------------------------------------------------------
-- Transactions: POSITIVE cases - each MUST be reported by 01_round_trip_transfers
-- -----------------------------------------------------------------------------

-- RT-1  Plain round trip: 1000.00 out, 980.00 back 6h30m later (2.00% difference).
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-101', 'AC-1001', 'AC-1002', 1000.00, TIMESTAMPTZ '2024-03-01 09:00:00+00', 'RT-1 invoice 4471'),
  ('TXN-102', 'AC-1002', 'AC-1001',  980.00, TIMESTAMPTZ '2024-03-01 15:30:00+00', 'RT-1 refund 4471 less fee');

-- RT-2  Return exactly 24 hours later (inclusive upper bound of the window) -> hours_between = 24.00.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-201', 'AC-1003', 'AC-1004', 500.00, TIMESTAMPTZ '2024-03-04 10:00:00+00', 'RT-2 deposit'),
  ('TXN-202', 'AC-1004', 'AC-1003', 500.00, TIMESTAMPTZ '2024-03-05 10:00:00+00', 'RT-2 deposit returned');

-- RT-3  Return exactly 10% lower (inclusive tolerance bound): |1800 - 2000| = 200 = 0.10 * 2000.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-301', 'AC-1005', 'AC-1006', 2000.00, TIMESTAMPTZ '2024-03-08 08:00:00+00', 'RT-3 advance'),
  ('TXN-302', 'AC-1006', 'AC-1005', 1800.00, TIMESTAMPTZ '2024-03-08 20:00:00+00', 'RT-3 advance returned less 10%');

-- RT-4  Partial reversal of 92%: 1250.00 out, 1150.00 back 3h15m later (8.00% difference).
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-401', 'AC-1007', 'AC-1008', 1250.00, TIMESTAMPTZ '2024-03-12 09:00:00+00', 'RT-4 payment'),
  ('TXN-402', 'AC-1008', 'AC-1007', 1150.00, TIMESTAMPTZ '2024-03-12 12:15:00+00', 'RT-4 partial reversal');

-- RT-5  One payment, two qualifying returns inside 24h. Expected behaviour: BOTH returns
--       are reported, each paired with the same original (two result rows). The query
--       reports every candidate pair rather than guessing which return "belongs" to the
--       payment; de-duplication would be a separate business decision.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-501', 'AC-1009', 'AC-1010', 750.00, TIMESTAMPTZ '2024-03-16 09:00:00+00', 'RT-5 payment'),
  ('TXN-502', 'AC-1010', 'AC-1009', 700.00, TIMESTAMPTZ '2024-03-16 12:00:00+00', 'RT-5 first return (3h, 6.67%)'),
  ('TXN-503', 'AC-1010', 'AC-1009', 745.00, TIMESTAMPTZ '2024-03-17 06:00:00+00', 'RT-5 second return (21h, 0.67%)');

-- RT-6  Both legs posted at the IDENTICAL txn_time (e.g. a batch run). The window's lower
--       bound is a tie broken on txn_id: TXN-1501 (lower id) is the original, TXN-1502 the
--       return, and the pair is reported exactly once with hours_between = 0.00. A strict
--       "return after original" predicate would silently drop this round trip.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-1501', 'AC-1004', 'AC-1007', 450.00, TIMESTAMPTZ '2024-04-29 09:00:00+00', 'RT-6 batch payment'),
  ('TXN-1502', 'AC-1007', 'AC-1004', 441.00, TIMESTAMPTZ '2024-04-29 09:00:00+00', 'RT-6 batch reversal, same instant');

-- RT-7  Over-return of exactly 110% (inclusive upper tolerance bound): |1100 - 1000| = 100 = 0.10 * 1000.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-1601', 'AC-1003', 'AC-1006', 1000.00, TIMESTAMPTZ '2024-05-03 09:00:00+00', 'RT-7 payment'),
  ('TXN-1602', 'AC-1006', 'AC-1003', 1100.00, TIMESTAMPTZ '2024-05-03 17:00:00+00', 'RT-7 returned plus 10%');

-- -----------------------------------------------------------------------------
-- Transactions: NEGATIVE cases (decoys) - none of these may appear in the result
-- -----------------------------------------------------------------------------

-- DC-1  Return 25 hours later: amount identical but outside the 24-hour window.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-601', 'AC-1001', 'AC-1003', 900.00, TIMESTAMPTZ '2024-03-20 09:00:00+00', 'DC-1 payment'),
  ('TXN-602', 'AC-1003', 'AC-1001', 900.00, TIMESTAMPTZ '2024-03-21 10:00:00+00', 'DC-1 return after 25h');

-- DC-2  Return 15% lower: inside the window but outside the 10% tolerance.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-701', 'AC-1002', 'AC-1004', 1000.00, TIMESTAMPTZ '2024-03-24 09:00:00+00', 'DC-2 payment'),
  ('TXN-702', 'AC-1004', 'AC-1002',  850.00, TIMESTAMPTZ '2024-03-24 11:00:00+00', 'DC-2 return of 85%');

-- DC-3  Same direction twice: A pays B, then A pays B again. Nothing flows back.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-801', 'AC-1005', 'AC-1007', 400.00, TIMESTAMPTZ '2024-03-28 09:00:00+00', 'DC-3 first payment'),
  ('TXN-802', 'AC-1005', 'AC-1007', 400.00, TIMESTAMPTZ '2024-03-28 10:00:00+00', 'DC-3 duplicate payment');

-- DC-4  B forwards the money to a third account C instead of returning it to A.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-901', 'AC-1006', 'AC-1008', 600.00, TIMESTAMPTZ '2024-04-01 09:00:00+00', 'DC-4 payment A->B'),
  ('TXN-902', 'AC-1008', 'AC-1009', 600.00, TIMESTAMPTZ '2024-04-01 10:00:00+00', 'DC-4 forwarded B->C');

-- DC-5  The "reversal" happens BEFORE the original. B credits A 905.00 at 08:00, A pays B
--       1000.00 at 12:00. Measured against the 1000.00 leg the amounts are within 10%, so a
--       query that ignores direction (ABS(time difference) <= 24h) would report this pair with
--       a negative hours_between. Our window is directional, so that pairing is rejected; and
--       read forwards (905.00 first) the tolerance is 0.10 * 905.00 = 90.50, which 1000.00
--       exceeds. Net result: not a round trip. This is also why the tolerance is measured
--       against the ORIGINAL amount - "B sends a similar amount back" is relative to what A sent.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-1001', 'AC-1010', 'AC-1001',  905.00, TIMESTAMPTZ '2024-04-05 08:00:00+00', 'DC-5 credit issued before invoice'),
  ('TXN-1002', 'AC-1001', 'AC-1010', 1000.00, TIMESTAMPTZ '2024-04-05 12:00:00+00', 'DC-5 invoice 5120');

-- DC-6  Chain A->B->C->A within three hours. The money comes back to A, but through a third
--       party; no single pair of transactions reverses each other, so it must NOT match.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-1101', 'AC-1002', 'AC-1003', 1500.00, TIMESTAMPTZ '2024-04-09 10:00:00+00', 'DC-6 A->B'),
  ('TXN-1102', 'AC-1003', 'AC-1004', 1500.00, TIMESTAMPTZ '2024-04-09 11:00:00+00', 'DC-6 B->C'),
  ('TXN-1103', 'AC-1004', 'AC-1002', 1500.00, TIMESTAMPTZ '2024-04-09 12:00:00+00', 'DC-6 C->A');

-- DC-7  Just outside the tolerance: 899.90 back for 1000.00 (10.01%).
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-1201', 'AC-1005', 'AC-1008', 1000.00, TIMESTAMPTZ '2024-04-13 09:00:00+00', 'DC-7 payment'),
  ('TXN-1202', 'AC-1008', 'AC-1005',  899.90, TIMESTAMPTZ '2024-04-13 11:00:00+00', 'DC-7 return of 89.99%');

-- DC-8  Just outside the window: returned 24 hours and 1 second later.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-1301', 'AC-1006', 'AC-1009', 320.00, TIMESTAMPTZ '2024-04-17 09:00:00+00', 'DC-8 payment'),
  ('TXN-1302', 'AC-1009', 'AC-1006', 320.00, TIMESTAMPTZ '2024-04-18 09:00:01+00', 'DC-8 return after 24h 1s');

-- DC-9  Just outside the tolerance on the HIGH side: 1100.10 back for 1000.00 (10.001%).
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-1701', 'AC-1002', 'AC-1009', 1000.00, TIMESTAMPTZ '2024-05-07 09:00:00+00', 'DC-9 payment'),
  ('TXN-1702', 'AC-1009', 'AC-1002', 1100.10, TIMESTAMPTZ '2024-05-07 11:00:00+00', 'DC-9 return of 110.001%');

-- Background noise: ordinary one-way payments with no counterpart.
INSERT INTO transactions (txn_id, from_account, to_account, amount, txn_time, reference) VALUES
  ('TXN-1401', 'AC-1003', 'AC-1007',   75.00, TIMESTAMPTZ '2024-04-21 14:05:00+00', 'Standalone payment'),
  ('TXN-1402', 'AC-1008', 'AC-1002', 2250.00, TIMESTAMPTZ '2024-04-25 16:40:00+00', 'Standalone payment');

-- -----------------------------------------------------------------------------
-- Cricket: synthetic 2024 season
-- -----------------------------------------------------------------------------
INSERT INTO players (player_id, player_name, team) VALUES
  ('P01', 'Arjun Vellore',    'Mumbai Monsoons'),
  ('P02', 'Rohan Dasgupta',   'Chennai Cyclones'),
  ('P03', 'Kabir Anand',      'Delhi Drifters'),
  ('P04', 'Siddharth Rao',    'Kolkata Kestrels'),
  ('P05', 'Vikram Sethi',     'Mumbai Monsoons'),
  ('P06', 'Ishaan Mehra',     'Chennai Cyclones'),
  ('P07', 'Devansh Kulkarni', 'Delhi Drifters'),
  ('P08', 'Naveen Pillai',    'Kolkata Kestrels');

-- Double round robin between four teams (M01-M12), then a qualifier and a final.
INSERT INTO matches (match_id, match_date, home_team, away_team, venue) VALUES
  ('M01', DATE '2024-03-23', 'Mumbai Monsoons',  'Chennai Cyclones', 'Marine Drive Arena, Mumbai'),
  ('M02', DATE '2024-03-24', 'Delhi Drifters',   'Kolkata Kestrels', 'Ridge Road Stadium, Delhi'),
  ('M03', DATE '2024-03-29', 'Chennai Cyclones', 'Delhi Drifters',   'Marina Bay Oval, Chennai'),
  ('M04', DATE '2024-03-31', 'Kolkata Kestrels', 'Mumbai Monsoons',  'Hooghly Park, Kolkata'),
  ('M05', DATE '2024-04-04', 'Mumbai Monsoons',  'Delhi Drifters',   'Marine Drive Arena, Mumbai'),
  ('M06', DATE '2024-04-07', 'Chennai Cyclones', 'Kolkata Kestrels', 'Marina Bay Oval, Chennai'),
  ('M07', DATE '2024-04-12', 'Delhi Drifters',   'Mumbai Monsoons',  'Ridge Road Stadium, Delhi'),
  ('M08', DATE '2024-04-14', 'Kolkata Kestrels', 'Chennai Cyclones', 'Hooghly Park, Kolkata'),
  ('M09', DATE '2024-04-21', 'Mumbai Monsoons',  'Kolkata Kestrels', 'Marine Drive Arena, Mumbai'),
  ('M10', DATE '2024-04-24', 'Delhi Drifters',   'Chennai Cyclones', 'Ridge Road Stadium, Delhi'),
  ('M11', DATE '2024-05-03', 'Chennai Cyclones', 'Mumbai Monsoons',  'Marina Bay Oval, Chennai'),
  ('M12', DATE '2024-05-05', 'Kolkata Kestrels', 'Delhi Drifters',   'Hooghly Park, Kolkata'),
  ('M13', DATE '2024-05-21', 'Kolkata Kestrels', 'Chennai Cyclones', 'Hooghly Park, Kolkata'),       -- qualifier
  ('M14', DATE '2024-05-26', 'Kolkata Kestrels', 'Mumbai Monsoons',  'Marine Drive Arena, Mumbai');  -- final

-- Team fixtures, for reading the innings below:
--   Mumbai Monsoons  : M01 M04 M05 M07 M09 M11 M14
--   Chennai Cyclones : M01 M03 M06 M08 M10 M11 M13
--   Delhi Drifters   : M02 M03 M05 M07 M10 M12
--   Kolkata Kestrels : M02 M04 M06 M08 M09 M12 M13 M14

-- P01 Arjun Vellore - EXACTLY three consecutive 30+ innings (M04, M05, M07), then 18.
--     Expected: one streak, 2024-03-31 to 2024-04-12, 3 matches, 105 runs.
INSERT INTO batting_scores (match_id, player_id, runs, balls_faced, dismissed) VALUES
  ('M01', 'P01', 12, 11, TRUE),
  ('M04', 'P01', 34, 27, TRUE),
  ('M05', 'P01', 41, 29, FALSE),   -- not out; a not-out 30+ counts exactly like any other innings
  ('M07', 'P01', 30, 25, TRUE),
  ('M09', 'P01', 18, 16, TRUE),
  ('M11', 'P01', 22, 19, TRUE),
  ('M14', 'P01', 27, 21, TRUE);

-- P02 Rohan Dasgupta - five consecutive 30+ innings (M01, M03, M06, M08, M10), then 8 and 21.
--     Expected: one streak, 2024-03-23 to 2024-04-24, 5 matches, 232 runs.
INSERT INTO batting_scores (match_id, player_id, runs, balls_faced, dismissed) VALUES
  ('M01', 'P02', 52, 36, TRUE),
  ('M03', 'P02', 38, 30, TRUE),
  ('M06', 'P02', 67, 41, FALSE),
  ('M08', 'P02', 30, 24, TRUE),
  ('M10', 'P02', 45, 33, TRUE),
  ('M11', 'P02',  8,  9, TRUE),
  ('M13', 'P02', 21, 18, TRUE);

-- P03 Kabir Anand - streak broken by a 29: 31, 44, [29], 35, 40, 6. Two runs of two, never three.
--     Expected: no row.
INSERT INTO batting_scores (match_id, player_id, runs, balls_faced, dismissed) VALUES
  ('M02', 'P03', 31, 26, TRUE),
  ('M03', 'P03', 44, 31, TRUE),
  ('M05', 'P03', 29, 22, TRUE),   -- one short; breaks the streak
  ('M07', 'P03', 35, 28, TRUE),
  ('M10', 'P03', 40, 30, FALSE),
  ('M12', 'P03',  6,  7, TRUE);

-- P04 Siddharth Rao - two separate qualifying streaks: 33, 45, 38, [7], 61, 30, 48, [12].
--     Expected: two rows - 2024-03-24 to 2024-04-07 (3 matches, 116 runs)
--                      and 2024-04-21 to 2024-05-21 (3 matches, 139 runs).
INSERT INTO batting_scores (match_id, player_id, runs, balls_faced, dismissed) VALUES
  ('M02', 'P04', 33, 24, TRUE),
  ('M04', 'P04', 45, 35, TRUE),
  ('M06', 'P04', 38, 29, TRUE),
  ('M08', 'P04',  7,  6, TRUE),
  ('M09', 'P04', 61, 42, TRUE),
  ('M12', 'P04', 30, 27, TRUE),
  ('M13', 'P04', 48, 31, FALSE),
  ('M14', 'P04', 12, 14, TRUE);

-- P05 Vikram Sethi - batted in every match but never reached 30 (best 29).
--     Expected: no row.
INSERT INTO batting_scores (match_id, player_id, runs, balls_faced, dismissed) VALUES
  ('M01', 'P05', 12, 10, TRUE),
  ('M04', 'P05', 28, 25, TRUE),
  ('M05', 'P05', 29, 23, TRUE),
  ('M07', 'P05',  0,  2, TRUE),
  ('M09', 'P05', 19, 17, TRUE),
  ('M11', 'P05', 27, 20, FALSE),
  ('M14', 'P05', 15, 12, TRUE);

-- P06 Ishaan Mehra - missed a team match (M06) between two 30+ innings: 36, 42, (absent), 51, 9, 24, 14.
--     Under the "consecutive innings" definition (02_scoring_streaks) the absence is invisible and
--     36-42-51 is a three-innings streak: 2024-03-23 to 2024-04-14, 3 matches, 129 runs.
--     Under the "consecutive team matches" definition (02b) the missed match breaks the streak: no row.
INSERT INTO batting_scores (match_id, player_id, runs, balls_faced, dismissed) VALUES
  ('M01', 'P06', 36, 28, TRUE),
  ('M03', 'P06', 42, 33, TRUE),
  -- M06: did not play
  ('M08', 'P06', 51, 37, TRUE),
  ('M10', 'P06',  9, 11, TRUE),
  ('M11', 'P06', 24, 20, TRUE),
  ('M13', 'P06', 14, 15, TRUE);

-- P07 Devansh Kulkarni - exactly 30 in each of the last three matches (inclusive ">= 30" boundary).
--     Expected: one streak, 2024-04-12 to 2024-05-05, 3 matches, 90 runs.
INSERT INTO batting_scores (match_id, player_id, runs, balls_faced, dismissed) VALUES
  ('M02', 'P07',  5,  8, TRUE),
  ('M03', 'P07', 17, 15, TRUE),
  ('M05', 'P07',  2,  4, TRUE),
  ('M07', 'P07', 30, 22, TRUE),
  ('M10', 'P07', 30, 26, FALSE),
  ('M12', 'P07', 30, 19, TRUE);

-- P08 Naveen Pillai - lower-order batter: did not bat in M02 and M12, and only two consecutive 30+ innings.
--     Expected: no row.
INSERT INTO batting_scores (match_id, player_id, runs, balls_faced, dismissed) VALUES
  -- M02: did not bat
  ('M04', 'P08',  8,  9, TRUE),
  ('M06', 'P08', 31, 19, FALSE),
  ('M08', 'P08', 35, 22, TRUE),
  ('M09', 'P08',  4,  5, TRUE),
  -- M12: did not bat
  ('M13', 'P08',  2,  3, TRUE),
  ('M14', 'P08', 40, 26, FALSE);

COMMIT;
