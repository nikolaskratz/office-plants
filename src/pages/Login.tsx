import { useState, type FormEvent } from 'react'
import { buttonPrimary, ErrorNote, inputClass } from '../components/ui'
import { errorMessage, supabase } from '../lib/supabase'

// Email + password rather than magic links: on iOS a link opens in Safari,
// which doesn't share its session with the home-screen app.
export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) {
          setInfo('Account created. Confirm the link in your inbox, then sign in here.')
          setMode('signin')
        }
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="mb-6 size-16" />
      <h1 className="text-3xl font-bold tracking-tight">Office Plants</h1>
      <p className="mt-1 mb-8 text-stone-500">Keep them green.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          autoComplete="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <button type="submit" disabled={busy} className={`${buttonPrimary} mt-2`}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <div className="-mx-4">
        <ErrorNote message={error} />
      </div>
      {info && <p className="mt-3 text-sm text-leaf-700 dark:text-leaf-300">{info}</p>}
      <button
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        className="mt-6 text-sm text-stone-500 underline"
      >
        {mode === 'signin' ? 'First time? Create an account' : 'Have an account? Sign in'}
      </button>
    </main>
  )
}
