"""Exercise the deployed API, database persistence and role checks over HTTP."""
import json, urllib.request, urllib.parse, urllib.error, time, os
BASE = os.environ.get("AURORA_TEST_URL", "http://127.0.0.1:8000")
def request(path, payload=None, token=None, form=False):
    headers = {}
    if token: headers["Authorization"] = "Bearer " + token
    if payload is not None:
        body = urllib.parse.urlencode(payload).encode() if form else json.dumps(payload).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
    else: body = None
    with urllib.request.urlopen(urllib.request.Request(BASE + path, data=body, headers=headers), timeout=20) as r:
        return json.load(r)
def login(email, password="ci_test_password_123"):
    return request("/api/token", {"username":email,"password":password}, form=True)["access_token"]
admin = login("admin@example.invalid")
def gql(query, variables=None, token=admin, fail=False):
    result = request("/api/graphql", {"query":query,"variables":variables or {}}, token)
    if fail: assert result.get("errors"), result; return result
    assert not result.get("errors"), result
    return result["data"]
assert request("/api/token", token=admin)["access_token"]
for email in ["member1@example.invalid", "member2@example.invalid"]:
    gql('mutation($email:String!){createUser(email:$email,password:"ci_test_password_123",notes:"initial"){id email notes}}', {"email":email})
# Separate HTTP requests prove create commits instead of being rolled back.
users = gql('{paginatedUsers(email:"member",limit:10){count items{id email notes}}}')["paginatedUsers"]
assert users["count"] == 2 and len(users["items"]) == 2, users
uids = [x["id"] for x in users["items"]]
member = login("member1@example.invalid")
gql('mutation{createUser(email:"unauthorized@example.invalid",password:"ci_test_password_123",isSuperuser:true){id}}',token=member,fail=True)
gql('mutation{createUser(email:"anonymous@example.invalid",password:"ci_test_password_123",isSuperuser:true){id}}',token=None,fail=True)
for i in [1,2]:
    gql('mutation($name:String!,$host:String!){addServer(name:$name,address:$host,host:$host)}', {"name":"CI server "+str(i),"host":"server"+str(i)+".invalid"})
servers = gql('{servers{id name}}')["servers"]
sids = [x["id"] for x in sorted(servers,key=lambda x:x["name"])]
for sid,uid in [(sids[0],uids[0]),(sids[0],uids[1]),(sids[1],uids[0])]:
    gql('mutation($s:Int!,$u:Int!){addServerUser(serverId:$s,userId:$u,notes:"original")}',{"s":sid,"u":uid})
gql('mutation($s:Int!,$u:Int!){updateServerUser(serverId:$s,userId:$u,notes:"changed")}',{"s":sids[0],"u":uids[0]})
def access(sid): return gql('query($s:Int!){server(id:$s){allowedUsers{userId notes}}}',{"s":sid})["server"]["allowedUsers"]
assert {x["userId"]:x["notes"] for x in access(sids[0])} == {uids[0]:"changed",uids[1]:"original"}
assert access(sids[1])[0]["notes"] == "original"
gql('mutation($s:Int!,$u:Int!){deleteServerUser(serverId:$s,userId:$u)}',{"s":sids[0],"u":uids[0]})
assert len(access(sids[0])) == 1 and len(access(sids[1])) == 1
gql('mutation($id:Int!){updateUser(id:$id,notes:"",isOps:true)}',{"id":uids[1]})
assert gql('query($id:Int!){user(id:$id){notes isOps}}',{"id":uids[1]})["user"] == {"notes":"","isOps":True}
gql('mutation($s:Int!){addPort(serverId:$s,num:18080,config:{},notes:"CI")}',{"s":sids[0]})
port=gql('query($s:Int!){port(serverId:$s,num:18080){id num}}',{"s":sids[0]})["port"]
assert port["num"]==18080
gql('mutation($id:Int!){updatePort(id:$id,num:18081)}',{"id":port["id"]})
assert gql('query($id:Int!){port(id:$id){num}}',{"id":port["id"]})["port"]["num"]==18081
gql('mutation($id:Int!){deletePort(id:$id)}',{"id":port["id"]})
contract={"schemaVersion":"aurora-exec/v1","contractKey":"ci_echo","version":1,"title":"CI echo","requiresPort":False,"exec":{"bin":"/usr/bin/echo","baseArgs":["hello"]},"params":[{"key":"name","type":"string","label":"Name","default":"world","emit":{"arg":"--name"}}]}
service=gql('mutation($c:JSON!){createServiceDefinition(configJson:$c){id title}}',{"c":contract})["createServiceDefinition"]
preview=gql('mutation($id:Int!){compileServicePreviewById(id:$id,values:{name:"integration"})}',{"id":service["id"]})["compileServicePreviewById"]
assert preview.get("ok"), preview
contract["title"]="CI echo updated"
gql('mutation($id:Int!,$c:JSON!){updateServiceDefinition(id:$id,configJson:$c)}',{"id":service["id"],"c":contract})
assert gql('query($id:Int!){serviceDefinition(id:$id){title}}',{"id":service["id"]})["serviceDefinition"]["title"]=="CI echo updated"
gql('mutation($id:Int!){deleteServiceDefinition(id:$id)}',{"id":service["id"]})
# Own-account protections are enforced at the API, independently of disabled UI buttons.
own=gql('{users{id email}}')["users"]
own=next(x["id"] for x in own if x["email"]=="admin@example.invalid")
gql('mutation($id:Int!){deleteUser(id:$id)}',{"id":own},fail=True)
gql('mutation($id:Int!){updateUser(id:$id,isActive:false)}',{"id":own},fail=True)
print("PASS: login, token refresh, user persistence/search/edit, anonymous/member rejection, targeted server access changes, port CRUD, service CRUD/compile, self-account protections")
