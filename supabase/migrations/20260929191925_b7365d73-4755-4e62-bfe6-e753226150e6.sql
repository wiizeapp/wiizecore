
ALTER TABLE public.finance_entries DROP CONSTRAINT finance_entries_status_check;
ALTER TABLE public.finance_entries ADD CONSTRAINT finance_entries_status_check CHECK (status IN ('paid','pending','scheduled','cancelled','reversed'));
ALTER TABLE public.finance_entries
  ADD COLUMN competence_on date,
  ADD COLUMN transfer_id uuid,
  ADD COLUMN card_invoice_id uuid,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN reversed_at timestamptz;
CREATE INDEX IF NOT EXISTS fe_tenant_due ON public.finance_entries(tenant_id, due_on);
CREATE INDEX IF NOT EXISTS fe_tenant_account ON public.finance_entries(tenant_id, account_id, status);
CREATE INDEX IF NOT EXISTS fe_transfer ON public.finance_entries(transfer_id) WHERE transfer_id IS NOT NULL;

ALTER TABLE public.finance_categories
  ADD COLUMN archived boolean NOT NULL DEFAULT false,
  ADD COLUMN is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN level smallint NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS fc_tenant_parent ON public.finance_categories(tenant_id, parent_id);

CREATE OR REPLACE FUNCTION public.validate_finance_category_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p public.finance_categories%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN NEW.level := 1;
  ELSE
    IF NEW.parent_id = NEW.id THEN RAISE EXCEPTION 'Uma categoria não pode ser subcategoria dela mesma.'; END IF;
    SELECT * INTO p FROM public.finance_categories WHERE id = NEW.parent_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria principal não encontrada.'; END IF;
    IF p.level >= 3 THEN RAISE EXCEPTION 'A hierarquia permite até 3 níveis.'; END IF;
    IF p.tenant_id IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Categoria e subcategoria devem pertencer à mesma empresa.'; END IF;
    IF p.direction IS DISTINCT FROM NEW.direction THEN RAISE EXCEPTION 'Categoria e subcategoria devem ter o mesmo tipo.'; END IF;
    NEW.level := p.level + 1;
  END IF;
  IF EXISTS (SELECT 1 FROM public.finance_categories c WHERE c.id <> NEW.id
      AND c.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND c.parent_id IS NOT DISTINCT FROM NEW.parent_id
      AND c.direction = NEW.direction AND lower(c.name) = lower(NEW.name)) THEN
    RAISE EXCEPTION 'duplicate_category';
  END IF;
  RETURN NEW;
END $$;
UPDATE public.finance_categories SET level = 2 WHERE parent_id IS NOT NULL;

-- Cartões
CREATE TABLE public.finance_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  brand text NOT NULL CHECK (brand IN ('visa','mastercard','elo','amex','hipercard','other')),
  last4 text NOT NULL CHECK (last4 ~ '^\d{4}$'),
  credit_limit numeric(14,2) NOT NULL CHECK (credit_limit >= 0),
  closing_day smallint NOT NULL CHECK (closing_day BETWEEN 1 AND 28),
  due_day smallint NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  pay_account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  color text NOT NULL DEFAULT 'slate' CHECK (color IN ('slate','green','blue','violet','amber','rose')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','archived')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.finance_cards TO authenticated;
GRANT ALL ON public.finance_cards TO service_role;
ALTER TABLE public.finance_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "card read" ON public.finance_cards FOR SELECT TO authenticated USING (is_tenant_member(tenant_id));
CREATE POLICY "card write" ON public.finance_cards FOR ALL TO authenticated
  USING (has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]))
  WITH CHECK (has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]));
CREATE INDEX fcard_tenant ON public.finance_cards(tenant_id);
CREATE TRIGGER fcard_touch BEFORE UPDATE ON public.finance_cards FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.finance_card_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.finance_cards(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  closing_on date NOT NULL,
  due_on date NOT NULL,
  paid_at timestamptz,
  paid_amount numeric(14,2),
  payment_entry_id uuid REFERENCES public.finance_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, reference_month)
);
GRANT SELECT ON public.finance_card_invoices TO authenticated;
GRANT ALL ON public.finance_card_invoices TO service_role;
ALTER TABLE public.finance_card_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv read" ON public.finance_card_invoices FOR SELECT TO authenticated USING (is_tenant_member(tenant_id));
CREATE INDEX finv_tenant ON public.finance_card_invoices(tenant_id, due_on);

CREATE TABLE public.finance_card_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.finance_cards(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  purchased_on date NOT NULL,
  installments smallint NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 48),
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
GRANT SELECT ON public.finance_card_purchases TO authenticated;
GRANT ALL ON public.finance_card_purchases TO service_role;
ALTER TABLE public.finance_card_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pur read" ON public.finance_card_purchases FOR SELECT TO authenticated USING (is_tenant_member(tenant_id));
CREATE INDEX fpur_card ON public.finance_card_purchases(card_id, purchased_on);

CREATE TABLE public.finance_card_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL REFERENCES public.finance_card_purchases(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.finance_card_invoices(id) ON DELETE RESTRICT,
  number smallint NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  UNIQUE (purchase_id, number)
);
GRANT SELECT ON public.finance_card_installments TO authenticated;
GRANT ALL ON public.finance_card_installments TO service_role;
ALTER TABLE public.finance_card_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inst read" ON public.finance_card_installments FOR SELECT TO authenticated USING (is_tenant_member(tenant_id));
CREATE INDEX finst_invoice ON public.finance_card_installments(invoice_id);

ALTER TABLE public.finance_entries ADD CONSTRAINT finance_entries_card_invoice_fk FOREIGN KEY (card_invoice_id) REFERENCES public.finance_card_invoices(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX fe_one_payment_per_invoice ON public.finance_entries(card_invoice_id) WHERE card_invoice_id IS NOT NULL AND status = 'paid';

CREATE OR REPLACE FUNCTION public._fin_writer(_tenant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_tenant_role(_tenant, ARRAY['owner','admin','finance']::tenant_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fin_invoice_for(_card uuid, _date date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.finance_cards%ROWTYPE; ref date; clo date; due date; inv uuid;
BEGIN
  SELECT * INTO c FROM finance_cards WHERE id = _card;
  ref := date_trunc('month', _date)::date;
  IF extract(day FROM _date) >= c.closing_day THEN ref := (ref + interval '1 month')::date; END IF;
  clo := ref + (c.closing_day - 1);
  due := CASE WHEN c.due_day > c.closing_day THEN ref + (c.due_day - 1) ELSE (ref + interval '1 month')::date + (c.due_day - 1) END;
  INSERT INTO finance_card_invoices(tenant_id, card_id, reference_month, closing_on, due_on)
  VALUES (c.tenant_id, c.id, ref, clo, due) ON CONFLICT (card_id, reference_month) DO NOTHING;
  SELECT id INTO inv FROM finance_card_invoices WHERE card_id = c.id AND reference_month = ref;
  RETURN inv;
END $$;

CREATE OR REPLACE FUNCTION public.fin_card_purchase(_tenant uuid, _card uuid, _description text, _amount numeric, _date date, _installments int, _category uuid, _key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.finance_cards%ROWTYPE; pid uuid; used numeric; cents bigint; base bigint; i int; part bigint;
BEGIN
  PERFORM _fin_writer(_tenant);
  SELECT id INTO pid FROM finance_card_purchases WHERE tenant_id = _tenant AND idempotency_key = _key;
  IF pid IS NOT NULL THEN RETURN pid; END IF;
  SELECT * INTO c FROM finance_cards WHERE id = _card AND tenant_id = _tenant FOR UPDATE;
  IF NOT FOUND OR c.status <> 'active' THEN RAISE EXCEPTION 'card_unavailable'; END IF;
  IF _amount <= 0 OR _installments < 1 OR _installments > 48 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT coalesce(sum(ci.amount),0) INTO used FROM finance_card_installments ci
    JOIN finance_card_invoices iv ON iv.id = ci.invoice_id JOIN finance_card_purchases p ON p.id = ci.purchase_id
    WHERE iv.card_id = _card AND iv.paid_at IS NULL AND p.status = 'active';
  IF used + _amount > c.credit_limit THEN RAISE EXCEPTION 'limit_exceeded'; END IF;
  INSERT INTO finance_card_purchases(tenant_id, card_id, description, amount, purchased_on, installments, category_id, idempotency_key, created_by)
  VALUES (_tenant, _card, _description, _amount, _date, _installments, _category, _key, auth.uid()) RETURNING id INTO pid;
  cents := round(_amount * 100); base := cents / _installments;
  FOR i IN 1.._installments LOOP
    part := CASE WHEN i = _installments THEN cents - base * (_installments - 1) ELSE base END;
    INSERT INTO finance_card_installments(tenant_id, purchase_id, invoice_id, number, amount)
    VALUES (_tenant, pid, fin_invoice_for(_card, (_date + make_interval(months => i - 1))::date), i, part / 100.0);
  END LOOP;
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.fin_cancel_card_purchase(_tenant uuid, _purchase uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _fin_writer(_tenant);
  IF EXISTS (SELECT 1 FROM finance_card_installments ci JOIN finance_card_invoices iv ON iv.id = ci.invoice_id
             WHERE ci.purchase_id = _purchase AND iv.paid_at IS NOT NULL) THEN RAISE EXCEPTION 'invoice_paid'; END IF;
  UPDATE finance_card_purchases SET status = 'cancelled' WHERE id = _purchase AND tenant_id = _tenant AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fin_pay_invoice(_tenant uuid, _invoice uuid, _account uuid, _paid_on date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE iv public.finance_card_invoices%ROWTYPE; total numeric; eid uuid; cname text;
BEGIN
  PERFORM _fin_writer(_tenant);
  SELECT * INTO iv FROM finance_card_invoices WHERE id = _invoice AND tenant_id = _tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF iv.paid_at IS NOT NULL THEN RAISE EXCEPTION 'already_paid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM finance_accounts WHERE id = _account AND tenant_id = _tenant AND NOT archived) THEN RAISE EXCEPTION 'invalid_account'; END IF;
  SELECT coalesce(sum(ci.amount),0) INTO total FROM finance_card_installments ci JOIN finance_card_purchases p ON p.id = ci.purchase_id
    WHERE ci.invoice_id = _invoice AND p.status = 'active';
  IF total <= 0 THEN RAISE EXCEPTION 'empty_invoice'; END IF;
  SELECT name INTO cname FROM finance_cards WHERE id = iv.card_id;
  INSERT INTO finance_entries(tenant_id, direction, amount, description, account_id, due_on, paid_on, competence_on, status, card_invoice_id, created_by)
  VALUES (_tenant, 'out', total, 'Fatura ' || cname || ' ' || to_char(iv.reference_month, 'MM/YYYY'), _account, iv.due_on, _paid_on, iv.reference_month, 'paid', _invoice, auth.uid())
  RETURNING id INTO eid;
  UPDATE finance_card_invoices SET paid_at = now(), paid_amount = total, payment_entry_id = eid WHERE id = _invoice;
  RETURN eid;
END $$;

CREATE OR REPLACE FUNCTION public.fin_transfer(_tenant uuid, _from uuid, _to uuid, _amount numeric, _date date, _description text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tid uuid := gen_random_uuid();
BEGIN
  PERFORM _fin_writer(_tenant);
  IF _from = _to OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_transfer'; END IF;
  IF (SELECT count(*) FROM finance_accounts WHERE id IN (_from,_to) AND tenant_id = _tenant AND NOT archived) <> 2 THEN RAISE EXCEPTION 'invalid_account'; END IF;
  INSERT INTO finance_entries(tenant_id, direction, amount, description, account_id, due_on, paid_on, competence_on, status, transfer_id, created_by) VALUES
    (_tenant, 'out', _amount, coalesce(nullif(_description,''),'Transferência entre contas'), _from, _date, _date, _date, 'paid', tid, auth.uid()),
    (_tenant, 'in',  _amount, coalesce(nullif(_description,''),'Transferência entre contas'), _to,   _date, _date, _date, 'paid', tid, auth.uid());
  RETURN tid;
END $$;

CREATE OR REPLACE FUNCTION public.fin_cancel_entry(_tenant uuid, _entry uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.finance_entries%ROWTYPE;
BEGIN
  PERFORM _fin_writer(_tenant);
  SELECT * INTO e FROM finance_entries WHERE id = _entry AND tenant_id = _tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF e.status IN ('cancelled','reversed') THEN RETURN; END IF;
  IF e.card_invoice_id IS NOT NULL THEN
    UPDATE finance_card_invoices SET paid_at = NULL, paid_amount = NULL, payment_entry_id = NULL WHERE id = e.card_invoice_id;
  END IF;
  UPDATE finance_entries SET
    status = CASE WHEN status = 'paid' THEN 'reversed' ELSE 'cancelled' END,
    reversed_at = CASE WHEN status = 'paid' THEN now() END,
    cancelled_at = CASE WHEN status <> 'paid' THEN now() END
  WHERE tenant_id = _tenant AND (id = _entry OR (e.transfer_id IS NOT NULL AND transfer_id = e.transfer_id));
END $$;

CREATE OR REPLACE FUNCTION public.fin_move_category(_tenant uuid, _from uuid, _to uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; a public.finance_categories%ROWTYPE; b public.finance_categories%ROWTYPE;
BEGIN
  PERFORM _fin_writer(_tenant);
  SELECT * INTO a FROM finance_categories WHERE id = _from AND tenant_id = _tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _to IS NOT NULL THEN
    SELECT * INTO b FROM finance_categories WHERE id = _to AND (tenant_id = _tenant OR tenant_id IS NULL);
    IF NOT FOUND OR b.direction <> a.direction OR b.id = a.id THEN RAISE EXCEPTION 'invalid_target'; END IF;
  END IF;
  UPDATE finance_entries SET category_id = _to WHERE tenant_id = _tenant AND category_id = _from;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE finance_card_purchases SET category_id = _to WHERE tenant_id = _tenant AND category_id = _from;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public._fin_writer(uuid), public.fin_invoice_for(uuid,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_card_purchase(uuid,uuid,text,numeric,date,int,uuid,text), public.fin_cancel_card_purchase(uuid,uuid),
  public.fin_pay_invoice(uuid,uuid,uuid,date), public.fin_transfer(uuid,uuid,uuid,numeric,date,text),
  public.fin_cancel_entry(uuid,uuid), public.fin_move_category(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_card_purchase(uuid,uuid,text,numeric,date,int,uuid,text), public.fin_cancel_card_purchase(uuid,uuid),
  public.fin_pay_invoice(uuid,uuid,uuid,date), public.fin_transfer(uuid,uuid,uuid,numeric,date,text),
  public.fin_cancel_entry(uuid,uuid), public.fin_move_category(uuid,uuid,uuid) TO authenticated, service_role;
