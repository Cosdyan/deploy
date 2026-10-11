#!/usr/bin/env python3
"""Exercise terminal input and backend readiness without running Docker."""
import errno
import os
from pathlib import Path
import pty
import select
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
LOAD = 'source <(sed -n \'/^function check_system()/,$p\' "$1" | sed \'$d\'); Info=INFO; Error=ERROR; Tip=TIP; '
SCRIPT = str(ROOT / "install.sh")

# A detached process must fail clearly before invoking Compose.
result = subprocess.run(
    ["bash", "-c", LOAD + "docker-compose() { exit 99; }; create_superuser", "_", SCRIPT],
    stdin=subprocess.DEVNULL, capture_output=True, text=True, start_new_session=True,
)
assert result.returncode == 1, result
assert "交互终端" in result.stdout, result.stdout

# Backend readiness retries, succeeds once listening, and reports timeout logs.
readiness = r'''
attempts=0
sleeps=0
logged=0
docker-compose() {
    if [[ $1 == logs ]]; then logged=1; return 0; fi
    [[ $* == *"exec -T backend python -c"* ]]
    attempts=$((attempts+1))
    (( attempts >= 3 ))
}
sleep() { sleeps=$((sleeps+1)); }
wait_backend
[[ $attempts == 3 && $sleeps == 2 ]]
attempts=0; sleeps=0
docker-compose() {
    if [[ $1 == logs ]]; then logged=1; return 0; fi
    attempts=$((attempts+1))
    return 1
}
if wait_backend; then exit 1; fi
[[ $attempts == 60 && $sleeps == 60 && $logged == 1 ]]
'''
subprocess.run(["bash", "-eu", "-c", LOAD + readiness, "_", SCRIPT], check=True)

# Reproduce a controlling terminal with stdin disconnected (EOF).
# The Compose stub stands in for Python input()/getpass() inside the container.
def terminal_case(exit_status):
    code = LOAD + r'''
wait_backend() { :; }
docker-compose() {
    [[ $* == "exec backend python app/initial_data.py" ]] || return 90
    [[ -t 0 ]] || return 91
    printf 'EMAIL_PROMPT\n'
    IFS= read -r email
    [[ $email == "test@example.invalid" ]] || return 92
    printf 'PASSWORD_PROMPT\n'
    IFS= read -rs password
    [[ $password == "test_password_123" ]] || return 93
    printf '\nINPUT_RECEIVED\n'
    return ''' + str(exit_status) + r'''
}
create_superuser </dev/null
'''
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("bash", ["bash", "-eu", "-c", code, "_", SCRIPT])
    output = b""
    email_sent = password_sent = False
    deadline = time.monotonic() + 15
    status = None
    try:
        while time.monotonic() < deadline:
            readable, _, _ = select.select([fd], [], [], 0.1)
            if readable:
                try:
                    block = os.read(fd, 4096)
                except OSError as exc:
                    if exc.errno != errno.EIO:
                        raise
                    break
                if not block:
                    break
                output += block
                if b"EMAIL_PROMPT" in output and not email_sent:
                    os.write(fd, b"test@example.invalid\n")
                    email_sent = True
                if b"PASSWORD_PROMPT" in output and not password_sent:
                    os.write(fd, b"test_password_123\n")
                    password_sent = True
        else:
            raise AssertionError("Terminal test timed out: " + repr(output))
        _, status = os.waitpid(pid, 0)
        assert os.waitstatus_to_exitcode(status) == exit_status, output
        assert b"INPUT_RECEIVED" in output, output
    finally:
        os.close(fd)
        if status is None:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)

terminal_case(0)
terminal_case(7)  # Initialization failure must reach the caller.
print("Administrator terminal and backend readiness regression tests passed")
