"""Runs only through the existing socket-only runner, never inherited PG credentials."""
import os,pwd,subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
assert os.environ.get('WIIZE_FIXTURE_CONFIRMED')=='local-only'
b=Path(os.environ['WIIZE_FIXTURE_DIR']); assert b.parent==Path('/tmp') and b.name.startswith('wiize-accounting-')
u=pwd.getpwnam('lovable');root=Path(__file__).resolve().parents[2]
def lower():os.setgid(u.pw_gid);os.setuid(u.pw_uid)
def sql(q,ok=True):
 r=subprocess.run(['/bin/psql','-X','--no-password','-h',str(b),'-p','55439','-U','lovable','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',q],env={'PATH':'/bin:/usr/bin','HOME':u.pw_dir},cwd='/tmp',preexec_fn=lower,capture_output=True,text=True)
 if ok and r.returncode:raise RuntimeError(r.stderr)
 if not ok:assert r.returncode!=0
 return r.stdout.strip()
sql("ALTER TABLE anticipation_requests ADD COLUMN last_extra text; CREATE TABLE refunds(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,payment_id uuid,status text,last_provider_event_id text); ALTER TABLE notifications ADD COLUMN id uuid DEFAULT gen_random_uuid(), ADD COLUMN read_at timestamptz; CREATE FUNCTION public.mfa_satisfied() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('fixture.aal',true),'')='aal2' $$; CREATE FUNCTION public.is_tenant_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('fixture.member',true),'')='yes' $$;")
sql((root/'docs/migrations-pendentes/security-accounting-guards.sql').read_text())
a='00000000-0000-4000-8000-000000000001';p='00000000-0000-4000-8000-000000000002';r='00000000-0000-4000-8000-000000000004'
sql(f"UPDATE payments SET released_at=now(),refund_reserved_pending=0; UPDATE wallets SET pending_balance=260,available_balance=0; UPDATE coproduction_splits SET status='received',refunded_amount=40;")
assert sql(f"SELECT release_coproduction_splits('{p}')")=='1'
assert sql("SELECT pending_balance||','||available_balance FROM wallets")=='200.00,60.00'
assert sql(f"SELECT release_coproduction_splits('{p}')")=='0'
sql(f"INSERT INTO refunds(tenant_id,payment_id,status) VALUES('{a}','{p}','requested')",False)
sql(f"UPDATE anticipation_requests SET status='failed',last_provider_event_id='definitive-rejection'; INSERT INTO refunds(tenant_id,payment_id,status) VALUES('{a}','{p}','requested');")
sql(f"UPDATE anticipation_requests SET status='pending' WHERE id='{r}'",False)
sql("UPDATE refunds SET status='failed'",False)
assert sql("SELECT status FROM refunds")=='requested'
sql("UPDATE refunds SET status='failed',last_provider_event_id='definitive-refund-denied'")
sql(f"UPDATE anticipation_requests SET status='pending' WHERE id='{r}'")
sql(f"UPDATE anticipation_requests SET status='failed' WHERE id='{r}'",False)
sql(f"UPDATE anticipation_requests SET status='failed',last_provider_event_id='new-denial' WHERE id='{r}'; DELETE FROM refunds;")
with ThreadPoolExecutor(max_workers=2) as pool:
 tasks=[f"BEGIN; UPDATE anticipation_requests SET status='pending' WHERE id='{r}'; SELECT pg_sleep(0.1); COMMIT;",f"BEGIN; INSERT INTO refunds(tenant_id,payment_id,status) VALUES('{a}','{p}','requested'); COMMIT;"]
 def attempt(q):
  try:sql(q);return True
  except RuntimeError:return False
 results=list(pool.map(attempt,tasks))
assert sum(results)==1,results
sql(f"SELECT mark_notifications_read('{a}',NULL)",False)
assert sql(f"SET fixture.aal='aal2'; SET fixture.member='yes'; SELECT mark_notifications_read('{a}',NULL)").splitlines()[-1]=='1'
assert sql("SELECT has_function_privilege('authenticated','release_coproduction_splits(uuid)','EXECUTE')")=='f'
print('PASS guards: split remainder 60, replay, mutual admission, scope lock, unknown outcomes retain state, concurrent single admission, MFA and server-only grants')