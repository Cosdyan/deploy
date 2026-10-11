from sqlalchemy import select
from app.db.async_session import async_db_session
from app.db.models import User as DBUser, ServerUser

async def has_permission_of_server(user: DBUser, server_id: int) -> bool:
    if user is None or not user.is_active:
        return False
    if user.is_superuser:
        return True
    async with async_db_session() as db:
        result = await db.execute(select(ServerUser.id).where(
            ServerUser.user_id == user.id, ServerUser.server_id == server_id
        ))
        return result.first() is not None
