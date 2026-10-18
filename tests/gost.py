"""IPv6 addresses must survive Gost URL parsing and skip DNS resolution."""
from unittest.mock import patch
from tasks.functions.gost import GostConfig
with patch("tasks.functions.gost.dns_query",side_effect=AssertionError("IP literal sent to DNS")):
 for url,expected in [("socks5://user:pass@[2001:db8::1]:1080","2001:db8::1"),("socks5://192.0.2.1:1080","192.0.2.1")]:
  assert GostConfig.get_gost_remote_ip({"ChainNodes":[url]})==expected
 for url,expected in [("tcp://:18080/[2001:db8::2]:443","2001:db8::2"),("tcp://:18080/192.0.2.2:443","192.0.2.2")]:
  assert GostConfig.get_gost_remote_ip({"ServeNodes":[url]})==expected
with patch("tasks.functions.gost.dns_query",return_value="192.0.2.3") as dns:
 assert GostConfig.get_gost_remote_ip({"ChainNodes":["socks5://user:pass@relay.test:1080"]})=="192.0.2.3"
 dns.assert_called_once_with("relay.test")
print("PASS: Gost IPv4/IPv6 chain and direct targets plus authenticated hostname parsing")
