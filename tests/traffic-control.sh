#!/usr/bin/env bash
set -euo pipefail
device=aurora-ci-tc
ifb=aurora-ci-ifb
sudo ip link add "$device" type dummy
trap 'sudo ip link del "$device" 2>/dev/null || true; sudo ip link del "$ifb" 2>/dev/null || true' EXIT
sudo ip link set dev "$device" up
sudo tc qdisc add dev "$device" clsact
export AURORA_TC_IFB="$ifb"
script=build/backend-overrides/ansible/project/files/tc.sh
sudo env AURORA_TC_IFACE="$device" AURORA_TC_IFB="$ifb" bash "$script" -e=1000kbit -i=1000kbit 18080
sudo tc class show dev "$device" | grep -q 'rate 1Mbit'
sudo tc class show dev "$ifb" | grep -q 'rate 1Mbit'
sudo tc filter show dev "$device" ingress | grep -q 'mirred'
filters="$(sudo tc filter show dev "$device" parent 1:)"
grep -q 'protocol ip ' <<< "$filters"
grep -q 'protocol ipv6 ' <<< "$filters"
grep -q 'ip_proto tcp' <<< "$filters"
grep -q 'ip_proto udp' <<< "$filters"
sudo env AURORA_TC_IFACE="$device" AURORA_TC_IFB="$ifb" bash "$script" -e=3000kbit 65535
sudo tc class show dev "$device" | grep -q '1:ffff '
sudo env AURORA_TC_IFACE="$device" AURORA_TC_IFB="$ifb" bash "$script" 65535
sudo env AURORA_TC_IFACE="$device" AURORA_TC_IFB="$ifb" bash "$script" -e=2000kbit 18081
sudo env AURORA_TC_IFACE="$device" AURORA_TC_IFB="$ifb" bash "$script" 18080
sudo tc class show dev "$device" | grep -q 'rate 2Mbit'
if sudo tc class show dev "$device" | grep -q '1:46a0 '; then echo "Removed class still exists"; exit 1; fi
sudo env AURORA_TC_IFACE="$device" AURORA_TC_IFB="$ifb" bash "$script" 18081
if sudo tc class show dev "$device" | grep -q 'class htb'; then echo "Class cleanup failed"; exit 1; fi
if sudo env AURORA_TC_IFACE="$device" AURORA_TC_IFB="$ifb" bash "$script" -e=bad 18080; then exit 1; fi
if sudo tc class show dev "$ifb" | grep -q 'class htb'; then echo "Ingress cleanup failed"; exit 1; fi
echo "PASS: actual bidirectional TCP/UDP IPv4/IPv6 limits, existing clsact compatibility, independent ports and removal"
