UPDATE public.payment_fee_settings
SET active = false, effective_until = now()
WHERE active = true
  AND payment_method IN ('boleto', 'debit_card');

INSERT INTO public.payment_fee_settings
  (payment_method, installment_min, installment_max, fixed_fee, percentage_fee, version, active, effective_from)
VALUES
  ('boleto', 1, 1, 2.99, 4.99, 4, true, now()),
  ('boleto', 2, 6, 2.99, 5.99, 4, true, now()),
  ('boleto', 7, 12, 2.99, 6.49, 4, true, now()),
  ('boleto', 13, 21, 2.99, 6.99, 4, true, now()),
  ('debit_card', 1, 1, 0.99, 4.99, 4, true, now()),
  ('debit_card', 2, 6, 0.99, 5.99, 4, true, now()),
  ('debit_card', 7, 12, 0.99, 6.49, 4, true, now()),
  ('debit_card', 13, 21, 0.99, 6.99, 4, true, now());

INSERT INTO public.fee_change_log (kind, payment_method, next, reason)
VALUES
  ('commercial_fee', 'boleto', '{"version":4,"fixed_fee_rule":"per_installment","tiers":[{"min":1,"max":1,"percentage":4.99},{"min":2,"max":6,"percentage":5.99},{"min":7,"max":12,"percentage":6.49},{"min":13,"max":21,"percentage":6.99}]}'::jsonb, 'Faixas progressivas aprovadas para boleto'),
  ('commercial_fee', 'debit_card', '{"version":4,"fixed_fee_rule":"once_per_sale","tiers":[{"min":1,"max":1,"percentage":4.99},{"min":2,"max":6,"percentage":5.99},{"min":7,"max":12,"percentage":6.49},{"min":13,"max":21,"percentage":6.99}]}'::jsonb, 'Faixas progressivas aprovadas para débito em conta');