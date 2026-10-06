-- Agendamento diário dos avisos (cobranças em atraso e contratos perto de vencer)
-- Rode no SQL Editor do banco de produção. Troque COLE_AQUI_A_SENHA pela mesma senha do CRON_SECRET da Vercel.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Guarda a senha no cofre do banco (não fica visível no agendamento)
SELECT vault.create_secret('COLE_AQUI_A_SENHA', 'wiizepay_cron_secret')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'wiizepay_cron_secret');

-- Remove agendamento antigo com o mesmo nome, se existir
SELECT cron.unschedule('wiizepay-notifications')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wiizepay-notifications');

-- Todo dia às 12h UTC (9h de Brasília)
SELECT cron.schedule(
  'wiizepay-notifications',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.wiizepay.com/api/public/cron/notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'wiizepay_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
