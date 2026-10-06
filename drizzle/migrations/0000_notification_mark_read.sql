CREATE OR REPLACE FUNCTION public.mark_notifications_read(_tenant_id uuid, _ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.notifications SET read_at = now()
   WHERE tenant_id = _tenant_id AND read_at IS NULL AND (_ids IS NULL OR id = ANY(_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid, uuid[]) TO authenticated;