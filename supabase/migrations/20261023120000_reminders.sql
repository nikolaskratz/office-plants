-- Phase 2: daily watering reminders via Web Push.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- One row per device that allowed notifications.
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create table public.reminder_settings (
  user_id       uuid primary key default auth.uid() references auth.users on delete cascade,
  hour          int  not null default 9 check (hour between 0 and 23),
  timezone      text not null default 'Europe/Berlin',
  weekdays_only boolean not null default true,
  last_sent_on  date
);

alter table public.push_subscriptions enable row level security;
alter table public.reminder_settings enable row level security;

create policy "own subscriptions" on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own reminder settings" on public.reminder_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Secrets live in Vault and never leave Supabase: the cron secret is generated here,
-- the VAPID key pair by the send-reminders Edge Function on its first run.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'reminders_cron_secret');

create function public.push_config()
returns json
language sql
security definer
set search_path = ''
as $$
  select coalesce(json_object_agg(name, decrypted_secret), '{}'::json)
    from vault.decrypted_secrets
   where name in ('vapid_public_key', 'vapid_private_key', 'reminders_cron_secret');
$$;

create function public.save_vapid_keys(public_key text, private_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from vault.secrets where name = 'vapid_private_key') then
    raise exception 'VAPID keys already exist';
  end if;
  perform vault.create_secret(public_key, 'vapid_public_key');
  perform vault.create_secret(private_key, 'vapid_private_key');
end;
$$;

-- The public key is what the browser needs to subscribe; safe to hand out.
create function public.vapid_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key';
$$;

revoke execute on function public.push_config() from public, anon, authenticated;
revoke execute on function public.save_vapid_keys(text, text) from public, anon, authenticated;
revoke execute on function public.vapid_public_key() from public, anon;
grant execute on function public.push_config() to service_role;
grant execute on function public.save_vapid_keys(text, text) to service_role;
grant execute on function public.vapid_public_key() to authenticated;
