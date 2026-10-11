"""A deadline must remove an actual modern systemd deployment, not only legacy rules."""
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
contract={"schemaVersion":"aurora-exec/v1","contractKey":"ci_policy_sleep","version":1,"title":"CI port policy lifecycle","requiresPort":True,"exec":{"bin":"/usr/bin/sleep","workingDir":"/tmp"},"params":[{"key":"duration","type":"int","label":"Duration","default":3600,"emit":{"pos":0}}]}
service=gql("mutation($c:JSON!){createServiceDefinition(configJson:$c){id}}",{"c":contract})["createServiceDefinition"]["id"]
gql("mutation($s:Int!){addPort(serverId:$s,num:18085)}",{"s":sid})
pid=gql("query($s:Int!){port(serverId:$s,num:18085){id}}",{"s":sid})["port"]["id"]
dep=gql("mutation($s:[Int!]!,$service:Int!,$p:Int!){deployService(serverIds:$s,serviceId:$service,portId:$p,values:{duration:3600}){id}}",{"s":[sid],"service":service,"p":pid})["deployService"][0]["id"]
def wait(active,status):
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        value=gql("query($id:Int!){serverDeployment(id:$id){isActive status logs{status action output}}}",{"id":dep})["serverDeployment"]
        assert value["status"]!="failed",value
        if value["isActive"]==active and value["status"]==status:return value
        time.sleep(2)
    raise AssertionError(value)
wait(True,"deployed")
gql("mutation($p:Int!){setPortPolicy(id:$p,config:{valid_until:1,due_action:8})}",{"p":pid})
subprocess.run(["docker","compose","-f","docker-compose.yml","-f","ci-compose.yml","exec","-T","worker","python","-c","from tasks.limits import port_limits_runner; port_limits_runner.call_local()"],check=True)
removed=wait(False,"stopped")
assert any(log["action"]=="remove" and log["status"]=="success" for log in removed["logs"]),removed
gql("mutation($p:Int!){deletePort(id:$p)}",{"p":pid})
print("PASS: expired port policy removes actual modern systemd service and preserves successful task log")
