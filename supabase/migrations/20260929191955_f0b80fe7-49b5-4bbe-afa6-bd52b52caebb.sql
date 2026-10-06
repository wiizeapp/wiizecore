
CREATE OR REPLACE FUNCTION public._fin_writer(_tenant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT has_tenant_role(_tenant, ARRAY['owner','admin','finance']::tenant_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fin_card_purchase(uuid,uuid,text,numeric,date,int,uuid,text), public.fin_cancel_card_purchase(uuid,uuid),
  public.fin_pay_invoice(uuid,uuid,uuid,date), public.fin_transfer(uuid,uuid,uuid,numeric,date,text),
  public.fin_cancel_entry(uuid,uuid), public.fin_move_category(uuid,uuid,uuid) FROM authenticated;
