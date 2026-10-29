"""Tests applied contract SQL on a fresh socket-only cluster, never managed PG* env."""
import os
import pwd
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
user = pwd.getpwnam("lovable")
base = Path(tempfile.mkdtemp(prefix="wiize-contract-confirmation-", dir="/tmp"))
os.chown(base, user.pw_uid, user.pw_gid)
env = {"PATH": "/bin:/usr/bin", "HOME": user.pw_dir}

def lower():
    os.setgid(user.pw_gid)
    os.setuid(user.pw_uid)

def run(args, input=None):
    return subprocess.run(args, input=input, text=True, capture_output=True, env=env, cwd="/tmp", preexec_fn=lower, check=True).stdout

def sql(text):
    return run(["/bin/psql", "-h", str(base), "-p", "55439", "-U", "lovable", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], text)

run(["/bin/initdb", "-D", str(base / "cluster"), "-U", "lovable", "--no-locale", "-E", "UTF8", "--auth-local=peer", "--auth-host=reject"])
run(["/bin/pg_ctl", "-D", str(base / "cluster"), "-l", str(base / "server.log"), "-o", f"-p 55439 -k {base} -c listen_addresses= -c unix_socket_permissions=0700", "-w", "start"])
try:
    sql("""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TYPE public.contract_status AS ENUM('draft','signed','cancelled','expired','awaiting_provider','awaiting_customer');
CREATE TABLE public.contracts(id uuid PRIMARY KEY,tenant_id uuid,customer_id uuid,status contract_status,current_version integer,signed_at timestamptz,updated_at timestamptz);
CREATE TABLE public.contract_versions(id uuid PRIMARY KEY,tenant_id uuid,contract_id uuid,version integer,content_hash text);
CREATE TABLE public.customers(id uuid,tenant_id uuid,email text);
CREATE TABLE public.tenant_members(tenant_id uuid,user_id uuid,status text,role text);
CREATE TABLE public.contract_signers(id uuid,tenant_id uuid,contract_id uuid,name text,email text,document text,role text,removed_at timestamptz,token_hash text,token_expires_at timestamptz);
CREATE TABLE public.contract_links(tenant_id uuid,contract_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz);
CREATE TABLE public.payment_links(tenant_id uuid,contract_id uuid,customer_id uuid,token_hash text,revoked_at timestamptz,charge_group_id uuid);
CREATE TABLE public.contract_signature_fields(contract_id uuid,version integer);
CREATE TABLE public.contract_signatures(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,contract_id uuid,contract_version_id uuid,signer_role text,signer_name text,signer_document text,signer_email text,content_hash text,signature_mode text,signature_image text,initials_image text,ip_address text,user_agent text,signed_at timestamptz DEFAULT now(),UNIQUE(contract_version_id,signer_role));
""")
    for file in ("0053_contract_signature_confirmation.sql", "0054_contract_confirmation_scope_guards.sql", "0055_contract_confirmation_private_grants.sql"):
        sql((root / "drizzle/migrations" / file).read_text())
    tenant="00000000-0000-0000-0000-000000000001"
    contract="00000000-0000-0000-0000-000000000002"
    version="00000000-0000-0000-0000-000000000003"
    customer="00000000-0000-0000-0000-000000000004"
    sql(f"INSERT INTO contracts VALUES('{contract}','{tenant}','{customer}','draft',1,NULL,NULL); INSERT INTO contract_versions VALUES('{version}','{tenant}','{contract}',1,'hash'); INSERT INTO customers VALUES('{customer}','{tenant}','fixture@example.invalid'); INSERT INTO contract_links VALUES('{tenant}','{contract}','cap',NULL,now()+interval '1 hour');")
    challenge = sql(f"SELECT public.contract_signature_issue('{{\"tenant_id\":\"{tenant}\",\"contract_id\":\"{contract}\",\"version_id\":\"{version}\",\"signer_role\":\"customer\",\"content_hash\":\"hash\",\"binding_hash\":\"binding\",\"recipient\":\"'||encode(sha256(convert_to('fixture@example.invalid','UTF8')),'hex')||'\",\"payload_hash\":\"payload\",\"code_hash\":\"codehash\"}}')").strip()
    sql(f"UPDATE contract_signature_challenges SET sent_at=now(),source='customer',capability_hash='cap' WHERE id='{challenge}';")
    payload='{"signer_name":"Fixture","signer_email":"fixture@example.invalid","identity_enc":"encrypted","signature_mode":"typed"}'
    def finish(valid="true", bound="payload"):
        return sql(f"SELECT public.contract_signature_finish('{tenant}','{contract}','{version}','customer','hash','{bound}','{challenge}','codehash',{valid},'{payload}');")
    assert '"ok": false' in finish("false")
    assert '"ok": false' in finish("true", "changed-payload")
    assert '"ok": true' in finish()
    assert '"ok": false' in finish()
    assert sql("SELECT count(*) FROM contract_signatures;").strip()=="1"
    assert sql("SELECT count(*) FROM contract_signature_challenges WHERE consumed_at IS NOT NULL;").strip()=="1"
    assert sql("SELECT has_table_privilege('anon','contract_signature_challenges','SELECT'),has_function_privilege('authenticated','contract_signature_finish(uuid,uuid,uuid,text,text,text,uuid,text,boolean,jsonb)','EXECUTE');").strip()=="f|f"
    try:
        sql("UPDATE contract_signatures SET signer_name='Changed';")
        raise AssertionError("Immutable signature was changed")
    except subprocess.CalledProcessError:
        pass
    print("PASS: wrong code, changed payload, positive signing, replay, exactly one signature/consumption, private grants, immutable evidence")
finally:
    run(["/bin/pg_ctl", "-D", str(base / "cluster"), "-m", "fast", "-w", "stop"])