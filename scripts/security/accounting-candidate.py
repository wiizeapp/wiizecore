import os,pwd,subprocess,re
from pathlib import Path
assert os.environ.get('WIIZE_FIXTURE_CONFIRMED') == 'local-only', 'Use run-accounting-fixture.py'
u=pwd.getpwnam('lovable');b=Path(os.environ['WIIZE_FIXTURE_DIR'])
assert b.parent == Path('/tmp') and b.name.startswith('wiize-accounting-')
def drop_uid():
 os.setgid(u.pw_gid);os.setuid(u.pw_uid)
env={'PATH':'/bin:/usr/bin','HOME':u.pw_dir}
def run(args,**kw):return subprocess.run(args,env=env,cwd='/tmp',preexec_fn=drop_uid,capture_output=True,text=True,**kw)
def sql(q,ok=True):
 r=run(['/bin/psql','-X','--no-password','-h',str(b),'-p','55439','-U','lovable','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',q])
 if ok and r.returncode:raise RuntimeError(r.stderr)
 if not ok:assert r.returncode!=0
 return r.stdout.strip()
try:
 sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')
 sql((Path(__file__).resolve().parents[2]/'docs/migrations-pendentes/accounting-release-candidate.sql').read_text())
 a='00000000-0000-4000-8000-000000000001';p='00000000-0000-4000-8000-000000000002';s='00000000-0000-4000-8000-000000000003';r='00000000-0000-4000-8000-000000000004'
 sql(f"UPDATE wallets SET pending_balance=260,available_balance=0,total_fees=0; UPDATE payments SET released_at=now(),refund_reserved_pending=0; UPDATE coproduction_splits SET status='received',released_at=NULL;")
 assert sql(f"SELECT release_coproduction_splits('{p}')")=='1'
 assert sql("SELECT pending_balance||','||available_balance FROM wallets")=='200.00,60.00'
 assert sql(f"SELECT release_coproduction_splits('{p}')")=='0'
 print('PASS split remainder 60; unrelated pending 200; repeat zero')
 sql(f"UPDATE coproduction_splits SET status='received'; UPDATE payments SET released_at=NULL;")
 sql(f"SELECT release_coproduction_splits('{p}')",False)
 assert sql('SELECT status FROM coproduction_splits')=='received'
 print('PASS unsettled parent refuses release atomically')
 sql(f"UPDATE wallets SET pending_balance=260,available_balance=0,total_fees=0; UPDATE payments SET released_at=NULL,refund_reserved_pending=40; UPDATE anticipation_requests SET status='processing'; TRUNCATE transactions,notifications;")
 sql(f"SELECT apply_anticipation_event('{r}','completed','CREDITED','candidate-reserved')",False)
 assert sql("SELECT pending_balance||','||available_balance||','||total_fees FROM wallets")=='260.00,0.00,0.00'
 assert sql('SELECT status FROM anticipation_requests')=='processing'
 assert sql('SELECT count(*) FROM transactions')=='0'
 print('PASS reserved refund blocks completion without balance/status/fee mutation')
 sql('UPDATE payments SET refund_reserved_pending=0;')
 sql(f"SELECT apply_anticipation_event('{r}','completed','CREDITED','candidate-success')")
 assert sql("SELECT pending_balance||','||available_balance||','||total_fees FROM wallets")=='160.00,95.00,5.00'
 sql(f"SELECT apply_anticipation_event('{r}','completed','CREDITED','candidate-success'); SELECT apply_anticipation_event('{r}','completed','CREDITED','candidate-other')")
 assert sql('SELECT count(*) FROM transactions')=='1'
 assert sql('SELECT count(*) FROM notifications')=='1'
 print('PASS valid completion credits 95, one fee, one notification across retries')
 assert sql("SELECT has_function_privilege('authenticated','public.release_coproduction_splits(uuid)','EXECUTE')")=='f'
 assert sql("SELECT has_function_privilege('anon','public.apply_anticipation_event(uuid,anticipation_status,text,text)','EXECUTE')")=='f'
 print('PASS financial candidate functions not directly executable by ordinary roles')
finally:
 print('candidate checks ended; parent runner shuts down the disposable cluster')
