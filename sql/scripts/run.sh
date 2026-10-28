#!/usr/bin/env bash
# Runs every query in sql/queries/ against DATABASE_URL and captures the output
# (aligned table + row count + server-side timing) in sql/outputs/<query>.txt.
# Run from anywhere:  bash sql/scripts/run.sh   or   npm run sql:run
set -euo pipefail

# shellcheck source=sql/scripts/env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

QUERIES_DIR="${ROOT_DIR}/sql/queries"
OUTPUTS_DIR="${ROOT_DIR}/sql/outputs"
mkdir -p "${OUTPUTS_DIR}"

db_version="$(psql "${DATABASE_URL}" -Atqc 'SELECT version()')"
executed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

shopt -s nullglob
queries=("${QUERIES_DIR}"/*.sql)
if [[ ${#queries[@]} -eq 0 ]]; then
  echo "run: no .sql files found in ${QUERIES_DIR}" >&2
  exit 1
fi

for query in "${queries[@]}"; do
  name="$(basename "${query}" .sql)"
  output="${OUTPUTS_DIR}/${name}.txt"
  echo
  echo "=== ${name} ==="
  # The three "-- key: value" header lines are read back by render-screenshots.ts.
  {
    echo "-- query:    ${name}.sql"
    echo "-- database: ${db_version}"
    echo "-- executed: ${executed_at}"
    echo
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -P pager=off -P footer=on -c '\timing on' -f "${query}"
  } | tee "${output}"
done

echo
echo "run: outputs written to ${OUTPUTS_DIR}"
