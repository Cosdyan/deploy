#!/usr/bin/env bash
set -euo pipefail

egress=0
ingress=0
port=""
for argument in "$@"; do
    case "$argument" in
        -e=*|--egress=*) egress="${argument#*=}" ;;
        -i=*|--ingress=*) ingress="${argument#*=}" ;;
        *) [[ -z "$port" ]] || { echo "Only one port is allowed" >&2; exit 1; }; port="$argument" ;;
    esac
done
[[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535)) || { echo "Invalid port" >&2; exit 1; }
for rate in "$egress" "$ingress"; do
    [[ "$rate" =~ ^[0-9]+(kbit)?$ ]] || { echo "Invalid rate" >&2; exit 1; }
    number="${rate%kbit}"
    ((number <= 1000000000)) || { echo "Rate is too large" >&2; exit 1; }
done
egress="${egress%kbit}"
ingress="${ingress%kbit}"
interface="${AURORA_TC_IFACE:-$(ip -o route show default | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1);exit}}')}"
ifb="${AURORA_TC_IFB:-aurora-ifb}"
[[ -n "$interface" ]] || { echo "Default network interface not found" >&2; exit 1; }
ip link show dev "$interface" >/dev/null
class="$(printf '%x' "$port")"

ensure_root() {
    local device="$1" handle="$2" root
    root="$(tc qdisc show dev "$device")"
    if grep -q "qdisc htb $handle:" <<< "$root"; then return; fi
    # Refuse to overwrite an existing custom traffic manager.
    if grep -Eq 'qdisc (htb|hfsc|cake|tbf|prio|mqprio)' <<< "$root"; then
        echo "Existing custom traffic control on $device" >&2
        exit 1
    fi
    tc qdisc replace dev "$device" root handle "$handle:" htb default 0
}
remove_port() {
    local device="$1" handle="$2"
    if ! ip link show dev "$device" >/dev/null 2>&1; then return; fi
    if tc class show dev "$device" | grep -q "class htb $handle:$class "; then
        tc filter del dev "$device" parent "$handle:" pref "$port" || true
        tc class del dev "$device" classid "$handle:$class"
    fi
}
apply_port() {
    local device="$1" handle="$2" direction="$3" rate="$4"
    ensure_root "$device" "$handle"
    remove_port "$device" "$handle"
    tc class replace dev "$device" parent "$handle:" classid "$handle:$class" htb rate "${rate}kbit" ceil "${rate}kbit"
    for family in ip ipv6; do
        for transport in tcp udp; do
            tc filter add dev "$device" parent "$handle:" protocol "$family" pref "$port" flower ip_proto "$transport" "${direction}_port" "$port" classid "$handle:$class"
        done
    done
}
if ((egress > 0)); then
    apply_port "$interface" 1 src "$egress"
else
    remove_port "$interface" 1
fi
if ((ingress > 0)); then
    if ! ip link show dev "$ifb" >/dev/null 2>&1; then
        modprobe ifb
        ip link add "$ifb" type ifb
    fi
    ip link set dev "$ifb" up
    if ! tc qdisc show dev "$interface" | grep -q 'qdisc ingress ffff:'; then
        tc qdisc add dev "$interface" handle ffff: ingress
    fi
    # Each port owns its redirect filters; other inbound traffic is untouched.
    tc filter del dev "$interface" parent ffff: pref "$port" 2>/dev/null || true
    for family in ip ipv6; do
        for transport in tcp udp; do
            tc filter add dev "$interface" parent ffff: protocol "$family" pref "$port" flower ip_proto "$transport" dst_port "$port" action mirred egress redirect dev "$ifb"
        done
    done
    apply_port "$ifb" 2 dst "$ingress"
else
    tc filter del dev "$interface" parent ffff: pref "$port" 2>/dev/null || true
    remove_port "$ifb" 2
fi
echo "Port $port traffic control updated"
