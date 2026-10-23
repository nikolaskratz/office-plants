import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckIcon } from '../components/icons'
import { DuePill, ErrorNote, PageHeader, PlantPhoto, Spinner, buttonPrimary } from '../components/ui'
import { byDueDate, daysUntilDue, snoozePlant, waterPlants, type Plant } from '../lib/plants'
import { usePlants } from '../lib/store'
import { errorMessage } from '../lib/supabase'

const UPCOMING_DAYS = 3
const SNOOZE_DAYS = 2

export default function WaterRound() {
  const { plants, loading, reload } = usePlants()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justWatered, setJustWatered] = useState(0)

  const sorted = [...plants].sort(byDueDate)
  const due = sorted.filter((p) => daysUntilDue(p) <= 0)
  const upcoming = sorted.filter((p) => {
    const d = daysUntilDue(p)
    return d > 0 && d <= UPCOMING_DAYS
  })

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      await waterPlants([...selected])
      setJustWatered(selected.size)
      setSelected(new Set())
    })

  const snooze = (id: string) =>
    run(async () => {
      await snoozePlant(id, SNOOZE_DAYS)
      setSelected((prev) => new Set([...prev].filter((x) => x !== id)))
    })

  if (loading) return <Spinner />

  return (
    <>
      <PageHeader title="Water round" />
      <ErrorNote message={error} />

      {due.length === 0 ? (
        <div className="mx-4 rounded-2xl bg-leaf-50 p-6 text-center dark:bg-leaf-900">
          <p className="text-4xl">🌿</p>
          <p className="mt-2 font-semibold">
            {justWatered > 0 ? `Done, ${justWatered} watered.` : 'Nothing to water today.'}
          </p>
          {upcoming[0] && (
            <p className="mt-1 text-sm text-stone-500">
              Next: {upcoming[0].name}, {daysUntilDue(upcoming[0]) === 1 ? 'tomorrow' : `in ${daysUntilDue(upcoming[0])} days`}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="-mt-2 px-4 pb-3 text-sm text-stone-500">Tick each plant as you water it, then save.</p>
          <RoundList plants={due} selected={selected} onToggle={toggle} onSnooze={snooze} busy={busy} />
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 className="px-4 pt-6 pb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">
            Coming up
          </h2>
          <RoundList plants={upcoming} selected={selected} onToggle={toggle} busy={busy} />
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] px-4">
          <button onClick={save} disabled={busy} className={`${buttonPrimary} w-full shadow-lg`}>
            Mark {selected.size} watered
          </button>
        </div>
      )}
    </>
  )
}

function RoundList({
  plants,
  selected,
  onToggle,
  onSnooze,
  busy,
}: {
  plants: Plant[]
  selected: Set<string>
  onToggle: (id: string) => void
  onSnooze?: (id: string) => void
  busy: boolean
}) {
  return (
    <ul className="mx-4 divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
      {plants.map((p) => {
        const checked = selected.has(p.id)
        return (
          <li key={p.id} className="flex items-center gap-3 p-3">
            <button
              onClick={() => onToggle(p.id)}
              aria-pressed={checked}
              aria-label={`Watered ${p.name}`}
              className={`grid size-9 shrink-0 place-items-center rounded-full ring-2 ${
                checked ? 'bg-leaf-600 text-white ring-leaf-600' : 'text-transparent ring-stone-300 dark:ring-stone-600'
              }`}
            >
              <CheckIcon className="size-5" />
            </button>
            <Link to={`/plants/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <PlantPhoto plant={p} className="size-12 shrink-0 rounded-lg" />
              <div className="min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-xs text-stone-500">{p.location || p.species || ' '}</p>
              </div>
            </Link>
            {onSnooze ? (
              <button
                onClick={() => onSnooze(p.id)}
                disabled={busy}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 ring-1 ring-stone-200 active:bg-stone-100 dark:ring-stone-700"
              >
                Still wet
              </button>
            ) : (
              <DuePill days={daysUntilDue(p)} />
            )}
          </li>
        )
      })}
    </ul>
  )
}
