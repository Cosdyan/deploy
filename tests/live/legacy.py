"""Verify restored runner imports, private inventories and actual playbook execution."""
import subprocess
code = r'''
import os
from pathlib import Path
from app.db.session import db_session
from app.db.models import Server
from tasks.utils.runner import run
from tasks import app_runner, rule_runner, tc_runner, clean_port_no_update_runner
with db_session() as db:
    server = db.query(Server).filter(Server.name == "CI SSH target").one()
playbook = Path("ansible/project/ci-legacy.yml")
playbook.write_text("""---
- hosts: "{{ host }}"
  gather_facts: false
  become: true
  tasks:
    - name: Verify original style playbook can execute on managed host
      command: /usr/bin/printf aurora-legacy-ready
      changed_when: false
""")
before = set(Path("ansible/priv_data_dirs").glob("*"))
for i in range(2):
    result = run(server, "ci-legacy.yml")
    assert result.status == "successful", result.status
after = set(Path("ansible/priv_data_dirs").glob("*"))
created = after - before
assert len(created) == 2, created
for directory in created:
    assert directory.stat().st_mode & 0o777 == 0o700
    assert (directory / "inventory.json").stat().st_mode & 0o777 == 0o600
print("PASS: restored task imports, real Ansible runner with sudo and independent private inventories")
'''
subprocess.run(["docker","compose","-f","docker-compose.yml","-f","ci-compose.yml","exec","-T","worker","python","-c",code],check=True)

# Exercise the actual authorized API -> Redis queue -> SSH playbook -> status path.
import json, time, urllib.request, urllib.parse
base="http://127.0.0.1:8000"
def post(path,payload,token=None,form=False):
    headers={"Content-Type":"application/x-www-form-urlencoded" if form else "application/json"}
    if token:headers["Authorization"]="Bearer "+token
    body=urllib.parse.urlencode(payload).encode() if form else json.dumps(payload).encode()
    with urllib.request.urlopen(urllib.request.Request(base+path,data=body,headers=headers),timeout=30) as response:return json.load(response)
token=post("/api/token",{"username":"admin@example.invalid","password":"ci_test_password_123"},form=True)["access_token"]
def gql(query,variables=None):
    result=post("/api/graphql",{"query":query,"variables":variables or {}},token)
    assert not result.get("errors"),result
    return result["data"]
sid=next(x["id"] for x in gql("{servers{id name}}")["servers"] if x["name"]=="CI SSH target")
gql("mutation($s:Int!){addPort(serverId:$s,num:18080)}",{"s":sid})
pid=gql("query($s:Int!){port(serverId:$s,num:18080){id}}",{"s":sid})["port"]["id"]
for rate in [1000,0]:
    result=gql("mutation($p:Int!,$rate:Int!){applyPortSpeedLimits(id:$p,egress:$rate,ingress:0)}",{"p":pid,"rate":rate})["applyPortSpeedLimits"]
    assert result["status"]=="queued" and result["taskId"],result
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        config=gql("query($p:Int!){port(id:$p){config}}",{"p":pid})["port"]["config"]
        assert config.get("speed_limit_status")!="failed",config
        if config.get("speed_limit_status")=="applied":break
        time.sleep(2)
    else:raise AssertionError("Port speed task did not complete")
    assert config["egress_limit"]==rate and config["ingress_limit"]==0,config
gql("mutation($p:Int!){deletePort(id:$p)}",{"p":pid})
print("PASS: actual speed-limit API, queued SSH execution, completion status and removal")

# Deadline evaluation must work with no usage row and not mask a quota policy.
policy_code=r'''
from datetime import datetime
from app.db.session import db_session
from app.db.models import Port, Server
from tasks.limits import port_limits_runner
from tasks.utils.usage import check_limits
from app.db.constants import LimitActionEnum
assert check_limits({"valid_until":1,"due_action":0,"quota":100,"quota_action":3},100)==LimitActionEnum.SPEED_LIMIT_1M
assert check_limits({"quota":100,"quota_action":3},99) is None
assert check_limits({"quota":100,"quota_action":3},100)==LimitActionEnum.SPEED_LIMIT_1M
with db_session() as db:
    sid=db.query(Server).filter(Server.name=="CI SSH target").one().id
    port=Port(server_id=sid,num=18084,config={"valid_until":1,"due_action":3})
    db.add(port);db.commit();pid=port.id
port_limits_runner.call_local()
with db_session() as db:
    port=db.get(Port,pid)
    assert port.usage is None
    assert port.config["egress_limit"]==1000 and port.config["ingress_limit"]==1000,port.config
    assert port.config["speed_limit_status"] in ("queued","applied"),port.config
    port.config["valid_until"]=0
    db.commit()
print("PASS: expiry without historical traffic, exact quota threshold and independent no-action deadline")
'''
subprocess.run(["docker","compose","-f","docker-compose.yml","-f","ci-compose.yml","exec","-T","worker","python","-c",policy_code],check=True)
