"""Reproduce the candidate's terminal-event incompatibility, local fixture only."""
import os
import pwd
import subprocess
from pathlib import Path

assert os.environ.get("WIIZE_FIXTURE_CONFIRMED") == "local-only"
base = Path(os.environ["WIIZE_FIXTURE_DIR"])
assert base.parent == Path("/tmp") and base.name.startswith("wiize-accounting-")
user = pwd.getpwnam("lovable")

def lower():
    os.setgid(user.pw_gid)
    os.setuid(user.pw_uid)

def sql(query):
    return subprocess.run(
        ["/bin/psql", "-X", "--no-password", "-h", str(base), "-p", "55439",
         "-U", "lovable", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", query],
        env={"PATH": "/bin:/usr/bin", "HOME": user.pw_dir}, cwd="/tmp",
        preexec_fn=lower, capture_output=True, text=True,
    )

# Use an existing synthetic operation. The active event RPCs perform these two
# UPDATE statements in one transaction: event ID first, terminal status second.
setup = sql("DELETE FROM refunds; UPDATE anticipation_requests SET status='processing';")
assert setup.returncode == 0, setup.stderr
before = sql("SELECT status||','||coalesce(last_provider_event_id,'') FROM anticipation_requests;")
assert before.returncode == 0
result = sql("BEGIN; UPDATE anticipation_requests SET last_provider_event_id='fixture-official-denial'; UPDATE anticipation_requests SET status='failed'; COMMIT;")
assert result.returncode != 0, "Candidate unexpectedly accepted the active RPC sequence"
assert "provider_outcome_requires_reconciliation" in result.stderr, result.stderr
after = sql("SELECT status||','||coalesce(last_provider_event_id,'') FROM anticipation_requests;")
assert after.returncode == 0 and after.stdout == before.stdout

# Positive control: a single combined write is accepted by this guard, showing
# that the failure above is the real sequencing incompatibility, not transport.
control = sql("UPDATE anticipation_requests SET status='failed',last_provider_event_id='fixture-combined-denial'; SELECT status FROM anticipation_requests;")
assert control.returncode == 0, control.stderr
assert control.stdout.strip().splitlines()[-1] == "failed"
print("BLOCKER REPRODUCED: official denial sequence rolls back under candidate guard; combined-write positive control succeeds. Do not deploy candidate.")