#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
# Load functions only: do not run root/network/menu startup code.
source <(sed -n '/^function check_system()/,$p' "$ROOT/install.sh" | sed '$d')
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
AURORA_DOCKER_YML="$test_dir/compose.yml"
AURORA_DEF_PORT=8000
Error=ERROR
Info=INFO
Tip=TIP
check_mapping() {
    local mapping=$1 expected_port=$2 expected_ip=$3
    cat > "$AURORA_DOCKER_YML" <<EOF
services:
  backend:
    command: uvicorn --host 0.0.0.0 --port 8888
    ports:
      - 9000:80
  nginx:
    ports:
$mapping
    depends_on:
      - backend
  postgres:
    ports:
      - 5432:5432
EOF
    read_port
    [[ $PORT == "$expected_port" && $IP == "$expected_ip" ]]
    set_port "$PORT" 18080
    read_port
    [[ $PORT == 18080 && $IP == "$expected_ip" ]]
    grep -q '9000:80' "$AURORA_DOCKER_YML"
    grep -q '5432:5432' "$AURORA_DOCKER_YML"
    cp "$AURORA_DOCKER_YML" "$test_dir/before"
    for invalid in 0 65536 12x '' -1; do
        if set_port "$PORT" "$invalid"; then exit 1; fi
        cmp "$test_dir/before" "$AURORA_DOCKER_YML"
    done
}
check_mapping '      - 8000:80' 8000 ''
check_mapping '      - "8000:80/tcp" # panel' 8000 ''
check_mapping "      - '127.0.0.1:8080:80'" 8080 127.0.0.1
check_mapping '      - "[::1]:8080:80/tcp"' 8080 '[::1]'
check_mapping '      - target: 80
        published: "8000"
        protocol: tcp
        mode: host' 8000 ''
grep -q 'mode: host' "$AURORA_DOCKER_YML"
check_mapping '      - published: 8080
        protocol: tcp
        host_ip: 127.0.0.1
        target: 80
      - target: 80
        published: 9001
        protocol: udp' 8080 127.0.0.1
grep -q 'published: 9001' "$AURORA_DOCKER_YML"
# Updating from a long mapping to a downloaded short mapping retains the bind IP.
PORT=18080
IP=127.0.0.1
cp "$ROOT/docker-compose.yml" "$AURORA_DOCKER_YML"
set_port 8000 "$PORT"
read_port
[[ $PORT == 18080 && $IP == 127.0.0.1 ]]
# Conversely preserve an existing binding in a newly downloaded long mapping.
cat > "$AURORA_DOCKER_YML" <<EOF
services:
  nginx:
    ports:
      - published: 8000
        target: 80
        protocol: tcp
EOF
set_port 8000 18080
read_port
[[ $PORT == 18080 && $IP == 127.0.0.1 ]]
# Reject missing and ambiguous mappings without changing the file.
for mapping in '      - 9000:81' '      - 8000:80
      - 8001:80'; do
    printf 'services:\n  nginx:\n    ports:\n%s\n' "$mapping" > "$AURORA_DOCKER_YML"
    if read_port; then exit 1; fi
    cp "$AURORA_DOCKER_YML" "$test_dir/before"
    if set_port 8000 18080; then exit 1; fi
    cmp "$test_dir/before" "$AURORA_DOCKER_YML"
done
for compose in docker-compose.yml docker-compose-dev.yml; do
    cp "$ROOT/$compose" "$AURORA_DOCKER_YML"
    read_port
    [[ $PORT == 8000 && -z $IP ]]
done
# Exercise install with all external actions stubbed.
(
    AURORA_HOME="$test_dir/fresh"
    AURORA_DOCKER_YML="$AURORA_HOME/docker-compose.yml"
    AURORA_DEF_IP=""
    install_all() { :; }
    docker() { :; }
    docker-compose() { :; }
    get_config() { cp "$ROOT/docker-compose.yml" "$AURORA_DOCKER_YML"; }
    read_config() { :; }
    echo_config() { [[ $PORT == 8000 && -z $IP ]]; }
    read_port() { echo 'Fresh install attempted to read an old port' >&2; exit 1; }
    # Stub SSH setup so the real home directory is never changed.
    mkdir() { [[ $* == *".ssh"* ]] || command mkdir "$@"; }
    touch() { :; }
    install
)
# Reinstall captures old settings before the download replaces them.
(
    AURORA_HOME="$test_dir/existing"
    AURORA_DOCKER_YML="$AURORA_HOME/docker-compose.yml"
    mkdir -p "$AURORA_HOME"
    printf 'services:\n  nginx:\n    ports:\n      - "127.0.0.1:18080:80"\n' > "$AURORA_DOCKER_YML"
    install_all() { :; }
    docker() { :; }
    docker-compose() { :; }
    get_config() { cp "$ROOT/docker-compose.yml" "$AURORA_DOCKER_YML"; }
    read_config() { :; }
    set_config() { :; }
    echo_config() { read_port; [[ $PORT == 18080 && $IP == 127.0.0.1 ]]; }
    mkdir() { [[ $* == *".ssh"* ]] || command mkdir "$@"; }
    touch() { :; }
    install
)
echo 'Installer port and installation regression tests passed'
