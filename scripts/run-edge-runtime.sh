#!/usr/bin/env bash
set -e

# Description:
# Allow to launch `edge-runtime` from an existing folder and watch for changes
# without doing through Docker.
# You will need to edit `docker-compose.yml` `RUNNER_URL` to point to outside the container. You can do that by adding:
#   extra_hosts:
#     - "host.docker.internal:host-gateway"
# to the `runner` service in `docker-compose.yml`, and use
# `host.docker.internal` instead of `runner`. If running on a rootless Docker,
# you'll have to specify the actual external IP adress.


EDGE_RUNTIME_FOLDER=$(readlink -f "$1")
shift;
SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
WORKDIR=$(readlink -f "$SCRIPTPATH/../packages/runner/")

export $(grep -v '^#' $SCRIPTPATH/../.runner.env | xargs)

watchexec -r -e rs,toml,ts,js --stop-timeout 2 --workdir "$WORKDIR" -w . -w "$EDGE_RUNTIME_FOLDER" -- \
        "(cd $EDGE_RUNTIME_FOLDER && cargo build --features cli/tracing) && RUST_BACKTRACE=full $EDGE_RUNTIME_FOLDER/target/debug/edge-runtime start --port 8000 --ip 0.0.0.0 --main-service functions/supervisor --event-worker functions/event-worker"
