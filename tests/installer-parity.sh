#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
source <(sed -n '/^function check_system()/,$p' "$ROOT/install.sh" | sed '$d')
sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
Info=INFO; Error=ERROR; Tip=TIP
AURORA_HOME="$sandbox/aurora"
mkdir -p "$AURORA_HOME"
AURORA_DOCKER_YML="$AURORA_HOME/docker-compose.yml"
cp "$ROOT/docker-compose.yml" "$AURORA_DOCKER_YML"
printf 'AURORA_DB_PASSWORD=keep_database_password\nAURORA_SECRET_KEY=old_key\n' > "$AURORA_HOME/.env"
# Cancellation must preserve both credentials and must not recreate a service.
docker-compose() { echo 'unexpected service recreation' >&2; return 90; }
rotate_secret_key <<< NO
grep -q '^AURORA_SECRET_KEY=old_key$' "$AURORA_HOME/.env"
# Approved rotation must preserve DB password, private permissions, and a backup.
openssl() { printf 'new_test_signing_key\n'; }
docker-compose() { [[ $* == "up -d backend" ]]; }
wait_backend() { :; }
rotate_secret_key <<< YES
grep -q '^AURORA_DB_PASSWORD=keep_database_password$' "$AURORA_HOME/.env"
grep -q '^AURORA_SECRET_KEY=new_test_signing_key$' "$AURORA_HOME/.env"
[[ $(stat -c '%a' "$AURORA_HOME/.env") == 600 ]]
grep -q '^AURORA_SECRET_KEY=old_key$' "$AURORA_HOME"/.env.backup-*
# A failed database backup must return nonzero to abort updating.
docker() { printf 'aurora-postgres\n'; }
docker-compose() { return 19; }
if backup; then echo "Failed backup was treated as successful" >&2; exit 1; fi
grep -q '18. 更换安全签名密钥' "$ROOT/install.sh"
grep -q 'docker-compose logs -f --tail="100" nginx' "$ROOT/install.sh"
echo 'PASS: original menu parity, safe key rotation and abort on failed backup'
