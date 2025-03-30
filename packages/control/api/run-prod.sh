#!/usr/bin/env bash

set -eo pipefail

# Run Drizzle migrations if needed based on env variable
if [[ "$DATABASE_RUN_MIGRATIONS" == "true" ]]; then
  echo "Running migrations"
  drizzle-kit migrate
fi

# Run the app
node dist/index.js
