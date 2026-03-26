
-- API clients for OAuth 2.1 client credentials
CREATE TABLE public.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE,
  client_secret_hash text NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz DEFAULT NULL
);

ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api_clients"
ON public.api_clients
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));
