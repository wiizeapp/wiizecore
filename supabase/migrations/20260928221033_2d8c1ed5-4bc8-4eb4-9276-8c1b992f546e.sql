ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fee_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS provider_fee_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS wiize_fee_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS fee_charged_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_transfer_id text;

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('invoice_fee_amount', 2.49, 'Taxa total cobrada por nota fiscal autorizada'),
  ('invoice_provider_fee_amount', 0.49, 'Custo do emissor por nota fiscal autorizada')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.charge_invoice_fee(_invoice_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE i public.invoices%ROWTYPE; total numeric(14,2); prov numeric(14,2);
BEGIN
  SELECT * INTO i FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND OR i.status <> 'AUTHORIZED' OR i.fee_charged_at IS NOT NULL THEN RETURN 0; END IF;
  total := COALESCE((SELECT value FROM public.platform_settings WHERE key = 'invoice_fee_amount'), 2.49);
  prov := LEAST(total, COALESCE((SELECT value FROM public.platform_settings WHERE key = 'invoice_provider_fee_amount'), 0.49));
  UPDATE public.invoices SET fee_amount = total, provider_fee_amount = prov, wiize_fee_amount = total - prov, fee_charged_at = now() WHERE id = i.id;
  INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount)
    VALUES (i.tenant_id, i.payment_id, 'platform_fee', 'Taxa WiizePay — nota fiscal ' || COALESCE(i.number, ''), -total);
  INSERT INTO public.wallets (tenant_id) VALUES (i.tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE public.wallets SET available_balance = available_balance - total, total_fees = total_fees + total, updated_at = now() WHERE tenant_id = i.tenant_id;
  RETURN total - prov;
END; $$;
REVOKE ALL ON FUNCTION public.charge_invoice_fee(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_invoice_fee(uuid) TO service_role;