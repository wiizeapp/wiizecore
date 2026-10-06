UPDATE public.anticipation_fee_settings SET monthly_percentage_fee = CASE payment_method
  WHEN 'credit_card_single' THEN 4.99 WHEN 'credit_card_installment' THEN 5.49 WHEN 'boleto' THEN 7.99 END, updated_at = now()
WHERE active = true AND payment_method IN ('credit_card_single','credit_card_installment','boleto');