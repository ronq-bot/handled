#!/usr/bin/env bash
# Runs the suite against both engines. Pass a Postgres URL as $1, or set
# HANDLED_TEST_DATABASE_URL, to include the Postgres pass.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── SQLite ──────────────────────────────"
node scripts/verify.mjs

PG="${1:-${HANDLED_TEST_DATABASE_URL:-}}"
if [ -n "$PG" ]; then
  echo
  echo "── Postgres ────────────────────────────"
  DATABASE_URL="$PG" node scripts/verify.mjs
else
  echo
  echo "Skipping Postgres — pass a connection URL to include it."
fi
