CREATE OR REPLACE FUNCTION public.notify_platform_on_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n text;
BEGIN
  SELECT name INTO n FROM public.tenants WHERE id = NEW.tenant_id;
  INSERT INTO public.platform_notifications (kind, title, body, link, tenant_id) VALUES (
    'activation.' || NEW.to_status::text,
    CASE NEW.to_status WHEN 'submitted' THEN 'Novo cadastro para análise'
      WHEN 'approved' THEN 'Cadastro aprovado' WHEN 'rejected' THEN 'Cadastro recusado'
      WHEN 'action_required' THEN 'Correção solicitada' WHEN 'suspended' THEN 'Conta suspensa'
      WHEN 'under_review' THEN 'Cadastro em análise' ELSE 'Ativação atualizada' END,
    COALESCE(n, 'Empresa') || COALESCE(' — ' || NEW.message, ''), '/nimda', NEW.tenant_id);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_platform_on_activation() FROM PUBLIC, anon, authenticated;
UPDATE public.platform_notifications SET link = '/nimda' WHERE link = '/admin';