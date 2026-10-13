#!/usr/bin/env bash
set -euo pipefail
script=build/backend-overrides/ansible/project/files/iptables.sh
bash -n "$script"
for port in 0 65536 -1 abc; do
 if output=$(bash "$script" forward "$port" 192.0.2.1 80 2>&1); then
  echo "Invalid local port accepted: $port"; exit 1
 fi
 [[ "$output" == *"Invalid local port"* ]]
 if output=$(bash "$script" forward 18090 192.0.2.1 "$port" 2>&1); then
  echo "Invalid remote port accepted: $port"; exit 1
 fi
 [[ "$output" == *"Invalid remote port"* ]]
done
! grep -qx disable_firewall "$script"
echo "PASS: invalid forwarding ports rejected before system changes; existing firewall preserved"
