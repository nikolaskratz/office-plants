# Office Plants

Installable web app (PWA) for keeping track of office plants: overview, watering
schedule, water round, photo per plant. Runs on iPhone and Android via
"Add to Home Screen".

## Stack

- Vite + React + TypeScript + Tailwind, `vite-plugin-pwa`
- Supabase project `office-plants` (`adagtmentbsommzgbona`, eu-central-1):
  auth (email + password), Postgres with RLS, private `plant-photos` bucket
- Schema: [supabase/migrations](supabase/migrations)

## Develop

    npm install
    npm run dev        # also reachable from a phone on the same Wi-Fi

`npm run build` type-checks and builds to `dist/`. Pushing to `main` deploys to
GitHub Pages via `.github/workflows/deploy.yml`.

## How scheduling works

- Next due = last watered + interval; never-watered plants are due right away.
- "Still wet" snoozes a plant 2 days without counting as watered.
- `water_plants(uuid[])` and `snooze_plant(uuid, int)` are SQL functions that also
  write `care_events`, so history stays consistent.

## Roadmap

1. ~~MVP: plants, photos, overview, water round~~
2. Reminders: web push + pg_cron daily digest
3. AI: identify species + suggested interval from a photo, health check
4. Later: adaptive intervals, colleagues (spaces), QR stickers on pots
