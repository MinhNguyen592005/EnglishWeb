import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { useSystemSocket } from './SystemSocketContext'

export type PlacementState = {
  eligible: boolean
  required: boolean
  status: 'NOT_REQUIRED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  correctCount?: number
  totalQuestions?: number
  startingLevel?: number
  currentLevel?: number
  passedLevels?: number[]
  completedAt?: string
  message?: string
  startPath?: string
  resumePath?: string
}
type State = {
  data: PlacementState | null
  loading: boolean
  error: string
  reload: () => void
  accept: (value: PlacementState) => void
}
const Context = createContext<State | null>(null)
export function PlacementProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { request, subscribe, connected } = useSystemSocket()
  const eligible = user?.role === 'LEARNER' && user.placementEligible === true
  const owner = useRef(user?.id)
  owner.current = user?.id
  const [state, setState] = useState<{
    owner?: number
    data: PlacementState | null
    error: string
  }>({ data: null, error: '' })
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const accept = useCallback(
    (data: PlacementState) => setState({ owner: owner.current, data, error: '' }),
    [],
  )
  useEffect(() => {
    if (!eligible) {
      setState({ data: null, error: '' })
      return
    }
    let active = true
    request<PlacementState>('PLACEMENT_STATUS', 'PLACEMENT_DATA')
      .then((data) => {
        if (active) setState({ owner: user?.id, data, error: '' })
      })
      .catch((e) => {
        if (active) setState({ owner: user?.id, data: null, error: e.message })
      })
    return () => {
      active = false
    }
  }, [eligible, user?.id, request, version, connected])
  useEffect(
    () =>
      subscribe((message) => {
        if (message.action === 'PLACEMENT_COMPLETED') reload()
      }),
    [subscribe, reload],
  )
  const current = state.owner === user?.id ? state : null
  return (
    <Context.Provider
      value={{
        data: eligible ? (current?.data ?? null) : null,
        loading: !!eligible && !current?.data && !current?.error,
        error: eligible ? (current?.error ?? '') : '',
        reload,
        accept,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function usePlacement() {
  const value = useContext(Context)
  if (!value) throw new Error('PlacementProvider is missing')
  return value
}
