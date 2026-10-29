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
import { api } from '../services/api'
import type { AccountNotification, NotificationInbox } from '../types'

type NotificationsState = NotificationInbox & {
  loading: boolean
  loadingMore: boolean
  error: string
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  read: (id: number) => Promise<AccountNotification>
  readAll: () => Promise<void>
}
const empty: NotificationInbox = { items: [], unreadCount: 0, nextBeforeId: null }
const Context = createContext<NotificationsState | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { connected, subscribe } = useSystemSocket()
  const [inbox, setInbox] = useState<NotificationInbox>(empty)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const identity = user ? `${user.id}:${user.role}` : ''
  const identityRef = useRef(identity)
  identityRef.current = identity
  const revision = useRef(0)
  const morePending = useRef(false)

  const refresh = useCallback(async () => {
    if (!identity) return
    const version = ++revision.current
    setLoading(true)
    try {
      const next = await api.notifications()
      if (identityRef.current === identity && version === revision.current) {
        setInbox(next)
        setError('')
      }
    } catch (e) {
      if (identityRef.current === identity && version === revision.current)
        setError((e as Error).message)
    } finally {
      if (identityRef.current === identity && version === revision.current) setLoading(false)
    }
  }, [identity])

  useEffect(() => {
    setInbox(empty)
    setError('')
    setLoading(false)
    setLoadingMore(false)
    morePending.current = false
    return () => {
      ++revision.current
    }
  }, [identity])

  useEffect(() => {
    if (!identity) return
    const off = subscribe((message) => {
      if (message.action === 'NOTIFICATIONS_CHANGED') void refresh()
    })
    // Also load offline history on sign-in, reconnect and return to this tab.
    void refresh()
    const focus = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', focus)
    return () => {
      off()
      document.removeEventListener('visibilitychange', focus)
    }
  }, [identity, connected, subscribe, refresh])

  async function loadMore() {
    if (!identity || !inbox.nextBeforeId || morePending.current) return
    morePending.current = true
    setLoadingMore(true)
    const version = revision.current
    try {
      const next = await api.notifications(inbox.nextBeforeId)
      if (identityRef.current === identity && revision.current === version) {
        setInbox((old) => ({
          ...next,
          items: [
            ...old.items,
            ...next.items.filter((item) => !old.items.some((existing) => existing.id === item.id)),
          ],
        }))
        setError('')
      }
    } catch (e) {
      if (identityRef.current === identity) setError((e as Error).message)
    } finally {
      morePending.current = false
      if (identityRef.current === identity) setLoadingMore(false)
    }
  }

  async function read(id: number) {
    const item = await api.readNotification(id)
    if (identityRef.current !== identity)
      throw new Error('Tài khoản đã thay đổi. Vui lòng mở lại thông báo.')
    setInbox((old) => ({
      ...old,
      items: old.items.map((entry) => (entry.id === id ? item : entry)),
    }))
    void refresh()
    return item
  }

  async function readAll() {
    await api.readAllNotifications()
    if (identityRef.current === identity) await refresh()
  }

  return (
    <Context.Provider
      value={{ ...inbox, loading, loadingMore, error, refresh, loadMore, read, readAll }}
    >
      {children}
    </Context.Provider>
  )
}

export function useNotifications() {
  const context = useContext(Context)
  if (!context) throw new Error('NotificationsProvider is missing')
  return context
}
