CREATE TABLE public.checkout_3ds_control (
 id text PRIMARY KEY DEFAULT 'checkout' CHECK (id = 'checkout'),
 allowed boolean NOT NULL DEFAULT false,
 updated_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.checkout_3ds_control TO service_role;
ALTER TABLE public.checkout_3ds_control ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.checkout_3ds_control IS 'Server-only operational 3DS gate; absent row means disabled. Does not attest Asaas production approval or homologation.';
CREATE TRIGGER checkout_3ds_control_touch BEFORE UPDATE ON public.checkout_3ds_control FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();