import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ApiRequestError } from '../services/api'

import { ErrorState } from '../components/States'
import type { Profile } from '../types'

type AuthState = { user: Profile | null; loading: boolean; setUser: (u: Profile | null) => void; reload: () => Promise<void>; setReloadHandler:(handler:(()=>Promise<Profile>)|null)=>void }
const AuthContext = createContext<AuthState | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reloadHandler=useRef<(()=>Promise<Profile>)|null>(null)
  const setReloadHandler=useCallback((handler:(()=>Promise<Profile>)|null)=>{reloadHandler.current=handler},[])
  const reload=useCallback(async()=>{const profile=await (reloadHandler.current?reloadHandler.current():api.me());setUser(current=>current?.id===profile.id?profile:current)},[])
  useEffect(() => {
    const unauthenticated = () => setUser(null)
    window.addEventListener('grammarquest:unauthenticated', unauthenticated)
    let active = true
    setLoading(true); setError('')
    api.me().then(profile => { if(active) setUser(profile) }).catch(e => {
      if(!active) return
      if(e instanceof ApiRequestError && (e.status === 401 || e.code === 'ACCOUNT_LOCKED')) setUser(null)
      else setError(e.message)
    }).finally(() => { if(active) setLoading(false) })
    return () => { active = false; window.removeEventListener('grammarquest:unauthenticated', unauthenticated) }
  }, [revision])
  return <AuthContext.Provider value={{ user, loading, setUser, reload, setReloadHandler }}>{error ? <ErrorState message={error} retry={() => setRevision(value => value + 1)}/> : children}</AuthContext.Provider>
}
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider is missing')
  return context
}
