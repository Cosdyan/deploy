"""Real SSH and systemd lifecycle on the disposable Actions VM."""
import json, time, urllib.request, urllib.parse
BASE="http://127.0.0.1:8000"
def request(path,data,token=None,form=False):
    payload=urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()
    headers={"Content-Type":"application/x-www-form-urlencoded" if form else "application/json"}
    if token: headers["Authorization"]="Bearer "+token
    with urllib.request.urlopen(urllib.request.Request(BASE+path,data=payload,headers=headers),timeout=30) as r:return json.load(r)
token=request("/api/token",{"username":"admin@example.invalid","password":"ci_test_password_123"},form=True)["access_token"]
def gql(query,variables=None):
    r=request("/api/graphql",{"query":query,"variables":variables or {}},token)
    assert not r.get("errors"),r
    return r["data"]
gql('mutation{addServer(name:"CI SSH target",address:"host.docker.internal",host:"host.docker.internal",port:22,user:"aurora_ci",sshPassword:"ci_ssh_password_123")}')
sid=next(x["id"] for x in gql("{servers{id name}}")["servers"] if x["name"]=="CI SSH target")
contract={"schemaVersion":"aurora-exec/v1","contractKey":"ci_sleep","version":1,"title":"CI lifecycle","requiresPort":False,"exec":{"bin":"/usr/bin/sleep","workingDir":"/tmp"},"params":[{"key":"duration","type":"int","label":"Duration","default":3600,"emit":{"pos":0}}]}
service=gql("mutation($c:JSON!){createServiceDefinition(configJson:$c){id}}",{"c":contract})["createServiceDefinition"]["id"]
dep=gql("mutation($s:[Int!]!,$id:Int!){deployService(serverIds:$s,serviceId:$id,values:{duration:3600}){id}}",{"s":[sid],"id":service})["deployService"][0]["id"]
def wait_deployment(expected, log_id=None):
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        d=gql("query($id:Int!){serverDeployment(id:$id){status isActive logs{id status output action}}}",{"id":dep})["serverDeployment"]
        if log_id:
            log=next((l for l in d["logs"] if l["id"]==log_id),None)
            if log and log["status"]=="failed":raise AssertionError(log)
            if log and log["status"]=="success" and d["status"]==expected:return d
        elif d["status"]==expected:return d
        if d["status"]=="failed":raise AssertionError(d)
        time.sleep(2)
    raise AssertionError(d)
wait_deployment("deployed")
for mutation,expected in [("stopDeployment","stopped"),("startDeployment","deployed"),("redeployExecutable","deployed"),("removeDeployment","stopped")]:
    result=gql("mutation($id:Int!){"+mutation+"(deploymentId:$id){id}}",{"id":dep})[mutation]
    last=wait_deployment(expected,result["id"])
assert last["isActive"] is False
print("PASS: actual SSH connection, systemd deploy/stop/start/redeploy/remove and task logs")
