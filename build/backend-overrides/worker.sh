#!/usr/bin/env bash
set -euo pipefail

# Bound memory use on hosts where nproc exposes all CPUs to the container.
workers=${AURORA_WORKERS:-2}
if [[ ! "$workers" =~ ^[0-9]+$ ]] || (( workers < 1 || workers > 32 )); then
    echo "AURORA_WORKERS must be an integer between 1 and 32" >&2
    exit 1
fi
exec huey_consumer.py tasks.huey -k process -w "$workers"
