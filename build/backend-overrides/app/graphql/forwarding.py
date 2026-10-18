"""Authorized creation of a native port forwarding job."""
import re
import ipaddress
from sqlalchemy import select
from strawberry.types import Info
from strawberry.scalars import JSON
from app.db.async_session import async_db_session
from app.db.models import Port as DBPort, PortForwardRule, MethodEnum, ServerDeployment
from .port import require_port_manager

async def configure_native_forward(info: Info, port_id: int, remote_address: str, remote_port: int, protocol: str = "ALL") -> JSON:
    await require_port_manager(info, port_id=port_id)
    remote_address = remote_address.strip()
    try:
        ipaddress.ip_address(remote_address)
    except ValueError:
        if not re.fullmatch(r"(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", remote_address):
            raise ValueError("Invalid forwarding target")
    if not 1 <= remote_port <= 65535 or protocol not in ("TCP", "UDP", "ALL"):
        raise ValueError("Invalid target port or protocol")
    async with async_db_session() as db:
        port = await db.get(DBPort, port_id)
        active = (await db.execute(select(ServerDeployment.id).where(ServerDeployment.port_id == port_id, ServerDeployment.is_active == True))).first()
        if active:
            raise ValueError("Remove the active service before configuring forwarding")
        rule = (await db.execute(select(PortForwardRule).where(PortForwardRule.port_id == port_id))).scalars().first()
        if rule is not None and rule.method != MethodEnum.IPTABLES:
            raise ValueError("Remove the current port function first")
        if rule is None:
            rule = PortForwardRule(port_id=port_id, method=MethodEnum.IPTABLES, config={})
            db.add(rule)
        rule.config = {"remote_address":remote_address,"remote_port":remote_port,"type":protocol}
        rule.is_active = True
        rule.status = "queued"
        server_id, local_port = port.server_id, port.num
        await db.commit()
        await db.refresh(rule)
        rule_id = rule.id
    from tasks.iptables import iptables_runner
    try:
        result = iptables_runner(port_id=port_id, server_id=server_id, local_port=local_port, remote_address=remote_address, remote_port=remote_port, forward_type=protocol, update_status=True)
    except Exception:
        async with async_db_session() as db:
            rule = await db.get(PortForwardRule,rule_id)
            if rule is not None:
                rule.status="failed"
                await db.commit()
        raise
    return {"status":"queued","ruleId":rule_id,"taskId":result.id}
