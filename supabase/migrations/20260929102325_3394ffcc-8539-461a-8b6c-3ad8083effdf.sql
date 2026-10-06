CREATE OR REPLACE FUNCTION public.wallet_consistency_report()
RETURNS TABLE(tenant_id uuid, tenant_name text, ledger_total numeric, wallet_total numeric, difference numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.tenant_id, t.name,
    COALESCE((SELECT sum(amount) FROM public.transactions x WHERE x.tenant_id = w.tenant_id), 0) AS ledger_total,
    (w.pending_balance + w.available_balance + COALESCE((SELECT sum(refund_amount) FROM public.refunds r WHERE r.tenant_id = w.tenant_id AND r.status IN ('requested','processing')), 0)) AS wallet_total,
    COALESCE((SELECT sum(amount) FROM public.transactions x WHERE x.tenant_id = w.tenant_id), 0)
      - (w.pending_balance + w.available_balance + COALESCE((SELECT sum(refund_amount) FROM public.refunds r WHERE r.tenant_id = w.tenant_id AND r.status IN ('requested','processing')), 0)) AS difference
  FROM public.wallets w JOIN public.tenants t ON t.id = w.tenant_id;
$$;
REVOKE ALL ON FUNCTION public.wallet_consistency_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_consistency_report() TO service_role;