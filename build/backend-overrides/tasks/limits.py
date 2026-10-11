"""Check deadline and stored traffic policies independently of traffic collection."""
import logging
from huey import crontab
from app.db.models import Port
from app.db.session import db_session
from tasks.config import huey
from tasks.utils.usage import check_port_limits

@huey.periodic_task(crontab(minute="*"))
def port_limits_runner():
    with db_session() as db:
        for port in db.query(Port).filter(Port.is_active == True).all():
            if not port.config.get("valid_until") and not port.config.get("quota"):
                continue
            try:
                check_port_limits(db, port)
            except (ValueError, TypeError):
                logging.exception("Invalid restriction settings for port %s", port.id)
