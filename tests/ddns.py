"""Verify DDNS changes enqueue the correct registered task without external hosts."""
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch,Mock
from app.db.models import MethodEnum
from tasks.iptables import ddns_scan_runner as ddns_runner
port=SimpleNamespace(id=21,num=18090,server=SimpleNamespace(id=9))
rule=SimpleNamespace(id=15,method=MethodEnum.IPTABLES,port=port,config={"remote_address":"aurora.test","remote_ip":"192.0.2.1","remote_port":80,"type":"ALL"})
with patch("time.time",return_value=0), patch("tasks.iptables.db_session",side_effect=lambda:nullcontext(None)), patch("tasks.iptables.get_all_ddns_rules",return_value=[rule]), patch("tasks.iptables.dns_query",return_value="192.0.2.2") as dns, patch("tasks.iptables.iptables_runner") as queued:
 ddns_runner.call_local()
 queued.assert_called_once_with(21,9,18090,remote_address="192.0.2.2",remote_port=80,forward_type="ALL",update_status=True)
with patch("time.time",return_value=0), patch("tasks.iptables.db_session",side_effect=lambda:nullcontext(None)), patch("tasks.iptables.get_all_ddns_rules",return_value=[rule]), patch("tasks.iptables.dns_query",return_value="192.0.2.1"), patch("tasks.iptables.iptables_runner") as queued:
 ddns_runner.call_local(); queued.assert_not_called()
with patch("time.time",return_value=0), patch("tasks.iptables.db_session",side_effect=lambda:nullcontext(None)), patch("tasks.iptables.get_all_ddns_rules",return_value=[rule]), patch("tasks.iptables.dns_query",return_value=None), patch("tasks.iptables.iptables_runner") as queued:
 ddns_runner.call_local(); queued.assert_not_called()
rule.config["remote_address"]="2001:db8::1"
with patch("time.time",return_value=0), patch("tasks.iptables.db_session",side_effect=lambda:nullcontext(None)), patch("tasks.iptables.get_all_ddns_rules",return_value=[rule]), patch("tasks.iptables.dns_query") as dns:
 ddns_runner.call_local(); dns.assert_not_called()
print("PASS: DDNS changed/unchanged/failed resolution and IPv6 literal scheduling")
