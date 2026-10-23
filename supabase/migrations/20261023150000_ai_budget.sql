-- Daily Claude budget per user instead of a fixed number of checks.
-- Every call that reached Claude is logged with what it cost, also when it gave no usable result.
alter table public.ai_checks
  add column cost_usd numeric(10, 6) not null default 0,
  alter column result drop not null;

-- What a user has spent today (Berlin calendar day). Only the plant-ai function calls this.
create function public.ai_spent_today(uid uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0)
  from public.ai_checks
  where user_id = uid
    and created_at >= (date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')
$$;

revoke execute on function public.ai_spent_today(uuid) from public, anon, authenticated;
grant execute on function public.ai_spent_today(uuid) to service_role;
