"""Creates only a new local socket-only cluster; never uses managed PG* configuration."""
import os
import pwd
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
user = pwd.getpwnam("lovable")
base = Path(tempfile.mkdtemp(prefix="wiize-accounting-", dir="/tmp"))
os.chown(base, user.pw_uid, user.pw_gid)
(base / "checks").mkdir()
env = {"PATH": "/bin:/usr/bin", "HOME": user.pw_dir}

def lower_privileges():
    os.setgid(user.pw_gid)
    os.setuid(user.pw_uid)

def command(args):
    subprocess.run(args, env=env, cwd="/tmp", preexec_fn=lower_privileges, check=True)

command(["/bin/initdb", "-D", str(base / "cluster"), "-U", "lovable", "--no-locale", "-E", "UTF8", "--auth-local=peer", "--auth-host=reject"])
command(["/bin/pg_ctl", "-D", str(base / "cluster"), "-l", str(base / "server.log"), "-o", f"-p 55439 -k {base} -c listen_addresses= -c unix_socket_permissions=0700", "-w", "start"])
try:
    child_env = {**env, "WIIZE_FIXTURE_DIR": str(base), "WIIZE_FIXTURE_CONFIRMED": "local-only"}
    for script in ("accounting-baseline.py", "accounting-candidate.py"):
        subprocess.run(["/bin/python3", str(root / "scripts/security" / script)], env=child_env, cwd=str(root), check=True)
finally:
    command(["/bin/pg_ctl", "-D", str(base / "cluster"), "-m", "fast", "-w", "stop"])