#!/usr/bin/env bash
set -euo pipefail
export AURORA_DB_PASSWORD=isolated_test_password
export AURORA_SECRET_KEY=isolated_test_secret
database_image=""
backend_image=""
for compose in docker-compose.yml docker-compose-dev.yml; do
    config=$(docker compose -f "$compose" config --format json)
    image=$(jq -r '.services.postgres.image' <<<"$config")
    [[ $image == timescale/timescaledb:2.15.3-pg13 ]]
    jq -e '.services.postgres.command == ["postgres", "-c", "shared_preload_libraries=timescaledb"]' <<<"$config" >/dev/null
    database_image=$image
    backend_image=$(jq -r '.services.backend.image' <<<"$config")
done
name="aurora-db-test-${GITHUB_RUN_ID:-$$}"
network="$name-network"
volume="$name-data"
cleanup() {
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker volume rm "$volume" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$network" >/dev/null
docker volume create "$volume" >/dev/null
start_database() {
    docker run -d --name "$name" --network "$network" --network-alias postgres \
        -e POSTGRES_USER=aurora -e POSTGRES_PASSWORD="$AURORA_DB_PASSWORD" -e POSTGRES_DB=aurora \
        -v "$volume:/var/lib/postgresql/data" "$@" >/dev/null
    for ((attempt=0; attempt<60; attempt++)); do
        if docker exec "$name" pg_isready -h 127.0.0.1 -U aurora -d aurora >/dev/null 2>&1 &&
            docker exec "$name" psql -h 127.0.0.1 -U aurora -d aurora -Atc 'SELECT 1' >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    docker logs "$name"
    return 1
}
verify_database() {
    docker exec "$name" psql -U aurora -d aurora -v ON_ERROR_STOP=1 \
        -c 'CREATE EXTENSION IF NOT EXISTS timescaledb;'
    docker exec "$name" psql -U aurora -d aurora -Atc \
        "SELECT extversion FROM pg_extension WHERE extname='timescaledb';" | grep -Fx '2.15.3'
    for run in 1 2; do
        docker run --rm --network "$network" \
            -e DATABASE_URL="postgresql://aurora:$AURORA_DB_PASSWORD@postgres:5432/aurora" \
            -e ASYNC_DATABASE_URL="postgresql+asyncpg://aurora:$AURORA_DB_PASSWORD@postgres:5432/aurora" \
            -e PYTHONPATH=/app -e ENABLE_SENTRY=no -e SECRET_KEY="$AURORA_SECRET_KEY" \
            "$backend_image" sh -c 'alembic upgrade heads'
    done
}
# Fresh deployment uses the actual selected backend and database images.
start_database "$database_image" postgres -c shared_preload_libraries=timescaledb
verify_database
docker rm -f "$name" >/dev/null
docker volume rm "$volume" >/dev/null
docker volume create "$volume" >/dev/null
# Reproduce the failed deployment: a PG13 volume without the extension.
start_database postgres:13-alpine
docker exec "$name" psql -U aurora -d aurora -v ON_ERROR_STOP=1 \
    -c "CREATE TABLE preservation_check (value text); INSERT INTO preservation_check VALUES ('keep');"
docker rm -f "$name" >/dev/null
# Replace the container, retaining the same database volume.
start_database "$database_image" postgres -c shared_preload_libraries=timescaledb
verify_database
docker exec "$name" psql -U aurora -d aurora -Atc 'SELECT value FROM preservation_check;' | grep -Fx keep
echo 'Actual deployment migration and existing-volume preservation tests passed'
