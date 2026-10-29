import {
  Bell,
  BellRing,
  BookOpen,
  CheckCheck,
  ChevronRight,
  Radio,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../app/NotificationsContext'
import type { AccountNotification } from '../types'
import './NotificationBell.css'

const date = (value: string) =>
  new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

export function NotificationBell() {
  const {
    items,
    unreadCount,
    nextBeforeId,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    read,
    readAll,
  } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [detail, setDetail] = useState<AccountNotification | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const actionPending = useRef(false)

  useEffect(() => {
    if (!open) return
    panel.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', keyboard)
    }
  }, [open])

  async function select(item: AccountNotification) {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true)
    setActionError('')
    try {
      const current = await read(item.id)
      if (current.classId) {
        const query = current.assignmentId
          ? `view=assignments&assignmentId=${current.assignmentId}`
          : `view=exams&examId=${current.examId}`
        navigate(`/classes/${current.classId}?${query}`)
        setOpen(false)
      } else setDetail(current)
    } catch (e) {
      setActionError((e as Error).message)
      void refresh()
    } finally {
      setBusy(false)
      actionPending.current = false
    }
  }

  async function markAll() {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true)
    setActionError('')
    try {
      await readAll()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
      actionPending.current = false
    }
  }

  return (
    <div className="notification-bell" ref={root}>
      <button
        type="button"
        className="icon-button notification-trigger"
        ref={trigger}
        aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`}
        title="Thông báo"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="notification-inbox"
        onClick={() => {
          setOpen((value) => !value)
          setDetail(null)
          setActionError('')
          if (!open) void refresh()
        }}
      >
        <Bell size={21} />
        {unreadCount > 0 && <span className="notification-dot" aria-hidden="true" />}
      </button>
      <span className="sr-only" role="status">
        {unreadCount ? `Bạn có ${unreadCount} thông báo chưa đọc` : ''}
      </span>
      {open && (
        <section
          className="notification-panel"
          id="notification-inbox"
          role="dialog"
          aria-labelledby="notification-title"
          ref={panel}
          tabIndex={-1}
        >
          <header className="notification-heading">
            <div>
              <span className="notification-heading-icon">
                <BellRing size={19} />
              </span>
              <h2 id="notification-title">Thông báo</h2>
              <span className="notification-count">{unreadCount} chưa đọc</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Đóng thông báo"
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              <X size={18} />
            </button>
          </header>
          <div className="notification-toolbar">
            <button
              type="button"
              disabled={!unreadCount || busy || loading}
              onClick={() => void markAll()}
            >
              <CheckCheck size={15} /> Đánh dấu tất cả đã đọc
            </button>
          </div>
          {(error || actionError) && (
            <div className="notification-error" role="alert">
              {actionError || error}
              <button type="button" onClick={() => void refresh()}>
                Thử lại
              </button>
            </div>
          )}
          {detail && (
            <div className="notification-detail" tabIndex={0}>
              <strong>{detail.title}</strong>
              <p>{detail.message}</p>
              <time dateTime={detail.createdAt}>{date(detail.createdAt)}</time>
              <button type="button" onClick={() => setDetail(null)}>
                Về danh sách
              </button>
            </div>
          )}
          {!detail && (
            <div className="notification-list" aria-busy={loading || busy}>
              {!items.length && !error && (
                <div className="notification-empty">
                  <Bell size={30} />
                  <strong>{loading ? 'Đang tải thông báo…' : 'Bạn chưa có thông báo'}</strong>
                  <p>Bài được giao và lời nhắc mới sẽ xuất hiện tại đây.</p>
                </div>
              )}
              {items.map((item) => {
                const Icon =
                  item.kind === 'ASSIGNMENT'
                    ? BookOpen
                    : item.kind === 'LIVE_EXAM'
                      ? Radio
                      : ShieldCheck
                return (
                  <button
                    type="button"
                    className={`notification-item ${item.readAt ? '' : 'is-unread'}`}
                    key={item.id}
                    disabled={busy}
                    onClick={() => void select(item)}
                  >
                    <span
                      className={`notification-item-icon ${item.classId ? 'classwork' : 'admin'}`}
                    >
                      <Icon size={19} />
                    </span>
                    <span className="notification-copy">
                      <strong>{item.title}</strong>
                      {item.workTitle && (
                        <span className="notification-work-title">{item.workTitle}</span>
                      )}
                      {item.className && (
                        <span>
                          {item.className} · GV {item.teacherName}
                        </span>
                      )}
                      {!item.classId && (
                        <span className="notification-message">{item.message}</span>
                      )}
                      {item.dueAt && (
                        <span
                          className={
                            item.available ? 'notification-deadline' : 'notification-closed'
                          }
                        >
                          {item.available
                            ? `Hạn làm: ${date(item.dueAt)}`
                            : 'Đã đóng hoặc hết hạn làm bài'}
                        </span>
                      )}
                      <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                    </span>
                    <span className="notification-item-end">
                      {!item.readAt && <i aria-label="Chưa đọc" />}
                      <ChevronRight size={16} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {!detail && nextBeforeId && (
            <button
              type="button"
              className="notification-more"
              disabled={loadingMore || loading || busy}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Đang tải…' : 'Xem thông báo cũ hơn'}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
