import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../services/api'

import type { Profile } from '../types'

type AuthState = { user: Profile | null; loading: boolean; setUser: (u: Profile | null) => void; reload: () => Promise<void>; setReloadHandler:(handler:(()=>Promise<Profile>)|null)=>void }
const AuthContext = createContext<AuthState | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const reloadHandler=useRef<(()=>Promise<Profile>)|null>(null)
  const setReloadHandler=useCallback((handler:(()=>Promise<Profile>)|null)=>{reloadHandler.current=handler},[])
  const reload=useCallback(async()=>{const profile=await (reloadHandler.current?reloadHandler.current():api.me());setUser(current=>current?.id===profile.id?profile:current)},[])
  useEffect(() => {
    const unauthenticated = () => setUser(null)
    window.addEventListener('grammarquest:unauthenticated', unauthenticated)
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
    return () => window.removeEventListener('grammarquest:unauthenticated', unauthenticated)
  }, [])
  return <AuthContext.Provider value={{ user, loading, setUser, reload, setReloadHandler }}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider is missing')
  return context
}
