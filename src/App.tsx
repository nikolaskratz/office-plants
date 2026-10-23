import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { DropIcon, LeafIcon, PlusIcon } from './components/icons'
import { Spinner } from './components/ui'
import { daysUntilDue } from './lib/plants'
import { PlantsProvider, usePlants } from './lib/store'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Overview from './pages/Overview'
import PlantDetail from './pages/PlantDetail'
import PlantForm from './pages/PlantForm'
import WaterRound from './pages/WaterRound'

function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

export default function App() {
  const session = useSession()
  if (session === undefined) return <Spinner />
  if (!session) return <Login />

  // Hash routing: works on GitHub Pages without server rewrites.
  return (
    <PlantsProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="water" element={<WaterRound />} />
            <Route path="plants/new" element={<PlantForm />} />
            <Route path="plants/:id" element={<PlantDetail />} />
            <Route path="plants/:id/edit" element={<PlantForm />} />
          </Route>
        </Routes>
      </HashRouter>
    </PlantsProvider>
  )
}

function Layout() {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-[calc(9rem+env(safe-area-inset-bottom))]">
      <Outlet />
      <TabBar />
    </div>
  )
}

function TabBar() {
  const { plants } = usePlants()
  const due = plants.filter((p) => daysUntilDue(p) <= 0).length
  const tab = ({ isActive }: { isActive: boolean }) =>
    `relative flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-xs font-medium ${
      isActive ? 'text-leaf-600 dark:text-leaf-300' : 'text-stone-500'
    }`

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
      <div className="mx-auto flex max-w-2xl">
        <NavLink to="/" end className={tab}>
          <LeafIcon /> Plants
        </NavLink>
        <NavLink to="/water" className={tab}>
          <DropIcon /> Water
          {due > 0 && (
            <span className="absolute top-1 left-1/2 ml-2 min-w-5 rounded-full bg-red-600 px-1.5 text-[11px] leading-5 text-white">
              {due}
            </span>
          )}
        </NavLink>
        <NavLink to="/plants/new" className={tab}>
          <PlusIcon /> Add
        </NavLink>
      </div>
    </nav>
  )
}
