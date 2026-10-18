"""Parse actual routed packet counters without double-counting host-service rules."""
from pathlib import Path
from tasks.meter import parse_counters
actual=parse_counters(Path("/tmp/nat-counter-fixture.txt").read_text())
assert actual[18091]["upload:forward:iptables:tcp"]>0,actual
assert actual[18091]["download:forward:iptables:tcp"]>0,actual
sample='''__AURORA_IPV4__
[1:100] -A FORWARD -p tcp --comment "UPLOAD 1234->192.0.2.1:80" -j ACCEPT
[1:500] -A INPUT -p tcp --comment "UPLOAD 1234->192.0.2.1" -j ACCEPT
[1:25] -A AURORA_DOWNLOAD -p tcp --comment AURORA_INPUT_1234_iptables_tcp
__AURORA_IPV6__
[1:200] -A FORWARD -p tcp --comment "UPLOAD 1234->2001:db8::1:80" -j ACCEPT
[1:300] -A FORWARD -p udp --comment "DOWNLOAD-UDP 1234->2001:db8::1:80" -j ACCEPT
'''
parsed=parse_counters(sample)[1234]
assert parsed=={"upload:forward:iptables:tcp":100,"download:iptables:tcp":25,"upload:forward:ip6tables:tcp":200,"download:forward:ip6tables:udp":300},parsed
print("PASS: actual routed traffic counters, separate IPv4/IPv6 sources and no duplicate host counters")
