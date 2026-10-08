CREATE TABLE public.inbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_email_id text NOT NULL UNIQUE,
  tenant_id uuid,
  to_address text NOT NULL,
  from_address text NOT NULL,
  subject text,
  text_body text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  read_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.inbound_emails TO service_role;
ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;
CREATE INDEX inbound_emails_received_idx ON public.inbound_emails (received_at DESC);