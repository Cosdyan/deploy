from app.db.session import db_session
from app.db.crud.server import get_server
from app.db.models import Port

from .config import huey
from tasks.utils.runner import run


@huey.task(priority=1)
def tc_runner(
    server_id: int,
    port_num: int,
    egress_limit: int = None,
    ingress_limit: int = None,
    port_id: int = None
):
    with db_session() as db:
        server = get_server(db, server_id)
    args = ""
    if egress_limit:
        args += f' -e={egress_limit}kbit'
    if ingress_limit:
        args += f' -i={ingress_limit}kbit'
    args += f' {port_num}'

    def mark(status):
        if port_id is not None:
            with db_session() as db:
                port = db.get(Port, port_id)
                if port is not None and port.config.get("egress_limit", 0) == (egress_limit or 0) and port.config.get("ingress_limit", 0) == (ingress_limit or 0):
                    port.config["speed_limit_status"] = status
                    db.commit()
    try:
        import fcntl
        with open(f"/tmp/aurora-tc-{server_id}-{port_num}.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if port_id is not None:
                with db_session() as db:
                    port = db.get(Port, port_id)
                    if port is None or port.config.get("egress_limit", 0) != (egress_limit or 0) or port.config.get("ingress_limit", 0) != (ingress_limit or 0):
                        return {"status": "superseded"}
            result = run(server=server, playbook="tc.yml", extravars={"host": server.host, "tc_args": args})
            if result.status != "successful":
                raise RuntimeError("Traffic control playbook failed")
            mark("applied")
    except Exception:
        mark("failed")
        raise
