ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_pending_nonneg CHECK (pending_balance >= 0),
  ADD CONSTRAINT wallets_available_nonneg CHECK (available_balance >= 0),
  ADD CONSTRAINT wallets_blocked_nonneg CHECK (blocked_balance >= 0);
ALTER TABLE public.withdrawals
  ADD CONSTRAINT withdrawals_fee_valid CHECK (fee_amount >= 0 AND net_amount > 0 AND net_amount <= amount);
ALTER TABLE public.payments
  ADD CONSTRAINT payments_amounts_valid CHECK (gross_amount > 0 AND platform_fee_amount >= 0 AND refunded_amount >= 0);