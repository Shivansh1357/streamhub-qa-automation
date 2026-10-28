#!/usr/bin/env bash
# Shared by the SQL scripts: resolves DATABASE_URL the same way config/env.ts does.
#   1. a value already in the environment wins;
#   2. otherwise the committed config/env/${TEST_ENV:-local}.env is loaded,
#      then the git-ignored .env on top of it (personal overrides).
# Usage: source "$(dirname "$0")/env.sh"   (sets ROOT_DIR and DATABASE_URL)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export ROOT_DIR

if [[ -z "${DATABASE_URL:-}" ]]; then
  env_file="${ROOT_DIR}/config/env/${TEST_ENV:-local}.env"
  if [[ ! -f "${env_file}" ]]; then
    echo "env.sh: ${env_file} not found and DATABASE_URL is not set" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  if [[ -f "${ROOT_DIR}/.env" ]]; then
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/.env"
  fi
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "env.sh: DATABASE_URL is empty after loading the env files" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "env.sh: psql is not on PATH (install the PostgreSQL client tools)" >&2
  exit 1
fi
