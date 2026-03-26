
-- Create storage bucket for backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- Allow service role to manage backup files (no public access)
CREATE POLICY "Service role can manage backups"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'backups')
WITH CHECK (bucket_id = 'backups');

-- Enable pg_cron and pg_net for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
