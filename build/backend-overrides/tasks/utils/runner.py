"""Run original playbooks using a private per-task inventory."""
import json
import os
from pathlib import Path
from uuid import uuid4
import ansible_runner
from app.db.session import db_session
from app.db.crud.server import get_server


def prepare_run(server, extravars=None):
    if not server:
        raise ValueError("Server not found")
    sid = server["id"] if isinstance(server, dict) else server.id
    with db_session() as db:
        target = get_server(db, sid)
        if target is None:
            raise ValueError("Server not found")
        host = target.host
        variables = {
            "ansible_host": host,
            "ansible_user": target.user or "root",
            "ansible_port": target.port or 22,
            "ansible_connection": "ssh",
        }
        if target.ssh_password:
            variables["ansible_password"] = target.ssh_password
        if target.sudo_password:
            variables["ansible_become_password"] = target.sudo_password
        if target.key_file:
            variables["ansible_ssh_private_key_file"] = target.key_file.storage_path
        elif not target.ssh_password and Path("/app/ansible/env/ssh_key").is_file():
            variables["ansible_ssh_private_key_file"] = "/app/ansible/env/ssh_key"
    directory = Path("ansible/priv_data_dirs") / (str(sid) + "-" + uuid4().hex)
    directory.mkdir(parents=True, mode=0o700)
    os.chmod(directory, 0o700)
    inventory = directory / "inventory.json"
    inventory.write_text(json.dumps({"all": {"hosts": {host: variables}}}))
    os.chmod(inventory, 0o600)
    values = dict(extravars or {})
    values["host"] = host
    return directory, inventory, values


def execute(async_mode, server, playbook, extravars=None, ident=None, **kwargs):
    directory, inventory, values = prepare_run(server, extravars)
    executor = ansible_runner.run_async if async_mode else ansible_runner.run
    return executor(
        ident=str(ident or uuid4()),
        private_data_dir=str(directory.resolve()),
        project_dir=str(Path("ansible/project").resolve()),
        inventory=str(inventory.resolve()),
        playbook=playbook,
        extravars=values,
        envvars={"ANSIBLE_HOST_KEY_CHECKING": "False"},
        **kwargs
    )


def run(server, playbook, extravars=None, ident=None, **kwargs):
    return execute(False, server, playbook, extravars, ident, **kwargs)


def run_async(server, playbook, extravars=None, ident=None, **kwargs):
    return execute(True, server, playbook, extravars, ident, **kwargs)
