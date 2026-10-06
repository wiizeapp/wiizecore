-- =====================================================================
-- WiizePay — avisos diários rodando 100% no banco (sem Vercel)
-- Rode tudo de uma vez no SQL Editor do banco de produção.
-- Única troca: na linha da chave da Resend, cole sua RESEND_API_KEY.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Chave da Resend guardada no cofre do banco (troque o texto abaixo)
SELECT vault.create_secret('COLE_AQUI_SUA_RESEND_API_KEY', 'resend_api_key')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'resend_api_key');

-- 2) Envia um e-mail uma única vez (dedupe em email_outbox)
CREATE OR REPLACE FUNCTION public.wp_send_tenant_email(
  _tenant uuid, _kind text, _dedupe text, _subject text, _title text, _body text, _link text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  _to text[];
  _key text;
  _id uuid;
  _html text;
BEGIN
  SELECT array_agg(DISTINCT p.email) INTO _to
  FROM tenant_members m JOIN profiles p ON p.id = m.user_id
  WHERE m.tenant_id = _tenant AND m.role IN ('owner','admin') AND p.email IS NOT NULL;
  IF _to IS NULL THEN RETURN; END IF;

  INSERT INTO email_outbox (tenant_id, dedupe_key, kind, recipient_masked)
  VALUES (_tenant, _dedupe, _kind, (SELECT string_agg(left(split_part(e,'@',1),2) || '***@' || split_part(e,'@',2), ', ') FROM unnest(_to) e))
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO _id;
  IF _id IS NULL THEN RETURN; END IF; -- já enviado antes

  SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'resend_api_key';
  IF _key IS NULL THEN
    UPDATE email_outbox SET status = 'skipped', error_message = 'chave Resend ausente' WHERE id = _id;
    RETURN;
  END IF;

  _html := '<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Arial,sans-serif">'
    || '<p style="font-size:20px;font-weight:700;color:#0f9f6e">WiizePay</p>'
    || '<h1 style="font-size:22px;color:#111827">' || _title || '</h1>'
    || '<p style="font-size:15px;color:#374151;line-height:1.6">' || _body || '</p>'
    || '<p style="margin:28px 0"><a href="https://www.wiizepay.com' || _link || '" style="background:#0f9f6e;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Abrir na WiizePay</a></p>'
    || '<p style="font-size:12px;color:#9ca3af">Mensagem automática da WiizePay. Nunca pedimos senhas, códigos ou dados de cartão por e-mail.</p></div>';

  PERFORM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || _key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('from', 'WiizePay <notificacoes@wiizepay.com>', 'to', to_jsonb(_to), 'subject', _subject, 'html', _html)
  );
  UPDATE email_outbox SET status = 'sent', sent_at = now() WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.wp_send_tenant_email(uuid,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;

-- 3) Rotina diária: cobranças em atraso há 1 dia e links de contrato perto de vencer
CREATE OR REPLACE FUNCTION public.wp_daily_notifications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; _title text; _body text;
BEGIN
  FOR r IN
    SELECT p.id, p.tenant_id, p.gross_amount, coalesce(c.name, 'cliente') AS cname
    FROM payments p LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.status = 'overdue' AND p.due_on = current_date - 1
    LIMIT 500
  LOOP
    IF NOT EXISTS (SELECT 1 FROM email_outbox WHERE dedupe_key = 'payment.overdue:' || r.id) THEN
      _title := 'Cobrança em atraso';
      _body := 'A cobrança de ' || r.cname || ' (R$ ' || replace(to_char(r.gross_amount, 'FM999G999G990D00'), ',', '.') || ') está em atraso.';
      INSERT INTO notifications (tenant_id, kind, title, body, link) VALUES (r.tenant_id, 'payment.overdue', _title, _body, '/cobrancas');
      PERFORM wp_send_tenant_email(r.tenant_id, 'payment.overdue', 'payment.overdue:' || r.id, 'Cobrança em atraso — ' || r.cname, _title, _body, '/cobrancas');
    END IF;
  END LOOP;

  FOR r IN
    SELECT l.id, l.tenant_id, l.contract_id, coalesce(ct.title, 'Contrato') AS title
    FROM contract_links l JOIN contracts ct ON ct.id = l.contract_id
    WHERE l.revoked_at IS NULL AND l.expires_at > now() AND l.expires_at < now() + interval '2 days'
      AND ct.status NOT IN ('signed','cancelled','expired')
    LIMIT 500
  LOOP
    IF NOT EXISTS (SELECT 1 FROM email_outbox WHERE dedupe_key = 'contract.expiring:' || r.id) THEN
      _title := 'Link de assinatura perto de vencer';
      _body := 'O link do contrato "' || r.title || '" vence em até 2 dias e ainda faltam assinaturas.';
      INSERT INTO notifications (tenant_id, kind, title, body, link) VALUES (r.tenant_id, 'contract.expiring', _title, _body, '/contratos/' || r.contract_id);
      PERFORM wp_send_tenant_email(r.tenant_id, 'contract.expiring', 'contract.expiring:' || r.id, 'Contrato aguardando assinatura', _title, _body, '/contratos/' || r.contract_id);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.wp_daily_notifications() FROM PUBLIC, anon, authenticated;

-- 4) Agenda: todo dia às 12h UTC (9h de Brasília)
SELECT cron.unschedule('wiizepay-notifications')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wiizepay-notifications');

SELECT cron.schedule('wiizepay-notifications', '0 12 * * *', $$ SELECT public.wp_daily_notifications(); $$);
