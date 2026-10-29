import { useEffect, useRef } from 'react'

export const realtimeRefreshEvent = 'grammarquest:server-data-changed'

/** Refresh mounted readers on server invalidation/reconnect without remounting forms. */
export function useRealtimeRefresh(refresh: () => unknown, enabled = true) {
  const callback = useRef(refresh)
  callback.current = refresh
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let running = false
    let queued = false
    let disposed = false
    const run = async () => {
      if (disposed) return
      if (running) { queued = true; return }
      running = true
      try { await callback.current() } catch { /* Readers retain their own error state. */ }
      finally {
        running = false
        if (queued && !disposed) { queued = false; schedule() }
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void run(), 150)
    }
    window.addEventListener(realtimeRefreshEvent, schedule)
    return () => {
      disposed = true
      clearTimeout(timer)
      window.removeEventListener(realtimeRefreshEvent, schedule)
    }
  }, [enabled])
}
