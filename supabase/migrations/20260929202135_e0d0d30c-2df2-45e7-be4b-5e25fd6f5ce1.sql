DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_members_tenant_user_key') THEN
    ALTER TABLE public.tenant_members ADD CONSTRAINT tenant_members_tenant_user_key UNIQUE (tenant_id, user_id);
  END IF;
END $$;