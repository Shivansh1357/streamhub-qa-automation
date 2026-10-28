#!/usr/bin/env bash
# Creates the database named in DATABASE_URL (if missing) and loads schema + seed.
# Run from anywhere:  bash sql/scripts/setup.sh   or   npm run sql:setup
set -euo pipefail

# shellcheck source=sql/scripts/env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

SQL_DIR="${ROOT_DIR}/sql"

# Pull the database name off the end of the URL (dropping any ?query-string) and
# point a second URL at the maintenance database so we can CREATE DATABASE.
db_name="${DATABASE_URL##*/}"
db_name="${db_name%%\?*}"
admin_url="${DATABASE_URL%/*}/postgres"

if psql "${DATABASE_URL}" -Atqc 'SELECT 1' >/dev/null 2>&1; then
  echo "setup: database '${db_name}' is reachable"
else
  echo "setup: database '${db_name}' not reachable - trying to create it"
  exists="$(psql "${admin_url}" -Atqc "SELECT 1 FROM pg_database WHERE datname = '${db_name}'")"
  if [[ "${exists}" != "1" ]]; then
    psql "${admin_url}" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"${db_name}\""
    echo "setup: created database '${db_name}'"
  fi
fi

echo "setup: applying ${SQL_DIR}/schema.sql"
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -q -f "${SQL_DIR}/schema.sql"
echo "setup: applying ${SQL_DIR}/seed.sql"
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -q -f "${SQL_DIR}/seed.sql"

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -P footer=off <<'SQL'
SELECT 'accounts'       AS "table", COUNT(*) AS rows FROM accounts
UNION ALL SELECT 'transactions',   COUNT(*) FROM transactions
UNION ALL SELECT 'players',        COUNT(*) FROM players
UNION ALL SELECT 'matches',        COUNT(*) FROM matches
UNION ALL SELECT 'batting_scores', COUNT(*) FROM batting_scores;
SQL
echo "setup: done"
