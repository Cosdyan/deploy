"""Actual HTTP bytes must increment usage and enforce the configured quota."""
import json,time,urllib.request,urllib.parse,subprocess
base="http://127.0.0.1:8000"
def post(path,payload,token=None,form=False):
    headers={"Content-Type":"application/x-www-form-urlencoded" if form else "application/json"}
    if token:headers["Authorization"]="Bearer "+token
    data=urllib.parse.urlencode(payload).encode() if form else json.dumps(payload).encode()
    with urllib.request.urlopen(urllib.request.Request(base+path,data=data,headers=headers),timeout=30) as response:return json.load(response)
token=post("/api/token",{"username":"admin@example.invalid","password":"ci_test_password_123"},form=True)["access_token"]
def gql(q,variables=None):
    r=post("/api/graphql",{"query":q,"variables":variables or {}},token)
    assert not r.get("errors"),r
    return r["data"]
sid=next(x["id"] for x in gql("{servers{id name}}")["servers"] if x["name"]=="CI SSH target")
contract={"schemaVersion":"aurora-exec/v1","contractKey":"ci_traffic_http","version":1,"title":"CI traffic quota lifecycle","requiresPort":True,"exec":{"bin":"/usr/bin/python3","baseArgs":["-m","http.server","--directory","/tmp/aurora-ci-traffic"],"workingDir":"/tmp"},"params":[{"key":"listen_port","type":"int","label":"Listen port","default":18086,"emit":{"pos":0}}]}
service=gql("mutation($c:JSON!){createServiceDefinition(configJson:$c){id}}",{"c":contract})["createServiceDefinition"]["id"]
gql("mutation($s:Int!){addPort(serverId:$s,num:18086)}",{"s":sid})
pid=gql("query($s:Int!){port(serverId:$s,num:18086){id}}",{"s":sid})["port"]["id"]
dep=gql("mutation($s:[Int!]!,$service:Int!,$p:Int!){deployService(serverIds:$s,serviceId:$service,portId:$p,values:{listen_port:18086}){id}}",{"s":[sid],"service":service,"p":pid})["deployService"][0]["id"]
def wait(active,status):
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        value=gql("query($id:Int!){serverDeployment(id:$id){isActive status logs{status action output}}}",{"id":dep})["serverDeployment"]
        assert value["status"]!="failed",value
        if value["isActive"]==active and value["status"]==status:return value
        time.sleep(2)
    raise AssertionError(value)
def worker(code):
    subprocess.run(["docker","compose","-f","docker-compose.yml","-f","ci-compose.yml","exec","-T","worker","python","-c",code],check=True)
worker("from tasks.utils.connect import connect;\nwith connect("+str(sid)+") as conn: conn.sudo('mkdir -p /tmp/aurora-ci-traffic; dd if=/dev/zero of=/tmp/aurora-ci-traffic/payload.bin bs=1048576 count=2 status=none',hide=True)")
wait(True,"deployed")
worker("from tasks.meter import collect_port_traffic; collect_port_traffic.call_local("+str(sid)+")")
gql("mutation($p:Int!){setPortPolicy(id:$p,config:{quota:1048576,quota_action:8})}",{"p":pid})
worker("import urllib.request,time;\nfor attempt in range(30):\n try:\n  response=urllib.request.urlopen('http://host.docker.internal:18086/payload.bin',timeout=10); assert len(response.read())==2097152; break\n except OSError:\n  time.sleep(1)\nelse: raise AssertionError('HTTP service unavailable')")
time.sleep(1)
worker("from tasks.meter import collect_port_traffic; from app.db.session import db_session; from app.db.models import Port;\ncollect_port_traffic.call_local("+str(sid)+");\nwith db_session() as db:\n port=db.get(Port,"+str(pid)+"); assert port.usage.upload>=2097152, (port.usage.upload,port.usage.download); before=port.usage.upload+port.usage.download;\ncollect_port_traffic.call_local("+str(sid)+");\nwith db_session() as db:\n port=db.get(Port,"+str(pid)+"); assert port.usage.upload+port.usage.download==before, 'Repeated collection double-counted bytes'")
removed=wait(False,"stopped")
assert any(log["action"]=="remove" and log["status"]=="success" for log in removed["logs"]),removed
gql("mutation($p:Int!){deletePort(id:$p)}",{"p":pid})
print("PASS: real HTTP traffic, byte counters, repeated collection without double counting and quota-triggered service removal")
