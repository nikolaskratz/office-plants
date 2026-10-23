import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Plant } from './plants'
import { supabase } from './supabase'

/** What Claude sees in a photo (see supabase/functions/plant-ai). */
export type PlantCheck = {
  is_plant: boolean
  common_name: string
  species: string
  confidence: 'high' | 'medium' | 'low'
  water_every_days: number
  watering_tip: string
  light: string
  health: 'healthy' | 'needs_attention' | 'unhealthy'
  health_summary: string
  actions: string[]
}

/** Identify a new plant, or pass `plant` for a health check of one that's already in the app. */
export async function checkPlantPhoto(photo: Blob, plant?: Plant): Promise<PlantCheck> {
  const image = await toBase64(photo)
  const context = plant && {
    name: plant.name,
    species: plant.species,
    interval_days: plant.interval_days,
    last_watered_at: plant.last_watered_at,
    notes: plant.notes,
  }
  const { data, error } = await supabase.functions.invoke<PlantCheck>('plant-ai', { body: { image, plant: context } })
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    throw new Error(body?.error ?? 'Plant check failed')
  }
  if (error) throw error
  return data!
}

export const healthLabels: Record<PlantCheck['health'], string> = {
  healthy: 'Looks healthy',
  needs_attention: 'Needs attention',
  unhealthy: 'Not doing well',
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
