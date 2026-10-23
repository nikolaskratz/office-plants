import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckingNote, PlantCheckCard } from '../components/PlantCheckCard'
import { CameraIcon, MinusIcon, PlusIcon, SparkleIcon } from '../components/icons'
import { ErrorNote, PageHeader, Spinner, buttonPrimary, buttonSecondary, inputClass } from '../components/ui'
import { checkPlantPhoto, type PlantCheck } from '../lib/ai'
import { resizePhoto } from '../lib/image'
import { createPlant, deletePlant, photoUrl, updatePlant, waterPlants, type Plant } from '../lib/plants'
import { usePlants } from '../lib/store'
import { errorMessage } from '../lib/supabase'

const INTERVAL_PRESETS = [3, 5, 7, 10, 14, 21]

export default function PlantForm() {
  const { id } = useParams()
  const { plants, loading } = usePlants()
  if (!id) return <Form />
  const plant = plants.find((p) => p.id === id)
  if (plant) return <Form plant={plant} />
  return loading ? <Spinner /> : <PageHeader title="Plant not found" back />
}

function Form({ plant }: { plant?: Plant }) {
  const navigate = useNavigate()
  const { reload } = usePlants()
  const [name, setName] = useState(plant?.name ?? '')
  const [species, setSpecies] = useState(plant?.species ?? '')
  const [location, setLocation] = useState(plant?.location ?? '')
  const [intervalDays, setIntervalDays] = useState(plant?.interval_days ?? 7)
  const [notes, setNotes] = useState(plant?.notes ?? '')
  const [wateredToday, setWateredToday] = useState(true)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | undefined>(photoUrl(plant?.photo_path ?? null))
  const [check, setCheck] = useState<PlantCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => void (preview?.startsWith('blob:') && URL.revokeObjectURL(preview)), [preview])

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    try {
      const blob = await resizePhoto(file)
      setPhoto(blob)
      setPreview(URL.createObjectURL(blob))
      setCheck(null)
      if (!plant) await identify(blob) // new plant: fill the form from the photo right away
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function identify(blob: Blob) {
    setChecking(true)
    setError(null)
    try {
      const result = await checkPlantPhoto(blob)
      setCheck(result)
      if (!result.is_plant) return
      // Fill in what Claude saw; typed-in name and notes win, everything stays editable.
      setSpecies(result.species)
      setName((n) => n || result.common_name)
      setIntervalDays(result.water_every_days)
      setNotes((n) => n || `${result.light}. ${result.watering_tip}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setChecking(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const input = {
      name: name.trim(),
      species: species.trim() || null,
      location: location.trim() || null,
      interval_days: intervalDays,
      notes: notes.trim() || null,
    }
    try {
      if (plant) {
        await updatePlant(plant, input, photo)
        await reload()
        navigate(-1)
      } else {
        const created = await createPlant(input, photo)
        if (wateredToday) await waterPlants([created.id])
        await reload()
        navigate(`/plants/${created.id}`, { replace: true })
      }
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  async function remove() {
    if (!plant || !confirm(`Delete ${plant.name}? Its history goes too.`)) return
    setBusy(true)
    try {
      await deletePlant(plant)
      await reload()
      navigate('/', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={plant ? 'Edit plant' : 'New plant'} back />
      <form onSubmit={submit} className="flex flex-col gap-5 px-4 pb-8">
        <label className="relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-2xl bg-leaf-50 ring-1 ring-stone-200 dark:bg-leaf-900 dark:ring-stone-800">
          {preview ? (
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-2 text-leaf-600 dark:text-leaf-300">
              <CameraIcon className="size-10" />
              <span className="font-medium">Take or choose a photo</span>
              {!plant && <span className="text-sm text-stone-500">The plant is recognised and filled in for you</span>}
            </span>
          )}
          {preview && (
            <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
              Change photo
            </span>
          )}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </label>

        {checking ? (
          <CheckingNote what="Identifying the plant…" />
        ) : check ? (
          <PlantCheckCard check={check}>
            {check.is_plant && <p className="mt-3 text-xs text-stone-500">Filled in below. Change anything that's off.</p>}
          </PlantCheckCard>
        ) : (
          plant &&
          photo && (
            <button type="button" onClick={() => identify(photo)} className={`${buttonSecondary} flex items-center justify-center gap-2`}>
              <SparkleIcon className="size-5" /> Identify from this photo
            </button>
          )
        )}

        <Field label="Name">
          <input
            required
            maxLength={80}
            placeholder="e.g. Big monstera"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Species" hint="optional">
          <input
            placeholder="e.g. Monstera deliciosa"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Location" hint="optional">
          <input
            placeholder="e.g. Meeting room, window"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Water every">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIntervalDays(Math.max(1, intervalDays - 1))}
              className={`${buttonSecondary} !p-3`}
              aria-label="Fewer days"
            >
              <MinusIcon className="size-5" />
            </button>
            <span className="flex-1 text-center text-lg font-semibold">
              {intervalDays} {intervalDays === 1 ? 'day' : 'days'}
            </span>
            <button
              type="button"
              onClick={() => setIntervalDays(Math.min(90, intervalDays + 1))}
              className={`${buttonSecondary} !p-3`}
              aria-label="More days"
            >
              <PlusIcon className="size-5" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTERVAL_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setIntervalDays(d)}
                className={`rounded-full px-3 py-1 text-sm ring-1 ${
                  d === intervalDays
                    ? 'bg-leaf-600 text-white ring-leaf-600'
                    : 'ring-stone-300 text-stone-600 dark:ring-stone-700 dark:text-stone-300'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </Field>

        {!plant && (
          <Field label="Last watered">
            <div className="grid grid-cols-2 gap-2">
              {[
                [true, 'Today'],
                [false, 'Not sure'],
              ].map(([value, label]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setWateredToday(value as boolean)}
                  className={`rounded-xl py-2.5 font-medium ring-1 ${
                    wateredToday === value
                      ? 'bg-leaf-600 text-white ring-leaf-600'
                      : 'ring-stone-300 dark:ring-stone-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {!wateredToday && <p className="mt-1 text-xs text-stone-500">It'll show up as due right away.</p>}
          </Field>
        )}

        <Field label="Notes" hint="optional">
          <textarea
            rows={3}
            placeholder="Likes misting, no direct sun…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </Field>

        <ErrorNote message={error} />
        <button type="submit" disabled={busy || checking} className={buttonPrimary}>
          {busy ? 'Saving…' : plant ? 'Save changes' : 'Add plant'}
        </button>
        {plant && (
          <button type="button" onClick={remove} disabled={busy} className="py-2 text-sm font-medium text-red-700 dark:text-red-400">
            Delete plant
          </button>
        )}
      </form>
    </>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">
        {label} {hint && <span className="font-normal text-stone-400">({hint})</span>}
      </p>
      {children}
    </div>
  )
}
