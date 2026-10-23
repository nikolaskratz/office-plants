-- Reserve a check's worst-case cost before calling Claude, so parallel requests can't overrun the
-- daily budget together. plant-ai then replaces the reservation with the real cost and result.
-- Returns the ai_checks id, or null when the reservation doesn't fit into today's budget.
create function public.ai_reserve(uid uuid, check_kind text, max_cost numeric, budget numeric)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ai_budget:' || uid::text));
  if public.ai_spent_today(uid) + max_cost > budget then
    return null;
  end if;
  insert into public.ai_checks (user_id, kind, cost_usd) values (uid, check_kind, max_cost)
  returning id into new_id;
  return new_id;
end
$$;

revoke execute on function public.ai_reserve(uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.ai_reserve(uuid, text, numeric, numeric) to service_role;
