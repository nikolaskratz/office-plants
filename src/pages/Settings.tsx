import { useEffect, useState } from 'react'
import { ErrorNote, PageHeader, Spinner, buttonSecondary, inputClass } from '../components/ui'
import {
  currentSubscription,
  disablePush,
  enablePush,
  getReminderSettings,
  isIOS,
  isStandalone,
  pushSupported,
  saveReminderSettings,
  sendTestPush,
  type ReminderSettings,
} from '../lib/push'
import { errorMessage, supabase } from '../lib/supabase'

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6) // 06:00 – 21:00

export default function Settings() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<ReminderSettings>({ hour: 9, weekdays_only: true })
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([currentSubscription(), getReminderSettings(), supabase.auth.getUser()])
      .then(([sub, saved, { data }]) => {
        setSubscribed(!!sub)
        if (saved) setSettings(saved)
        setEmail(data.user?.email ?? '')
      })
      .catch((e) => {
        setSubscribed(false)
        setError(errorMessage(e))
      })
  }, [])

  async function run(action: () => Promise<string | void>) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const message = await action()
      if (message) setInfo(message)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleReminders = () =>
    run(async () => {
      if (subscribed) {
        await disablePush()
        setSubscribed(false)
        return 'Reminders off on this phone.'
      }
      await enablePush()
      await saveReminderSettings(settings)
      setSubscribed(true)
      return 'Reminders on. Send a test to check.'
    })

  const update = (patch: Partial<ReminderSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void run(() => saveReminderSettings(next))
  }

  const test = () =>
    run(async () => {
      const sent = await sendTestPush()
      return sent ? 'Sent. It should arrive in a few seconds.' : 'No phone is subscribed. Turn reminders off and on again.'
    })

  return (
    <>
      <PageHeader title="Settings" back />
      <section className="mx-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
        <h2 className="mb-3 font-semibold">Watering reminder</h2>
        {!pushSupported() ? (
          isIOS() && !isStandalone() ? (
            <div className="text-sm text-stone-600 dark:text-stone-300">
              <p className="mb-2">On iPhone, reminders only work from the home-screen app:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Tap the Share button in Safari</li>
                <li>Choose “Add to Home Screen”</li>
                <li>Open Plants from your home screen and come back here</li>
              </ol>
            </div>
          ) : (
            <p className="text-sm text-stone-500">This browser can’t show notifications.</p>
          )
        ) : subscribed === null ? (
          <Spinner />
        ) : (
          <>
            <Row label="Daily reminder" hint="One notification when plants need water">
              <Switch checked={subscribed} disabled={busy} onChange={toggleReminders} />
            </Row>
            {subscribed && (
              <>
                <Row label="Time">
                  <select
                    value={settings.hour}
                    onChange={(e) => update({ hour: Number(e.target.value) })}
                    className={`${inputClass} !w-auto`}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Weekdays only" hint="Weekend plants show up on Monday">
                  <Switch
                    checked={settings.weekdays_only}
                    disabled={busy}
                    onChange={() => update({ weekdays_only: !settings.weekdays_only })}
                  />
                </Row>
                <button onClick={test} disabled={busy} className={`${buttonSecondary} mt-4 w-full`}>
                  Send test notification
                </button>
              </>
            )}
          </>
        )}
        {busy && !info && <p className="mt-3 text-sm text-stone-500">One moment…</p>}
        {info && <p className="mt-3 text-sm text-leaf-700 dark:text-leaf-300">{info}</p>}
      </section>
      <ErrorNote message={error} />

      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
        <h2 className="mb-1 font-semibold">Account</h2>
        <p className="mb-3 text-sm text-stone-500">{email}</p>
        <button onClick={() => supabase.auth.signOut()} className={`${buttonSecondary} w-full`}>
          Sign out
        </button>
      </section>
    </>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-stone-100 py-3 first-of-type:border-t-0 dark:border-stone-800">
      <div>
        <p className="font-medium">{label}</p>
        {hint && <p className="text-xs text-stone-500">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-8 w-13 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-leaf-600' : 'bg-stone-300 dark:bg-stone-700'
      }`}
    >
      <span
        className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}
