"""Actual TCP forwarding and independent cleanup inside disposable network namespaces."""
import pathlib,subprocess,tempfile,time,urllib.request
def run(*args,check=True):
 return subprocess.run(args,check=check,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
names=["aurora-ci-client","aurora-ci-router","aurora-ci-target"]
def ns(name,*args): return run("ip","netns","exec",name,*args)
source=pathlib.Path("build/backend-overrides/ansible/project/files/iptables.sh").read_text().split('for i in "$@"')[0]
with tempfile.TemporaryDirectory() as directory:
 functions=pathlib.Path(directory)/"functions.sh"; functions.write_text(source)
 server=None
 try:
  for name in names: run("ip","netns","add",name); ns(name,"ip","link","set","lo","up")
  for prefix,left,right,network in [("ac",names[0],names[1],"10.250.1"),("at",names[2],names[1],"10.250.2")]:
   run("ip","link","add",prefix+"0","type","veth","peer","name",prefix+"1")
   run("ip","link","set",prefix+"0","netns",left); run("ip","link","set",prefix+"1","netns",right)
   ns(left,"ip","addr","add",network+".2/24","dev",prefix+"0")
   ns(right,"ip","addr","add",network+".1/24","dev",prefix+"1")
   ns(left,"ip","link","set",prefix+"0","up"); ns(right,"ip","link","set",prefix+"1","up")
   ns(left,"ip","route","add","default","via",network+".1")
  ns(names[1],"sysctl","-w","net.ipv4.ip_forward=1")
  ns(names[1],"iptables","-A","INPUT","-m","comment","--comment","aurora-ci-unrelated","-j","ACCEPT")
  server=subprocess.Popen(["ip","netns","exec",names[2],"python3","-m","http.server","18092","--bind","10.250.2.2","--directory",directory],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  def script(command):
   return ns(names[1],"bash","-c",'source "$1"; SUDO=; save_iptables(){ :; }; TYPE=TCP; INET=10.250.2.1; LOCAL_PORT=18091; REMOTE_IP=10.250.2.2; REMOTE_PORT=18092; '+command,"bash",str(functions))
  script("forward4")
  client="import urllib.request; response=urllib.request.urlopen('http://10.250.1.1:18091/',timeout=3); assert response.status==200; response.read()"
  for attempt in range(20):
   result=run("ip","netns","exec",names[0],"python3","-c",client,check=False)
   if result.returncode==0: break
   time.sleep(.2)
  else: raise AssertionError(result.stderr)
  rules=ns(names[1],"iptables","-t","nat","-S").stdout
  assert "FORWARD 18091->10.250.2.2:18092" in rules,rules
  script("delete")
  rules=ns(names[1],"iptables","-t","nat","-S").stdout
  assert "18091->" not in rules,rules
  assert "aurora-ci-unrelated" in ns(names[1],"iptables","-S").stdout
  result=run("ip","netns","exec",names[0],"python3","-c",client,check=False)
  assert result.returncode!=0,"Forwarding still accessible after removal"
  print("PASS: actual routed HTTP forwarding, NAT cleanup and preservation of unrelated firewall rule")
 finally:
  if server is not None:
   server.terminate()
   try: server.wait(timeout=5)
   except subprocess.TimeoutExpired: server.kill(); server.wait()
  for name in reversed(names): run("ip","netns","del",name,check=False)
