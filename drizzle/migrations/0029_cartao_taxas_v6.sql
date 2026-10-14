-- Tabela oficial de taxas do cartão de crédito, versão 6.
-- Substitui a versão 5 (4,99 / 5,49 / 5,99 / 6,29) e mantém a tarifa fixa de R$ 0,99.
UPDATE public.payment_fee_settings
SET active = false, effective_until = now()
WHERE active = true AND payment_method = 'credit_card';

INSERT INTO public.payment_fee_settings
  (payment_method, installment_min, installment_max, fixed_fee, percentage_fee, version, active, public_visible, effective_from)
VALUES
  ('credit_card', 1, 1, 0.99, 4.99, 6, true, true, now()),
  ('credit_card', 2, 6, 0.99, 6.99, 6, true, true, now()),
  ('credit_card', 7, 12, 0.99, 7.99, 6, true, true, now()),
  ('credit_card', 13, 21, 0.99, 9.99, 6, true, true, now());

INSERT INTO public.fee_change_log (kind, payment_method, previous, next, reason)
VALUES (
  'commercial_fee',
  'credit_card',
  '{"version":5,"fixed_fee_rule":"once_per_sale","fixed_fee":0.99,"tiers":[{"min":1,"max":1,"percentage":4.99},{"min":2,"max":6,"percentage":5.49},{"min":7,"max":12,"percentage":5.99},{"min":13,"max":21,"percentage":6.29}]}'::jsonb,
  '{"version":6,"fixed_fee_rule":"once_per_sale","fixed_fee":0.99,"tiers":[{"min":1,"max":1,"percentage":4.99},{"min":2,"max":6,"percentage":6.99},{"min":7,"max":12,"percentage":7.99},{"min":13,"max":21,"percentage":9.99}]}'::jsonb,
  'Reajuste aprovado das taxas do cartão de crédito (v6)'
);