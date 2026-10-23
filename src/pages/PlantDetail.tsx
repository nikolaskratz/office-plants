import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckingNote, PlantCheckCard } from '../components/PlantCheckCard'
import { DropIcon, SparkleIcon } from '../components/icons'
import { DuePill, ErrorNote, PageHeader, PlantPhoto, Spinner, buttonPrimary, buttonSecondary } from '../components/ui'
import { checkPlantPhoto, healthLabels, type PlantCheck } from '../lib/ai'
import { resizePhoto } from '../lib/image'
import {
  addNote,
  daysUntilDue,
  formatDay,
  listEvents,
  nextDue,
  snoozePlant,
  updateInterval,
  updatePlant,
  waterPlants,
  type CareEvent,
} from '../lib/plants'
import { usePlants } from '../lib/store'
import { errorMessage } from '../lib/supabase'

const eventLabels: Record<CareEvent['type'], string> = {
  water: 'Watered',
  snooze: 'Still wet, snoozed',
  fertilize: 'Fertilized',
  note: 'Note',
}

export default function PlantDetail() {
  const { id = '' } = useParams()
  const { plants, loading, reload } = usePlants()
  const plant = plants.find((p) => p.id === id)
  const [events, setEvents] = useState<CareEvent[]>([])
  const [check, setCheck] = useState<{ result: PlantCheck; photo: Blob } | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(() => listEvents(id).then(setEvents, (e) => setError(errorMessage(e))), [id])
  useEffect(() => void loadEvents(), [loadEvents])

  if (!plant) return loading ? <Spinner /> : <PageHeader title="Plant not found" back />

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await Promise.all([reload(), loadEvents()])
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function healthCheck(file: File | undefined) {
    if (!file || !plant) return
    setChecking(true)
    setCheck(null)
    setError(null)
    try {
      const photo = await resizePhoto(file)
      const result = await checkPlantPhoto(photo, plant)
      setCheck({ result, photo })
      if (result.is_plant) {
        await addNote(plant.id, `${healthLabels[result.health]}: ${result.health_summary}`)
        await loadEvents()
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setChecking(false)
    }
  }

  const days = daysUntilDue(plant)
  const suggested = check?.result.is_plant ? check.result.water_every_days : null

  return (
    <>
      <PageHeader
        title={plant.name}
        back
        action={
          <Link to={`/plants/${plant.id}/edit`} className="rounded-lg px-3 py-1.5 font-medium text-leaf-600 dark:text-leaf-300">
            Edit
          </Link>
        }
      />
      <div className="px-4">
        <PlantPhoto plant={plant} className="aspect-[4/3] w-full rounded-2xl" />

        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {plant.species && <p className="truncate italic text-stone-600 dark:text-stone-300">{plant.species}</p>}
            {plant.location && <p className="truncate text-sm text-stone-500">{plant.location}</p>}
          </div>
          <DuePill days={days} />
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
          <p className="text-sm text-stone-500">
            Every {plant.interval_days} days · next {days <= 0 ? 'now' : formatDay(nextDue(plant))}
          </p>
          <p className="text-sm text-stone-500">
            Last watered {plant.last_watered_at ? formatDay(plant.last_watered_at) : 'unknown'}
          </p>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={() => run(() => waterPlants([plant.id]))}
              disabled={busy}
              className={`${buttonPrimary} flex items-center justify-center gap-2`}
            >
              <DropIcon className="size-5" /> Watered now
            </button>
            <button onClick={() => run(() => snoozePlant(plant.id, 2))} disabled={busy} className={buttonSecondary}>
              Still wet
            </button>
          </div>
        </div>

        <div className="mt-4">
          {checking ? (
            <CheckingNote what="Checking the photo…" />
          ) : check ? (
            <PlantCheckCard check={check.result}>
              {check.result.is_plant && (
                <div className="mt-4 flex flex-col gap-2">
                  {suggested !== null && suggested !== plant.interval_days && (
                    <button
                      onClick={() => run(() => updateInterval(plant.id, suggested))}
                      disabled={busy}
                      className={buttonSecondary}
                    >
                      Water every {suggested} days instead of {plant.interval_days}
                    </button>
                  )}
                  <button
                    onClick={() => run(async () => {
                      const { name, species, location, interval_days, notes } = plant
                      await updatePlant(plant, { name, species, location, interval_days, notes }, check.photo)
                      setCheck(null)
                    })}
                    disabled={busy}
                    className={buttonSecondary}
                  >
                    Use as plant photo
                  </button>
                </div>
              )}
            </PlantCheckCard>
          ) : (
            <label className={`${buttonSecondary} flex cursor-pointer items-center justify-center gap-2`}>
              <SparkleIcon className="size-5" /> Health check from a photo
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => healthCheck(e.target.files?.[0])} />
            </label>
          )}
        </div>

        <ErrorNote message={error} />

        {plant.notes && (
          <section className="mt-6">
            <h2 className="mb-1 text-sm font-semibold tracking-wide text-stone-500 uppercase">Notes</h2>
            <p className="whitespace-pre-line">{plant.notes}</p>
          </section>
        )}

        <section className="mt-6 pb-6">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">History</h2>
          {events.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing logged yet.</p>
          ) : (
            <ul className="divide-y divide-stone-200 dark:divide-stone-800">
              {events.map((ev) => (
                <li key={ev.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>
                    {eventLabels[ev.type]}
                    {ev.note && <span className="text-stone-500"> · {ev.note}</span>}
                  </span>
                  <span className="shrink-0 text-stone-500">{formatDay(ev.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
