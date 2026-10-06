-- =====================================================================
-- WiizePay — correção/atualização da chave da Resend no cofre do banco
-- Troque o texto abaixo pela sua chave real da Resend (começa com re_)
-- e rode tudo de uma vez no SQL Editor do banco de produção.
-- Obs.: a tabela vault.secrets não aceita UPDATE direto; use as funções.
-- =====================================================================

DO $$
DECLARE
  _id uuid;
  _chave_resend text := 'COLE_AQUI_SUA_CHAVE_REAL_DA_RESEND';
BEGIN
  SELECT id INTO _id FROM vault.decrypted_secrets WHERE name = 'resend_api_key' LIMIT 1;
  IF _id IS NOT NULL THEN
    PERFORM vault.update_secret(_id, _chave_resend);
  ELSE
    PERFORM vault.create_secret(_chave_resend, 'resend_api_key', 'Chave da API Resend');
  END IF;
END $$;

-- Libera o reenvio dos e-mails pulados por falta de chave
DELETE FROM email_outbox WHERE status = 'skipped';

-- Confirmação (mostra só o início da chave)
SELECT name, left(decrypted_secret, 6) || '...' AS chave_inicio, updated_at
FROM vault.decrypted_secrets WHERE name = 'resend_api_key';

-- Teste opcional: e-mail para o dono/admin da primeira empresa
DO $$
DECLARE _tenant_id uuid;
BEGIN
  SELECT id INTO _tenant_id FROM public.tenants LIMIT 1;
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'Nenhuma empresa encontrada.'; END IF;
  PERFORM public.wp_send_tenant_email(_tenant_id, 'test.email', 'teste:' || gen_random_uuid(),
    'Teste de notificação — WiizePay', 'Tudo funcionando no banco!',
    'Este é um e-mail de teste disparado pelo banco de dados da WiizePay via Resend.', '/painel');
END $$;

-- Conferência: os últimos e-mails devem aparecer como 'sent'
SELECT kind, status, recipient_masked, sent_at, error_message
FROM email_outbox ORDER BY created_at DESC LIMIT 10;
