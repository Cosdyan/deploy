#!/usr/bin/env bash
set -euo pipefail
device=aurora-ci-tc
sudo ip link add "$device" type dummy
trap 'sudo ip link del "$device" 2>/dev/null || true' EXIT
sudo ip link set dev "$device" up
script=build/backend-overrides/ansible/project/files/tc.sh
sudo env AURORA_TC_IFACE="$device" bash "$script" -e=1000kbit 18080
sudo tc class show dev "$device" | grep -q 'rate 1Mbit'
filters="$(sudo tc filter show dev "$device" parent 1:)"
grep -q 'protocol ip ' <<< "$filters"
grep -q 'protocol ipv6 ' <<< "$filters"
grep -q 'ip_proto tcp' <<< "$filters"
grep -q 'ip_proto udp' <<< "$filters"
sudo env AURORA_TC_IFACE="$device" bash "$script" -e=3000kbit 65535
sudo tc class show dev "$device" | grep -q '1:ffff '
sudo env AURORA_TC_IFACE="$device" bash "$script" 65535
sudo env AURORA_TC_IFACE="$device" bash "$script" -e=2000kbit 18081
sudo env AURORA_TC_IFACE="$device" bash "$script" 18080
sudo tc class show dev "$device" | grep -q 'rate 2Mbit'
if sudo tc class show dev "$device" | grep -q '1:46a0 '; then echo "Removed class still exists"; exit 1; fi
sudo env AURORA_TC_IFACE="$device" bash "$script" 18081
if sudo tc class show dev "$device" | grep -q 'class htb'; then echo "Class cleanup failed"; exit 1; fi
if sudo env AURORA_TC_IFACE="$device" bash "$script" -e=bad 18080; then exit 1; fi
echo "PASS: actual TCP/UDP IPv4/IPv6 rate filters, independent ports and removal"
