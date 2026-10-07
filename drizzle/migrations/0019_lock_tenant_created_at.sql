CREATE OR REPLACE FUNCTION public.lock_tenant_created_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- A data de criação define a promoção de lançamento: nunca pode mudar.
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenants_lock_created_at ON public.tenants;
CREATE TRIGGER tenants_lock_created_at BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.lock_tenant_created_at();

CREATE OR REPLACE FUNCTION public.default_tenant_created_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Na criação, a data vem sempre do relógio do banco.
  NEW.created_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenants_default_created_at ON public.tenants;
CREATE TRIGGER tenants_default_created_at BEFORE INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.default_tenant_created_at();