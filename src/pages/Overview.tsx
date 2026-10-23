import { Link } from 'react-router-dom'
import { PlusIcon } from '../components/icons'
import { DuePill, ErrorNote, PageHeader, PlantPhoto, Spinner, buttonPrimary } from '../components/ui'
import { byDueDate, daysUntilDue } from '../lib/plants'
import { usePlants } from '../lib/store'

export default function Overview() {
  const { plants, loading, error } = usePlants()
  const sorted = [...plants].sort(byDueDate)
  const dueCount = plants.filter((p) => daysUntilDue(p) <= 0).length

  return (
    <>
      <PageHeader title="Plants" />
      <p className="-mt-2 px-4 pb-3 text-sm text-stone-500">
        {plants.length === 0
          ? 'Nothing here yet.'
          : dueCount === 0
            ? `${plants.length} plants, all watered.`
            : `${plants.length} plants · ${dueCount} need water`}
      </p>
      <ErrorNote message={error} />
      {loading ? (
        <Spinner />
      ) : plants.length === 0 ? (
        <div className="px-4 pt-8 text-center">
          <p className="mb-6 text-stone-500">Add your first plant with a photo and a watering interval.</p>
          <Link to="/plants/new" className={`${buttonPrimary} inline-flex items-center gap-2`}>
            <PlusIcon className="size-5" /> Add plant
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3">
          {sorted.map((p) => (
            <li key={p.id}>
              <Link
                to={`/plants/${p.id}`}
                className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 active:scale-[0.98] dark:bg-stone-900 dark:ring-stone-800"
              >
                <PlantPhoto plant={p} className="aspect-square w-full" />
                <div className="p-3">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="mb-2 truncate text-xs text-stone-500">{p.location || p.species || ' '}</p>
                  <DuePill days={daysUntilDue(p)} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
