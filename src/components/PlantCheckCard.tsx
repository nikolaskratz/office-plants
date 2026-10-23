import type { ReactNode } from 'react'
import { healthLabels, type PlantCheck } from '../lib/ai'
import { SparkleIcon } from './icons'

const healthStyles: Record<PlantCheck['health'], string> = {
  healthy: 'bg-leaf-100 text-leaf-700 dark:bg-leaf-900 dark:text-leaf-100',
  needs_attention: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  unhealthy: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}

const card = 'rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800'

export function PlantCheckCard({ check, children }: { check: PlantCheck; children?: ReactNode }) {
  if (!check.is_plant) {
    return <p className={`${card} text-sm text-stone-600 dark:text-stone-300`}>That doesn't look like a plant. Try another photo.</p>
  }
  return (
    <div className={card}>
      <div className="flex items-start gap-2">
        <SparkleIcon className="mt-0.5 size-5 shrink-0 text-leaf-600 dark:text-leaf-300" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {check.common_name}
            {check.confidence !== 'high' && <span className="font-normal text-stone-500"> · best guess</span>}
          </p>
          <p className="text-sm italic text-stone-500">{check.species}</p>
        </div>
      </div>

      <div className="mt-3">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${healthStyles[check.health]}`}>
          {healthLabels[check.health]}
        </span>
        <p className="mt-1 text-sm">{check.health_summary}</p>
        {check.actions.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {check.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-stone-500">Water</dt>
        <dd>
          Every {check.water_every_days} days. {check.watering_tip}
        </dd>
        <dt className="text-stone-500">Light</dt>
        <dd>{check.light}</dd>
      </dl>
      {children}
    </div>
  )
}

export function CheckingNote({ what }: { what: string }) {
  return (
    <p className={`${card} flex items-center gap-3 text-sm text-stone-600 dark:text-stone-300`}>
      <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-leaf-100 border-t-leaf-500" />
      {what} This takes about 10 seconds.
    </p>
  )
}
