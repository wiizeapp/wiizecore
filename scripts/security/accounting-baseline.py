import os,pwd,subprocess,re,json
from pathlib import Path
assert os.environ.get('WIIZE_FIXTURE_CONFIRMED') == 'local-only', 'Use run-accounting-fixture.py'
u=pwd.getpwnam('lovable'); root=Path(__file__).resolve().parents[2]; base=Path(os.environ['WIIZE_FIXTURE_DIR'])
assert base.parent == Path('/tmp') and base.name.startswith('wiize-accounting-')
def unprivileged():
 os.setgid(u.pw_gid); os.setuid(u.pw_uid)
def sql(query):
 r=subprocess.run(['/bin/psql','-X','--no-password','-h',str(base),'-p','55439','-U','lovable','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',query],env={'PATH':'/bin:/usr/bin','HOME':u.pw_dir},cwd='/tmp',preexec_fn=unprivileged,capture_output=True,text=True)
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout.strip()
def function(path,name):
 content=(root/path).read_text()
 m=re.search(r'CREATE OR REPLACE FUNCTION public\.'+name+r'\([\s\S]*?END;?\s*\$\$;',content)
 if not m: raise RuntimeError('missing function')
 return m.group(0)
schema='''
CREATE TYPE public.anticipation_status AS ENUM ('pending','processing','completed','failed','cancelled');
CREATE TABLE public.wallets(tenant_id uuid PRIMARY KEY,pending_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK(pending_balance>=0),available_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK(available_balance>=0),total_fees numeric(14,2) NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now());
CREATE TABLE public.payments(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,status text,net_amount numeric(14,2),refund_reserved_pending numeric(14,2) DEFAULT 0,released_at timestamptz,anticipation_status text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.coproduction_splits(id uuid PRIMARY KEY,payment_id uuid,participant_tenant_id uuid,amount numeric(14,2),refunded_amount numeric(14,2),status text,released_at timestamptz);
CREATE TABLE public.anticipation_requests(id uuid PRIMARY KEY,tenant_id uuid,payment_id uuid,status public.anticipation_status,net_amount numeric(14,2),wiize_fee_amount numeric(14,2),provider_status text,last_provider_event_id text,processed_at timestamptz,settled_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE public.transactions(tenant_id uuid,payment_id uuid,kind text,description text,amount numeric(14,2));
CREATE TABLE public.notifications(tenant_id uuid,kind text,title text,body text,link text);
'''
sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public; '+schema)
sql(function('drizzle/migrations/0013_coproductions.sql','release_coproduction_splits'))
sql(function('supabase/migrations/20260925164953_e9750715-a443-4568-92b1-b18536be8c03.sql','apply_anticipation_event'))
a='00000000-0000-4000-8000-000000000001';p='00000000-0000-4000-8000-000000000002';s='00000000-0000-4000-8000-000000000003';r='00000000-0000-4000-8000-000000000004'
sql(f"INSERT INTO wallets(tenant_id,pending_balance) VALUES('{a}',260); INSERT INTO payments(id,tenant_id,status,net_amount) VALUES('{p}','{a}','paid',100); INSERT INTO coproduction_splits VALUES('{s}','{p}','{a}',100,40,'received',NULL);")
assert sql(f"SELECT release_coproduction_splits('{p}');")=='1'
partial=sql('SELECT pending_balance||\',\'||available_balance FROM wallets;')
assert partial=='160.00,100.00',partial
assert sql(f"SELECT release_coproduction_splits('{p}');")=='0'
assert sql('SELECT pending_balance||\',\'||available_balance FROM wallets;')==partial
sql(f"UPDATE wallets SET pending_balance=260,available_balance=0,total_fees=0; UPDATE payments SET released_at=NULL,refund_reserved_pending=40; INSERT INTO anticipation_requests(id,tenant_id,payment_id,status,net_amount,wiize_fee_amount) VALUES('{r}','{a}','{p}','processing',95,5);")
sql(f"SELECT apply_anticipation_event('{r}','completed','CREDITED','fixture-event');")
anticipation=sql('SELECT pending_balance||\',\'||available_balance||\',\'||total_fees FROM wallets;')
assert anticipation=='160.00,95.00,5.00',anticipation
sql(f"SELECT apply_anticipation_event('{r}','completed','CREDITED','fixture-event'); SELECT apply_anticipation_event('{r}','completed','CREDITED','fixture-event-other');")
assert sql('SELECT pending_balance||\',\'||available_balance||\',\'||total_fees FROM wallets;')==anticipation
assert sql('SELECT count(*) FROM transactions;')=='1'
result={'scope':'Independent local PostgreSQL with minimal synthetic schema; no managed backend','partial_refund_baseline':{'pending_before':'260.00','refunded':'40.00','pending_after':'160.00','available_after':'100.00','required_pending_after':'200.00','required_available_after':'60.00','duplicate_no_change':True},'anticipation_with_reserved_refund_baseline':{'pending_before':'260.00','reserved_refund':'40.00','pending_after':'160.00','available_after':'95.00','fee':'5.00','duplicates_no_change':True},'production_changed':False,'candidate_fix_tested':False,'concurrency_tested':False}
(base/'checks/results.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
