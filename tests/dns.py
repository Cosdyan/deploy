"""Resolve through a real local UDP DNS server and verify DoH CNAME filtering."""
import socket,threading,json
import dns.message,dns.rrset
from unittest.mock import patch
from app.utils.dns import get_ipv4_by_custom_server,get_by_doh,dns_query
server=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
server.bind(("127.0.0.1",0)); server.settimeout(5)
def reply():
 data,peer=server.recvfrom(4096); query=dns.message.from_wire(data)
 response=dns.message.make_response(query)
 response.answer.append(dns.rrset.from_text("aurora.test.",60,"IN","A","192.0.2.10"))
 server.sendto(response.to_wire(),peer)
thread=threading.Thread(target=reply); thread.start()
assert get_ipv4_by_custom_server("aurora.test","127.0.0.1:"+str(server.getsockname()[1]))=="192.0.2.10"
thread.join(timeout=5); assert not thread.is_alive(); server.close()
class Response:
 def read(self): return json.dumps({"Answer":[{"type":1,"data":"192.0.2.11"},{"type":5,"data":"alias.test."}]}).encode()
with patch("app.utils.dns.urlopen",return_value=Response()):
 assert get_by_doh("aurora.test")=="192.0.2.11"
class IPv6Response:
 def read(self): return json.dumps({"Answer":[{"type":5,"data":"alias.test."},{"type":28,"data":"2001:db8::1"}]}).encode()
with patch("app.utils.dns.urlopen",return_value=IPv6Response()):
 assert get_by_doh("aurora.test",dns_type="AAAA")=="2001:db8::1"
 assert get_by_doh("aurora.test",dns_type="A") is None
assert dns_query("192.0.2.1")=="192.0.2.1"
assert dns_query("2001:db8::1")=="2001:db8::1"
print("PASS: real custom DNS port, typed DoH answers, IPv4/IPv6 and CNAME filtering")
