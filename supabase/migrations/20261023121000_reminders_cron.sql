-- Hourly tick; the function decides per user whether it's their reminder time.
select cron.schedule(
  'send-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://adagtmentbsommzgbona.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
