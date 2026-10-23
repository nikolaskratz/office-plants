import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { listPlants, signPhotoUrls, type Plant } from './plants'
import { errorMessage } from './supabase'

type PlantsStore = {
  plants: Plant[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const PlantsContext = createContext<PlantsStore | null>(null)

export function PlantsProvider({ children }: { children: ReactNode }) {
  const [plants, setPlants] = useState<Plant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const rows = await listPlants()
      await signPhotoUrls(rows.flatMap((p) => (p.photo_path ? [p.photo_path] : [])))
      setPlants(rows)
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // A home-screen app can sit in the background for days; refresh when it comes back.
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  return <PlantsContext.Provider value={{ plants, loading, error, reload }}>{children}</PlantsContext.Provider>
}

export function usePlants(): PlantsStore {
  const store = useContext(PlantsContext)
  if (!store) throw new Error('usePlants outside PlantsProvider')
  return store
}
