"""Verify restored runner imports, private inventories and actual playbook execution."""
import subprocess
code = r'''
import os
from pathlib import Path
from app.db.session import db_session
from app.db.models import Server
from tasks.utils.runner import run
from tasks import app_runner, rule_runner, tc_runner, clean_port_no_update_runner
with db_session() as db:
    server = db.query(Server).filter(Server.name == "CI SSH target").one()
playbook = Path("ansible/project/ci-legacy.yml")
playbook.write_text("""---
- hosts: "{{ host }}"
  gather_facts: false
  become: true
  tasks:
    - name: Verify original style playbook can execute on managed host
      command: /usr/bin/printf aurora-legacy-ready
      changed_when: false
""")
before = set(Path("ansible/priv_data_dirs").glob("*"))
for i in range(2):
    result = run(server, "ci-legacy.yml")
    assert result.status == "successful", result.status
after = set(Path("ansible/priv_data_dirs").glob("*"))
created = after - before
assert len(created) == 2, created
for directory in created:
    assert directory.stat().st_mode & 0o777 == 0o700
    assert (directory / "inventory.json").stat().st_mode & 0o777 == 0o600
print("PASS: restored task imports, real Ansible runner with sudo and independent private inventories")
'''
subprocess.run(["docker","compose","-f","docker-compose.yml","-f","ci-compose.yml","exec","-T","worker","python","-c",code],check=True)
