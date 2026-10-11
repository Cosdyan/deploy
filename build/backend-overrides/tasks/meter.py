"""Collect managed-port traffic without changing firewall accept/drop policy."""
import fcntl
import re
import shlex
from time import time
from huey import crontab
from app.db.models import Server, Port, PortUsage
from app.db.session import db_session
from app.core.config import TRAFFIC_INTERVAL_SECONDS
from tasks.config import huey
from tasks.utils.connect import connect
from tasks.utils.usage import check_port_limits

def meter_commands(ports):
    commands = []
    for tool in ("iptables", "ip6tables"):
        for chain, direction, hook in (("AURORA_UPLOAD", "sport", "OUTPUT"), ("AURORA_DOWNLOAD", "dport", "INPUT")):
            commands.append(f"{tool} -w -N {chain} 2>/dev/null || {tool} -w -L {chain} -n >/dev/null")
            commands.append(f"{tool} -w -C {hook} -j {chain} 2>/dev/null || {tool} -w -I {hook} 1 -j {chain}")
            for port in ports:
                if not 1 <= port <= 65535:
                    raise ValueError("Invalid metered port")
                for protocol in ("tcp", "udp"):
                    rule=f"-p {protocol} --{direction} {port} -m comment --comment AURORA_{hook}_{port}_{tool}_{protocol}"
                    commands.append(f"{tool} -w -C {chain} {rule} 2>/dev/null || {tool} -w -A {chain} {rule}")
    return "set -e; " + "; ".join(commands)

def parse_counters(text):
    totals={}
    for line in text.splitlines():
        counter=re.match(r"^\[(\d+):(\d+)\] ",line)
        if not counter:
            continue
        fields=shlex.split(line[counter.end():])
        if "--comment" not in fields:
            continue
        label=fields[fields.index("--comment")+1]
        match=re.fullmatch(r"AURORA_(INPUT|OUTPUT)_(\d+)_(iptables|ip6tables)_(tcp|udp)",label)
        if not match:
            continue
        port=int(match[2])
        direction="download" if match[1]=="INPUT" else "upload"
        key=f"{direction}:{match[3]}:{match[4]}"
        totals.setdefault(port,{})[key]=int(counter[2])
    return totals

@huey.task()
def collect_port_traffic(server_id):
    with open(f"/tmp/aurora-traffic-{server_id}.lock","a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        with db_session() as db:
            ports=db.query(Port).filter(Port.server_id==server_id,Port.is_active==True).all()
            numbers=[port.num for port in ports]
        if not numbers:
            return {"status":"empty","server_id":server_id,"ports":0}
        with connect(server_id) as conn:
            conn.sudo("sh -c " + shlex.quote(meter_commands(numbers)),hide=True)
            result=conn.sudo("sh -c " + shlex.quote("set -e; iptables-save -c; ip6tables-save -c"),hide=True)
        totals=parse_counters(result.stdout)
        with db_session() as db:
            ports=db.query(Port).filter(Port.server_id==server_id,Port.is_active==True).all()
            for port in ports:
                current=totals.get(port.num,{})
                previous=port.config.get("_traffic_raw",{})
                usage=port.usage
                if usage is None:
                    usage=PortUsage(port_id=port.id,download=0,upload=0)
                    db.add(usage)
                for source,raw in current.items():
                    direction=source.split(":")[0]
                    last=previous.get(source,0)
                    delta=raw-last if raw>=last else raw
                    setattr(usage,direction,(getattr(usage,direction) or 0)+delta)
                port.config["_traffic_raw"]=current
            db.commit()
            for port in ports:
                db.refresh(port)
                check_port_limits(db,port)
        return {"status":"collected","server_id":server_id,"ports":len(ports)}

interval=max(1,int(TRAFFIC_INTERVAL_SECONDS)//60)
@huey.periodic_task(crontab(minute="*"))
def collect_all_port_traffic():
    if (int(time())//60) % interval:
        return
    with db_session() as db:
        server_ids=[row[0] for row in db.query(Server.id).join(Port).filter(
            Server.is_active==True,Port.is_active==True
        ).distinct().all()]
    for server_id in server_ids:
        collect_port_traffic(server_id)
