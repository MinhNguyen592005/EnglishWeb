import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { api } from '../services/api'
import type { DailyQuestOverview } from '../types'

type QuestState = {
  data: DailyQuestOverview | null
  loading: boolean
  refreshing: boolean
  error: string
  actionError: string
  pending: number | 'milestone' | null
  refresh: () => Promise<void>
  claim: (id: number | 'milestone') => Promise<boolean>
}
const DailyQuestsContext = createContext<QuestState | null>(null)

export function DailyQuestsProvider({ children }: { children: ReactNode }) {
  const { user, setUser, reload: reloadProfile } = useAuth()
  const userId = user?.role === 'LEARNER' ? user.id : null
  const currentUser = useRef(userId)
  currentUser.current = userId
  const { pathname } = useLocation()
  const [snapshot, setSnapshot] = useState<{ userId: number; data: DailyQuestOverview } | null>(
    null,
  )
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pending, setPending] = useState<QuestState['pending']>(null)
  const revision = useRef(0)
  const operation = useRef(false)
  const data = snapshot?.userId === userId ? snapshot.data : null

  const refresh = useCallback(async () => {
    if (userId === null || operation.current) return
    const requestRevision = ++revision.current
    setRefreshing(true)
    try {
      const overview = await api.dailyQuests()
      if (currentUser.current === userId && revision.current === requestRevision) {
        setSnapshot({ userId, data: overview })
        setError('')
      }
    } catch (e) {
      if (currentUser.current === userId && revision.current === requestRevision) {
        setError((e as Error).message || 'Không thể tải nhiệm vụ hôm nay.')
      }
    } finally {
      if (currentUser.current === userId && revision.current === requestRevision)
        setRefreshing(false)
    }
  }, [userId])

  useEffect(() => {
    setSnapshot(null)
    setError('')
    setActionError('')
    setPending(null)
    setRefreshing(false)
    operation.current = false
    return () => {
      revision.current++
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh, pathname])

  useEffect(() => {
    if (userId === null) return
    const focus = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const storage = (event: StorageEvent) => {
      if (event.key === `grammarquest:quests:${userId}`) {
        void refresh()
        void reloadProfile().catch(() => {})
      }
    }
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', focus)
      window.removeEventListener('storage', storage)
    }
  }, [refresh, reloadProfile, userId])

  async function claim(id: number | 'milestone') {
    if (userId === null || operation.current || !data) return false
    if (id === 'milestone') {
      if (!data.milestone.allCompleted || data.milestone.claimed) return false
    } else if (!data.quests.some((q) => q.id === id && q.completed && !q.claimed)) return false
    operation.current = true
    const claimRevision = ++revision.current
    setPending(id)
    setActionError('')
    setRefreshing(false)
    let success = false
    try {
      if (id === 'milestone') {
        const result = await api.claimDailyMilestone()
        if (currentUser.current !== userId || revision.current !== claimRevision) return false
        setUser(result.profile)
        setSnapshot((previous) =>
          previous?.userId === userId
            ? {
                userId,
                data: { ...previous.data, milestone: result.milestone, streak: result.streak },
              }
            : previous,
        )
      } else {
        const result = await api.claimDailyQuest(id)
        if (currentUser.current !== userId || revision.current !== claimRevision) return false
        setUser(result.profile)
        setSnapshot((previous) =>
          previous?.userId === userId
            ? {
                userId,
                data: {
                  ...previous.data,
                  quests: previous.data.quests.map((q) => (q.id === id ? result.quest : q)),
                },
              }
            : previous,
        )
      }
      success = true
      try {
        localStorage.setItem(`grammarquest:quests:${userId}`, crypto.randomUUID())
      } catch {
        /* Storage may be unavailable. */
      }
    } catch (e) {
      if (currentUser.current === userId && revision.current === claimRevision) {
        setActionError((e as Error).message || 'Chưa nhận được thưởng. Vui lòng thử lại.')
      }
    } finally {
      if (currentUser.current === userId && revision.current === claimRevision) {
        operation.current = false
        setPending(null)
        await refresh()
      }
    }
    return success
  }

  return (
    <DailyQuestsContext.Provider
      value={{
        data,
        loading: userId !== null && !data && !error,
        refreshing,
        error,
        actionError,
        pending,
        refresh,
        claim,
      }}
    >
      {children}
    </DailyQuestsContext.Provider>
  )
}

export function useDailyQuests() {
  const context = useContext(DailyQuestsContext)
  if (!context) throw new Error('DailyQuestsProvider is missing')
  return context
}
