import { supabase } from './supabase'

type AppNavigator = Navigator & {
  standalone?: boolean
  setAppBadge?: (n?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}
const nav = navigator as AppNavigator

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || nav.standalone === true
export const currentTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Number on the home-screen icon (iOS 16.4+, Chrome on Android). */
export function setAppBadge(count: number): void {
  const result = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.()
  result?.catch(() => undefined)
}

// getRegistration (not .ready) so this doesn't hang in dev, where no worker is registered.
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** Must be called straight from a tap: iOS only shows the permission prompt for user gestures. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked for this app. Allow them in your phone settings, then try again.')
  }
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('The app is still installing. Reload and try again.')
  const { data: key, error } = await supabase.rpc('vapid_public_key')
  if (error) throw error
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key as string) }))
  const keys = sub.toJSON().keys ?? {}
  const { error: saveError } = await supabase
    .from('push_subscriptions')
    .upsert(
      { endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: navigator.userAgent },
      { onConflict: 'endpoint' },
    )
  if (saveError) throw saveError
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  if (error) throw error
  await sub.unsubscribe()
}

/** Sends the digest (or a "reminders work" note) to all of this user's devices right now. */
export async function sendTestPush(): Promise<number> {
  const { data, error } = await supabase.functions.invoke<{ sent: number }>('send-reminders', { body: {} })
  if (error) throw error
  return data?.sent ?? 0
}

export type ReminderSettings = { hour: number; weekdays_only: boolean }

export async function getReminderSettings(): Promise<ReminderSettings | null> {
  const { data, error } = await supabase.from('reminder_settings').select('hour, weekdays_only').maybeSingle()
  if (error) throw error
  return data
}

export async function saveReminderSettings(s: ReminderSettings): Promise<void> {
  const { error } = await supabase
    .from('reminder_settings')
    .upsert({ ...s, timezone: currentTimezone() }, { onConflict: 'user_id' })
  if (error) throw error
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}
