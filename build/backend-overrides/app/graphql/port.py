import typing
from typing import TYPE_CHECKING, Optional, List
from typing_extensions import Annotated

import strawberry
from decimal import Decimal
from app.db.models import (
    MethodEnum,
    Port as DBPort,
    PortUser as DBPortUser,
    ServerUser as DBServerUser,
)
from app.db.async_session import async_db_session
from strawberry.scalars import JSON
from sqlalchemy import select, or_, func, insert, update, delete
from sqlalchemy.orm import joinedload, Query
from app.utils.selection import get_selections
from strawberry.types import Info
from strawberry.types.nodes import Selection
from .utils import PaginationWindow

if TYPE_CHECKING:
    from .port_forward import PortForwardRule
    from .server import Server
    from .user import User


count_cache: typing.Dict[int, int] = {}

def visible_ports(stmt, user):
    """Use the same access boundary for lists, individual ports and counts."""
    if user.is_superuser:
        return stmt
    conditions = [DBPort.id.in_(select(DBPortUser.port_id).where(DBPortUser.user_id == user.id))]
    if user.is_ops:
        conditions.append(DBPort.server_id.in_(select(DBServerUser.server_id).where(DBServerUser.user_id == user.id)))
    return stmt.where(or_(*conditions))


async def require_port_manager(info: Info, port_id: Optional[int] = None, server_id: Optional[int] = None):
    user = info.context["request"].state.user
    if port_id is not None:
        async with async_db_session() as db:
            server_id = (await db.execute(select(DBPort.server_id).where(DBPort.id == port_id))).scalar()
        if server_id is None:
            raise ValueError("Port not found")
    if user.is_superuser:
        return
    if not user.is_ops:
        raise PermissionError("Port management requires an administrator")
    async with async_db_session() as db:
        assigned = (await db.execute(select(DBServerUser.id).where(
            DBServerUser.server_id == server_id, DBServerUser.user_id == user.id
        ))).first()
    if assigned is None:
        raise PermissionError("You cannot manage ports on this server")


def validate_port_number(value):
    if value is not None and not 1 <= value <= 65535:
        raise ValueError("Port must be between 1 and 65535")


@strawberry.type
class Port:
    id: int
    external_num: Optional[int]
    num: int
    server_id: int
    config: JSON
    notes: Optional[str]
    is_active: bool

    server: Annotated["Server", strawberry.lazy(".server")]
    users: typing.List[Annotated["User", strawberry.lazy(".user")]]
    allowed_users: typing.List[Annotated["PortUser", strawberry.lazy(".port")]]
    forward_rule: Optional[
        Annotated["PortForwardRule", strawberry.lazy(".port_forward")]
    ]
    usage: Optional["PortUsage"]

    @staticmethod
    async def get_rule_options(info: Info, port_id: int) -> List[str]:
        stmt = (
            select(DBPort)
            .where(DBPort.id == port_id)
            .options(joinedload(DBPort.server))
        )

        stmt = visible_ports(stmt, info.context["request"].state.user)
        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            port = result.scalars().unique().first()
            if port is None:
                raise PermissionError("Port not found or access denied")
            return [
                m.value
                for m in MethodEnum
                if not port.server.config.get(f"{m.value}_disabled", False)
                and not port.config.get(f"{m.value}_disabled", False)
            ]

    @staticmethod
    def set_options(stmt: Query, selections: List[Selection]) -> Query:
        if selection := get_selections(selections, "server"):
            options = joinedload(DBPort.server)
            stmt = stmt.options(options)
        if selection := get_selections(selections, "users"):
            options = joinedload(DBPort.users)
            stmt = stmt.options(options)
        if selection := get_selections(selections, "allowedUsers"):
            options = joinedload(DBPort.allowed_users)
            if selection := get_selections(selection.selections, "user"):
                options = options.joinedload(DBPortUser.user)
            stmt = stmt.options(options)
        if selection := get_selections(selections, "forwardRule"):
            options = joinedload(DBPort.forward_rule)
            stmt = stmt.options(options)
        if selection := get_selections(selections, "usage"):
            options = joinedload(DBPort.usage)
            stmt = stmt.options(options)
        return stmt

    @staticmethod
    async def get_ports(info: Info, order_by: str = "num") -> List["Port"]:
        stmt = Port.set_options(
            select(DBPort).order_by(order_by),
            get_selections(info.selected_fields, info.field_name).selections,
        )

        stmt = visible_ports(stmt, info.context["request"].state.user)
        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            return result.scalars().unique().all()

    @staticmethod
    async def get_paginated_ports(
        info: Info,
        order_by: str = "num",
        server_id: Optional[int] = None,
        limit: int = 10,
        offset: int = 0,
    ) -> PaginationWindow["Port"]:
        stmt = Port.set_options(
            select(DBPort)
            .order_by(order_by)
            .options(joinedload(DBPort.allowed_users))
            .where(DBPort.is_active == True),
            get_selections(
                info.selected_fields, f"{info.field_name}.items"
            ).selections,
        )
        if server_id:
            stmt = stmt.where(DBPort.server_id == server_id)
        stmt = visible_ports(stmt, info.context["request"].state.user).offset(offset).limit(limit)

        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            return PaginationWindow(
                items=result.scalars().unique().all(),
                count=await Port.get_port_count(info, server_id=server_id),
            )

    @staticmethod
    async def get_port(
        info: Info,
        id: Optional[int] = None,
        server_id: Optional[int] = None,
        num: Optional[int] = None,
    ) -> Optional["Port"]:
        stmt = Port.set_options(
            select(DBPort),
            get_selections(
                info.selected_fields, f"{info.field_name}"
            ).selections,
        )
        if id:
            stmt = stmt.where(DBPort.id == id)
        if server_id:
            stmt = stmt.where(DBPort.server_id == server_id)
        if num:
            stmt = stmt.where(
                or_(DBPort.num == num, DBPort.external_num == num)
            )

        stmt = visible_ports(stmt, info.context["request"].state.user)
        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            return result.scalars().unique().first()

    @staticmethod
    async def get_port_count(
        info: Info, server_id: Optional[int] = None
    ) -> int:
        stmt = visible_ports(select(func.count(DBPort.id)), info.context["request"].state.user)
        stmt = stmt.where(DBPort.is_active == True)
        if server_id is not None:
            stmt = stmt.where(DBPort.server_id == server_id)
        async with async_db_session() as db:
            return (await db.execute(stmt)).scalar()

    @staticmethod
    async def get_available_ports_for_deployment(
        info: Info,
        server_id: int,
    ) -> List["Port"]:
        """Return ports on this server the current user can access
        with no active deployment."""
        from app.db.models import ServerDeployment as DBServerDeployment

        user = info.context["request"].state.user

        # Subquery: port_ids that already have an active deployment
        active_port_ids = (
            select(DBServerDeployment.port_id)
            .where(
                DBServerDeployment.is_active == True,
                DBServerDeployment.port_id.isnot(None),
            )
            .scalar_subquery()
        )

        stmt = select(DBPort).where(
            DBPort.server_id == server_id,
            DBPort.is_active == True,
            DBPort.id.notin_(active_port_ids),
        ).order_by(DBPort.num)

        # Access control
        if not user.is_superuser:
            if user.is_ops:
                admin_server_ids = select(DBServerUser.server_id).where(
                    DBServerUser.user_id == user.id
                )
                stmt = stmt.where(
                    or_(
                        DBPort.server_id.in_(admin_server_ids),
                        DBPort.id.in_(
                            select(DBPortUser.port_id).where(DBPortUser.user_id == user.id)
                        ),
                    )
                )
            else:
                stmt = stmt.where(
                    DBPort.id.in_(
                        select(DBPortUser.port_id).where(DBPortUser.user_id == user.id)
                    )
                )

        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            return result.scalars().unique().all()

    @staticmethod
    async def add_port(
        info: Info,
        server_id: int,
        num: int,
        external_num: Optional[int] = None,
        config: Optional[JSON] = None,
        notes: Optional[str] = None,
    ) -> bool:
        await require_port_manager(info, server_id=server_id)
        validate_port_number(num)
        validate_port_number(external_num)
        stmt = insert(DBPort).values(
            server_id=server_id,
            num=num,
            external_num=external_num,
            config=config or {},
            notes=notes,
        )

        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            await async_db.commit()
        count_cache.clear()
        return result.rowcount > 0

    @staticmethod
    async def update_port(
        info: Info,
        id: int,
        server_id: Optional[int] = None,
        num: Optional[int] = None,
        external_num: Optional[int] = strawberry.UNSET,
        config: Optional[JSON] = None,
        notes: Optional[str] = None,
    ) -> bool:
        await require_port_manager(info, port_id=id)
        if server_id is not None:
            await require_port_manager(info, server_id=server_id)
        validate_port_number(num)
        if external_num is not strawberry.UNSET:
            validate_port_number(external_num)
        stmt = update(DBPort).where(DBPort.id == id)
        if server_id:
            stmt = stmt.values(server_id=server_id)
        if num:
            stmt = stmt.values(num=num)
        if external_num is not strawberry.UNSET:
            stmt = stmt.values(external_num=external_num)
        if config is not None:
            stmt = stmt.values(config=config)
        if notes is not None:
            stmt = stmt.values(notes=notes)

        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            await async_db.commit()
        count_cache.clear()
        return result.rowcount > 0

    @staticmethod
    async def delete_port(info: Info, id: int) -> bool:
        await require_port_manager(info, port_id=id)
        from app.db.models import ServerDeployment as DBServerDeployment
        async with async_db_session() as db:
            # A running service must be removed through its lifecycle first.
            active = (await db.execute(select(DBServerDeployment.id).where(
                DBServerDeployment.port_id == id, DBServerDeployment.is_active == True
            ))).first()
            if active:
                raise ValueError("Remove the active deployment before deleting its port")
            await db.execute(update(DBServerDeployment).where(
                DBServerDeployment.port_id == id
            ).values(port_id=None))
            port = (await db.execute(select(DBPort).where(DBPort.id == id))).scalars().first()
            if port is None:
                return False
            await db.delete(port)
            await db.commit()
        count_cache.clear()
        return True


@strawberry.type
class PortUser:
    id: int
    port_id: int
    user_id: int
    config: JSON

    user: Annotated["User", strawberry.lazy(".user")]
    port: Annotated["Port", strawberry.lazy(".port")]

    @staticmethod
    async def add_port_user(
        info: Info,
        port_id: int,
        user_id: int,
        config: Optional[JSON] = None,
    ) -> bool:
        await require_port_manager(info, port_id=port_id)
        stmt = insert(DBPortUser).values(
            port_id=port_id, user_id=user_id, config=config or {}
        )

        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            await async_db.commit()
        count_cache.clear()
        return result.rowcount > 0

    @staticmethod
    async def delete_port_user(info: Info, port_id: int, user_id: int) -> bool:
        await require_port_manager(info, port_id=port_id)
        stmt = delete(DBPortUser).where(
            DBPortUser.port_id == port_id, DBPortUser.user_id == user_id
        )

        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            await async_db.commit()
        count_cache.clear()
        return result.rowcount > 0

    @staticmethod
    async def update_port_user(
        info: Info,
        port_id: int,
        user_id: int,
        config: Optional[JSON] = None,
    ) -> bool:
        await require_port_manager(info, port_id=port_id)
        stmt = update(DBPortUser).where(
            DBPortUser.port_id == port_id, DBPortUser.user_id == user_id
        )
        if config is not None:
            stmt = stmt.values(config=config)

        async with async_db_session() as async_db:
            result = await async_db.execute(stmt)
            await async_db.commit()
        count_cache.clear()
        return result.rowcount > 0


@strawberry.type
class PortUsage:
    id: int
    port_id: int
    download: Decimal
    upload: Decimal
    download_accumulate: Decimal
    upload_accumulate: Decimal
    download_checkpoint: int
    upload_checkpoint: int

    port: Annotated["Port", strawberry.lazy(".port")]
