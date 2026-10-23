-- Plants under management. One owner per plant for now; spaces/members come later.
create table public.plants (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  name            text not null check (length(name) between 1 and 80),
  species         text,
  location        text,
  photo_path      text,
  interval_days   int  not null default 7 check (interval_days between 1 and 90),
  last_watered_at timestamptz,
  snoozed_until   timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);
create index plants_user_id_idx on public.plants (user_id);

create table public.care_events (
  id       uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  type     text not null check (type in ('water', 'snooze', 'fertilize', 'note')),
  at       timestamptz not null default now(),
  note     text
);
create index care_events_plant_id_at_idx on public.care_events (plant_id, at desc);
create index care_events_user_id_idx on public.care_events (user_id);

alter table public.plants enable row level security;
alter table public.care_events enable row level security;

create policy "own plants" on public.plants for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own care events" on public.care_events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.plants p where p.id = plant_id and p.user_id = (select auth.uid()))
  );

-- Water several plants in one go (the water round). Runs as the caller, so RLS applies.
create function public.water_plants(plant_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.plants
     set last_watered_at = now(), snoozed_until = null
   where id = any(plant_ids);
  insert into public.care_events (plant_id, type)
  select id, 'water' from public.plants where id = any(plant_ids);
$$;

-- "Soil still wet": push the reminder out without counting as watered.
create function public.snooze_plant(plant_id uuid, days int)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.plants
     set snoozed_until = now() + make_interval(days => days)
   where id = plant_id;
  insert into public.care_events (plant_id, type, note)
  values (plant_id, 'snooze', days || ' days');
$$;

revoke execute on function public.water_plants(uuid[]) from public, anon;
revoke execute on function public.snooze_plant(uuid, int) from public, anon;
grant execute on function public.water_plants(uuid[]) to authenticated;
grant execute on function public.snooze_plant(uuid, int) to authenticated;

-- Photos: private bucket, files stored under "<user_id>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plant-photos', 'plant-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "own photos read" on storage.objects for select to authenticated
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
