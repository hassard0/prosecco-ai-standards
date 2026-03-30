SELECT cron.unschedule('daily-database-backup');
SELECT cron.unschedule('summarize-mailing-lists-daily');

SELECT cron.schedule(
  'daily-database-backup',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/backup-database',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer RQrWLO-BdiuKutnRPPKvBx8EbyRV0PZF86tglc7MMU4"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'summarize-mailing-lists-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/summarize-mailing-list',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer RQrWLO-BdiuKutnRPPKvBx8EbyRV0PZF86tglc7MMU4"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);