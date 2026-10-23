import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { dueLabel, dueStatus, photoUrl, type DueStatus, type Plant } from '../lib/plants'
import { BackIcon, LeafIcon } from './icons'

const pillStyles: Record<DueStatus, string> = {
  overdue: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  today: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  soon: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  ok: 'bg-leaf-100 text-leaf-700 dark:bg-leaf-900 dark:text-leaf-100',
}

export function DuePill({ days }: { days: number }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${pillStyles[dueStatus(days)]}`}>
      {dueLabel(days)}
    </span>
  )
}

export function PlantPhoto({ plant, className = '' }: { plant: Plant; className?: string }) {
  const url = photoUrl(plant.photo_path)
  return url ? (
    <img src={url} alt="" className={`object-cover ${className}`} />
  ) : (
    <div className={`grid place-items-center bg-leaf-50 text-leaf-300 dark:bg-leaf-900 dark:text-leaf-500 ${className}`}>
      <LeafIcon className="size-1/3" />
    </div>
  )
}

export function PageHeader({ title, back, action }: { title: string; back?: boolean; action?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="flex items-center gap-2 px-4 pt-4 pb-3">
      {back && (
        <button
          onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))}
          className="-ml-2 rounded-full p-2 active:bg-stone-200 dark:active:bg-stone-800"
          aria-label="Back"
        >
          <BackIcon />
        </button>
      )}
      <h1 className="flex-1 truncate text-2xl font-bold tracking-tight">{title}</h1>
      {action}
    </header>
  )
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="mx-4 my-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      {message}
    </p>
  )
}

export function Spinner() {
  return (
    <div className="grid place-items-center py-16">
      <div className="size-8 animate-spin rounded-full border-4 border-leaf-100 border-t-leaf-500" />
    </div>
  )
}

export const buttonPrimary =
  'rounded-xl bg-leaf-600 px-4 py-3 font-semibold text-white active:bg-leaf-700 disabled:opacity-50'
export const buttonSecondary =
  'rounded-xl bg-white px-4 py-3 font-semibold text-stone-800 ring-1 ring-stone-200 active:bg-stone-50 disabled:opacity-50 dark:bg-stone-900 dark:text-stone-100 dark:ring-stone-700 dark:active:bg-stone-800'
export const inputClass =
  'w-full rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-leaf-500 dark:bg-stone-900 dark:ring-stone-700'
