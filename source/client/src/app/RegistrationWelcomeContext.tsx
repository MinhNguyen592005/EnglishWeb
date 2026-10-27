import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

type WelcomeState = {
  visible: boolean
  showAfterRegistration: (userId: number) => void
  dismiss: () => void
}
const Context = createContext<WelcomeState | null>(null)

// This registration event lives only in React memory, never in route or browser storage.
export function RegistrationWelcomeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [registeredUserId, setRegisteredUserId] = useState<number | null>(null)
  const showAfterRegistration = useCallback((userId: number) => setRegisteredUserId(userId), [])
  const dismiss = useCallback(() => setRegisteredUserId(null), [])
  useEffect(() => {
    if (!user) setRegisteredUserId(null)
  }, [user?.id])
  return (
    <Context.Provider
      value={{ visible: !!user && registeredUserId === user.id, showAfterRegistration, dismiss }}
    >
      {children}
    </Context.Provider>
  )
}

export function useRegistrationWelcome() {
  const value = useContext(Context)
  if (!value) throw new Error('RegistrationWelcomeProvider is missing')
  return value
}
