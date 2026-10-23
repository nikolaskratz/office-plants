import { supabase } from './supabase'

export type Plant = {
  id: string
  name: string
  species: string | null
  location: string | null
  photo_path: string | null
  interval_days: number
  last_watered_at: string | null
  snoozed_until: string | null
  notes: string | null
  created_at: string
}

export type PlantInput = Pick<Plant, 'name' | 'species' | 'location' | 'interval_days' | 'notes'>

export type CareEvent = {
  id: string
  plant_id: string
  type: 'water' | 'snooze' | 'fertilize' | 'note'
  at: string
  note: string | null
}

const BUCKET = 'plant-photos'
const DAY = 86_400_000

// --- Schedule ---------------------------------------------------------------

/** Never-watered plants are due right away; a snooze can push the date out. */
export function nextDue(p: Plant): Date {
  const base = p.last_watered_at
    ? new Date(p.last_watered_at).getTime() + p.interval_days * DAY
    : new Date(p.created_at).getTime()
  const snoozed = p.snoozed_until ? new Date(p.snoozed_until).getTime() : 0
  return new Date(Math.max(base, snoozed))
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Calendar days until watering is due: negative = overdue, 0 = today. */
export function daysUntilDue(p: Plant, now = new Date()): number {
  return Math.round((startOfDay(nextDue(p)) - startOfDay(now)) / DAY)
}

export type DueStatus = 'overdue' | 'today' | 'soon' | 'ok'

export function dueStatus(days: number): DueStatus {
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'soon'
  return 'ok'
}

export function dueLabel(days: number): string {
  if (days < -1) return `${-days} days overdue`
  if (days === -1) return '1 day overdue'
  if (days === 0) return 'Water today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

export function byDueDate(a: Plant, b: Plant): number {
  return nextDue(a).getTime() - nextDue(b).getTime() || a.name.localeCompare(b.name)
}

export function formatDay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// --- Data -------------------------------------------------------------------

export async function listPlants(): Promise<Plant[]> {
  const { data, error } = await supabase.from('plants').select('*').order('created_at')
  if (error) throw error
  return data
}

export async function createPlant(input: PlantInput, photo: Blob | null): Promise<Plant> {
  const photo_path = photo ? await uploadPhoto(photo) : null
  const { data, error } = await supabase.from('plants').insert({ ...input, photo_path }).select().single()
  if (error) throw error
  return data
}

export async function updatePlant(plant: Plant, input: PlantInput, photo: Blob | null): Promise<void> {
  const photo_path = photo ? await uploadPhoto(photo) : plant.photo_path
  const { error } = await supabase.from('plants').update({ ...input, photo_path }).eq('id', plant.id)
  if (error) throw error
  if (photo && plant.photo_path) await supabase.storage.from(BUCKET).remove([plant.photo_path])
}

export async function deletePlant(plant: Plant): Promise<void> {
  const { error } = await supabase.from('plants').delete().eq('id', plant.id)
  if (error) throw error
  if (plant.photo_path) await supabase.storage.from(BUCKET).remove([plant.photo_path])
}

export async function waterPlants(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('water_plants', { plant_ids: ids })
  if (error) throw error
}

export async function snoozePlant(id: string, days: number): Promise<void> {
  const { error } = await supabase.rpc('snooze_plant', { plant_id: id, days })
  if (error) throw error
}

export async function updateInterval(id: string, days: number): Promise<void> {
  const { error } = await supabase.from('plants').update({ interval_days: days }).eq('id', id)
  if (error) throw error
}

export async function addNote(plantId: string, note: string): Promise<void> {
  const { error } = await supabase.from('care_events').insert({ plant_id: plantId, type: 'note', note })
  if (error) throw error
}

export async function listEvents(plantId: string): Promise<CareEvent[]> {
  const { data, error } = await supabase
    .from('care_events')
    .select('id, plant_id, type, at, note')
    .eq('plant_id', plantId)
    .order('at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data
}

// --- Photos -----------------------------------------------------------------

async function uploadPhoto(photo: Blob): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Not signed in')
  const path = `${data.user.id}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, photo, { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}

// Signed URLs are cached per path so photos aren't re-downloaded on every reload.
const photoUrls = new Map<string, string>()

export async function signPhotoUrls(paths: string[]): Promise<void> {
  const missing = [...new Set(paths)].filter((p) => !photoUrls.has(p))
  if (!missing.length) return
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, 7 * 24 * 3600)
  if (error) throw error
  for (const d of data) if (d.path && d.signedUrl) photoUrls.set(d.path, d.signedUrl)
}

export function photoUrl(path: string | null): string | undefined {
  return path ? photoUrls.get(path) : undefined
}
