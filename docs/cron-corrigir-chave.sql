-- =====================================================================
-- WiizePay — correção da chave da Resend
-- Use se o cron-producao.sql já foi rodado com o texto "COLE AQUI..."
-- Troque o texto abaixo pela sua chave real da Resend (começa com re_)
-- e rode tudo de uma vez no SQL Editor do banco de produção.
-- =====================================================================

-- 1) Substitui a chave errada pela correta (troque o texto entre aspas)
UPDATE vault.secrets
SET secret = 'COLE AQUI SUA CHAVE REAL DA RESEND (re_...)'
WHERE name = 'resend_api_key';

-- 2) Libera o reenvio dos e-mails que foram pulados por causa da chave errada
DELETE FROM email_outbox WHERE status = 'skipped';

-- 3) Confirmação: deve aparecer a chave mascarada (nunca a chave inteira)
SELECT name, left(decrypted_secret, 6) || '...' AS chave_inicio
FROM vault.decrypted_secrets
WHERE name = 'resend_api_key';

-- 4) Teste na hora (opcional): dispara os avisos agora
SELECT public.wp_daily_notifications();

-- 5) Conferência: os últimos e-mails devem aparecer como 'sent'
SELECT kind, status, recipient_masked, sent_at
FROM email_outbox
ORDER BY created_at DESC
LIMIT 10;
