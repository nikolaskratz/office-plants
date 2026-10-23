// Sends the daily "plants need water" push.
//
// Two callers:
// - pg_cron, hourly, with header x-cron-secret: sends each user's digest once per local
//   day, at or after their chosen hour.
// - the app's "Send test notification" button, with the user's JWT and {mode: "test"}:
//   sends right away to that user's devices.
//
// VAPID keys are created on first run and kept in Vault (see push_config()).

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_SUBJECT = 'https://nikolaskratz.github.io/office-plants/'
const DAY = 86_400_000

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Config = { vapid_public_key?: string; vapid_private_key?: string; reminders_cron_secret?: string }

type PlantRow = {
  name: string
  interval_days: number
  last_watered_at: string | null
  snoozed_until: string | null
  created_at: string
}

type Settings = {
  user_id: string
  hour: number
  timezone: string
  weekdays_only: boolean
  last_sent_on: string | null
}

type Payload = { title: string; body: string; url: string; count: number }

async function loadConfig(): Promise<Config> {
  const { data, error } = await supabase.rpc('push_config')
  if (error) throw error
  const config = data as Config
  if (!config.vapid_private_key) {
    const keys = webpush.generateVAPIDKeys()
    const { error } = await supabase.rpc('save_vapid_keys', { public_key: keys.publicKey, private_key: keys.privateKey })
    if (error) throw error
    config.vapid_public_key = keys.publicKey
    config.vapid_private_key = keys.privateKey
  }
  webpush.setVapidDetails(VAPID_SUBJECT, config.vapid_public_key!, config.vapid_private_key!)
  return config
}

// Same rule as src/lib/plants.ts: never watered = due now; a snooze can push it out.
function nextDue(p: PlantRow): Date {
  const base = p.last_watered_at
    ? new Date(p.last_watered_at).getTime() + p.interval_days * DAY
    : new Date(p.created_at).getTime()
  const snoozed = p.snoozed_until ? new Date(p.snoozed_until).getTime() : 0
  return new Date(Math.max(base, snoozed))
}

const localDate = (d: Date, tz: string) => d.toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
const localHour = (d: Date, tz: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(d))
const isWeekend = (d: Date, tz: string) =>
  ['Sat', 'Sun'].includes(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(d))

async function duePlantNames(userId: string, tz: string, now: Date): Promise<string[]> {
  const { data, error } = await supabase
    .from('plants')
    .select('name, interval_days, last_watered_at, snoozed_until, created_at')
    .eq('user_id', userId)
  if (error) throw error
  const today = localDate(now, tz)
  return (data as PlantRow[])
    .filter((p) => localDate(nextDue(p), tz) <= today)
    .sort((a, b) => nextDue(a).getTime() - nextDue(b).getTime())
    .map((p) => p.name)
}

function digest(names: string[]): Payload {
  const n = names.length
  const shown = names.slice(0, 4).join(', ') + (n > 4 ? ` +${n - 4} more` : '')
  return { title: n === 1 ? '💧 1 plant needs water' : `💧 ${n} plants need water`, body: shown, url: './#/water', count: n }
}

/** Sends to every device of the user; drops subscriptions the push service says are gone. */
async function sendToUser(userId: string, payload: Payload): Promise<number> {
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
  if (error) throw error
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 12 * 3600 },
      )
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id)
      else console.error('push failed', status, (e as Error).message)
    }
  }
  return sent
}

async function runDigests(now: Date) {
  const { data, error } = await supabase.from('reminder_settings').select('*')
  if (error) throw error
  const results = []
  for (const s of data as Settings[]) {
    const today = localDate(now, s.timezone)
    if (s.last_sent_on === today || localHour(now, s.timezone) < s.hour) continue
    if (s.weekdays_only && isWeekend(now, s.timezone)) continue
    const names = await duePlantNames(s.user_id, s.timezone, now)
    const sent = names.length ? await sendToUser(s.user_id, digest(names)) : 0
    await supabase.from('reminder_settings').update({ last_sent_on: today }).eq('user_id', s.user_id)
    results.push({ due: names.length, sent })
  }
  return results
}

async function runTest(userId: string, now: Date) {
  const { data } = await supabase.from('reminder_settings').select('timezone').eq('user_id', userId).maybeSingle()
  const names = await duePlantNames(userId, data?.timezone ?? 'Europe/Berlin', now)
  const payload = names.length
    ? digest(names)
    : { title: '🌿 Reminders work', body: 'Nothing needs water right now.', url: './#/', count: 0 }
  return { sent: await sendToUser(userId, payload) }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  try {
    const config = await loadConfig()
    const now = new Date()

    const cronSecret = req.headers.get('x-cron-secret')
    if (cronSecret) {
      if (cronSecret !== config.reminders_cron_secret) return json({ error: 'forbidden' }, 403)
      return json({ results: await runDigests(now) })
    }

    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '')
    const { data } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (!data.user) return json({ error: 'unauthorized' }, 401)
    return json(await runTest(data.user.id, now))
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
