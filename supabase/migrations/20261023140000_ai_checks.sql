-- One row per Claude photo check (identify / health). Written by the plant-ai function with the
-- service role; the app can read its own rows. Also backs the daily per-user cap.
create table public.ai_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('identify', 'health')),
  result jsonb not null,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

create index ai_checks_user_created on public.ai_checks (user_id, created_at desc);

alter table public.ai_checks enable row level security;

create policy "read own ai checks" on public.ai_checks
  for select to authenticated using (user_id = (select auth.uid()));
