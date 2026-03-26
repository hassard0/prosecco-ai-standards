ALTER TABLE public.api_clients
ADD COLUMN IF NOT EXISTS redirect_uris text[] NOT NULL DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS grant_types text[] NOT NULL DEFAULT ARRAY['client_credentials']::text[],
ADD COLUMN IF NOT EXISTS token_endpoint_auth_method text NOT NULL DEFAULT 'client_secret_post',
ADD COLUMN IF NOT EXISTS is_dynamic boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  client_id text NOT NULL,
  user_id uuid NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  scope text NOT NULL DEFAULT 'mcp',
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_client_id
  ON public.oauth_authorization_codes (client_id);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_expires_at
  ON public.oauth_authorization_codes (expires_at);

ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'oauth_authorization_codes'
      AND policyname = 'Admins can read oauth authorization codes'
  ) THEN
    CREATE POLICY "Admins can read oauth authorization codes"
    ON public.oauth_authorization_codes
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;