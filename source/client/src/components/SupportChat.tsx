import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Bot,
  ArrowLeft,
  Info,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import './SupportChat.css'
import './SupportInbox.css'

type Message = {
  id: number
  senderId: number | null
  senderType: 'USER' | 'ADMIN' | 'BOT'
  senderName: string
  body: string
  createdAt: string
}
type Conversation = {
  id: number
  userId: number
  username: string
  displayName: string
  lastMessageId: number
  updatedAt?: string
  status?: Thread['status']
  messages: Message[]
}
type Thread = {
  id: number
  userId: number
  username: string
  displayName: string
  lastMessageId: number
  updatedAt: string
  preview: string
  lastSenderType: string
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
}

function ConversationPanel({ threadId }: { threadId?: number }) {
  const { user } = useAuth(),
    { request, subscribe, connected } = useSystemSocket()
  const [conversation, setConversation] = useState<Conversation | null>(null),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const scroll = useRef<HTMLDivElement>(null),
    alive = useRef(true),
    pending = useRef<{ body: string; key: string } | null>(null)
  const apply = useCallback(
    (next: Conversation) => {
      if (!alive.current || (threadId !== undefined && next.id !== threadId)) return
      setConversation((old) =>
        old && old.id === next.id && old.lastMessageId > next.lastMessageId ? old : next,
      )
    },
    [threadId],
  )
  useEffect(() => {
    alive.current = true
    const off = subscribe((message) => {
      if (message.action === 'SUPPORT_UPDATE') apply(message.payload as Conversation)
    })
    return () => {
      alive.current = false
      off()
      void request('SUPPORT_UNWATCH', 'SUPPORT_DATA').catch(() => {})
    }
  }, [apply, request, subscribe])
  useEffect(() => {
    if (!connected) return
    let active = true
    setError('')
    request<Conversation>('SUPPORT_OPEN', 'SUPPORT_DATA', threadId ? { threadId } : {})
      .then((data) => {
        if (active) apply(data)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [connected, threadId, request, apply])
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [conversation?.lastMessageId])
  async function send(event: FormEvent) {
    event.preventDefault()
    const body = text.trim()
    if (!body || busy || !connected || !conversation) return
    const draft =
      pending.current?.body === body ? pending.current : { body, key: crypto.randomUUID() }
    pending.current = draft
    setBusy(true)
    setError('')
    try {
      const data = await request<Conversation>('SUPPORT_SEND', 'SUPPORT_DATA', {
        threadId: conversation.id,
        body,
        clientMessageId: draft.key,
      })
      if (alive.current) {
        apply(data)
        setText('')
        pending.current = null
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const participant =
    conversation && user?.role === 'ADMIN' ? conversation.displayName : 'Đội ngũ hỗ trợ'
  return (
    <div className="support-conversation">
      <div className="support-connection" role="status">
        <span className={`support-connection-dot ${connected ? 'online' : ''}`} />
        <span>{connected ? 'Realtime ổn định' : 'Đang kết nối lại…'}</span>
        {participant && (
          <>
            <span className="support-connection-separator">·</span>
            <strong>{participant}</strong>
          </>
        )}
      </div>
      <div
        className="support-messages"
        ref={scroll}
        role="log"
        aria-live="polite"
        aria-label="Tin nhắn hỗ trợ"
      >
        {!conversation && !error && <p className="muted">Đang tải hội thoại…</p>}
        {conversation?.messages.map((message) => (
          <article
            key={message.id}
            className={`support-message ${message.senderId === user?.id ? 'mine' : ''} ${message.senderType.toLowerCase()}`}
          >
            <span className="support-message-avatar" aria-hidden="true">
              {message.senderType === 'BOT' ? (
                <Bot size={15} />
              ) : message.senderType === 'ADMIN' ? (
                <ShieldCheck size={15} />
              ) : (
                <UserRound size={15} />
              )}
            </span>
            <div className="support-message-body">
              <div className="support-message-meta">
                <strong>
                  {message.senderType === 'BOT'
                    ? 'Trợ lý tự động'
                    : message.senderType === 'ADMIN'
                      ? `Quản trị viên · ${message.senderName}`
                      : message.senderName}
                </strong>
                <time>
                  {new Date(message.createdAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <p>{message.body}</p>
            </div>
          </article>
        ))}
      </div>
      {error && (
        <p className="support-error" role="alert">
          {error}
        </p>
      )}
      <form className="support-compose" onSubmit={send}>
        <label className="sr-only" htmlFor="support-message-input">
          Nội dung hỗ trợ
        </label>
        <textarea
          id="support-message-input"
          maxLength={1000}
          rows={2}
          disabled={busy}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            user?.role === 'ADMIN' ? 'Nhập phản hồi cho người dùng…' : 'Mô tả sự cố bạn gặp…'
          }
          required
        />
        <button
          className="button primary"
          type="submit"
          disabled={!connected || !conversation || busy || !text.trim()}
          aria-label="Gửi tin nhắn hỗ trợ"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}

function SupportBubble() {
  const { subscribe } = useSystemSocket(),
    [open, setOpen] = useState(false),
    [unread, setUnread] = useState(0)
  const isOpen = useRef(open),
    lastReply = useRef(0),
    trigger = useRef<HTMLButtonElement>(null)
  isOpen.current = open
  useEffect(
    () =>
      subscribe((message) => {
        if (message.action !== 'SUPPORT_NOTIFICATION') return
        const data = message.payload as { lastMessageId: number }
        if (data.lastMessageId <= lastReply.current) return
        lastReply.current = data.lastMessageId
        if (!isOpen.current) setUnread((n) => Math.min(99, n + 1))
      }),
    [subscribe],
  )
  function toggle() {
    setOpen((value) => !value)
    setUnread(0)
  }
  function close() {
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <div className="support-widget">
      {open && (
        <section
          className="support-popup"
          aria-label="Hỗ trợ và báo cáo sự cố"
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
          }}
        >
          <header>
            <div>
              <strong>Hỗ trợ & báo cáo sự cố</strong>
              <small>Trợ lý tự động và quản trị viên</small>
            </div>
            <button
              className="support-close"
              type="button"
              onClick={close}
              aria-label="Đóng chat hỗ trợ"
            >
              <X size={20} />
            </button>
          </header>
          <ConversationPanel />
        </section>
      )}
      <button
        ref={trigger}
        className="support-bubble"
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? 'Thu nhỏ chat hỗ trợ' : 'Mở chat hỗ trợ'}
      >
        <MessageCircle size={25} />
        <span>Hỗ trợ</span>
        {unread > 0 && !open && <b>{unread}</b>}
      </button>
    </div>
  )
}

export function SupportChatWidget() {
  const { user } = useAuth()
  return user && user.role !== 'ADMIN' ? <SupportBubble key={`${user.id}:${user.role}`} /> : null
}

export function SupportInbox() {
  const [showDetails, setShowDetails] = useState(false)
  const { request, subscribe, connected } = useSystemSocket()
  const [threads, setThreads] = useState<Thread[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState<'all' | 'waiting' | 'answered'>('all')
  const reload = useCallback(
    () =>
      request<Thread[]>('SUPPORT_LIST', 'SUPPORT_DATA').then((data) => {
        setThreads(data)
        setError('')
      }),
    [request],
  )
  useEffect(() => {
    if (!connected) return
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      void request<Thread[]>('SUPPORT_LIST', 'SUPPORT_DATA')
        .then((data) => {
          if (active) {
            setThreads(data)
            setError('')
          }
        })
        .catch((e) => {
          if (active) setError(e.message)
        })
    }
    load()
    const off = subscribe((message) => {
      if (message.action === 'SUPPORT_THREAD_CHANGED') {
        clearTimeout(timer)
        timer = setTimeout(load, 200)
      }
    })
    return () => {
      active = false
      off()
      clearTimeout(timer)
    }
  }, [connected, request, subscribe])
  async function updateStatus(threadId: number, status: Thread['status']) {
    try {
      const updated = await request<Conversation>('SUPPORT_STATUS', 'SUPPORT_DATA', {
        threadId,
        status,
      })
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? { ...thread, status, updatedAt: updated.updatedAt || thread.updatedAt }
            : thread,
        ),
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const counts = {
    all: threads.length,
    waiting: threads.filter(
      (thread) => thread.status !== 'CLOSED' && thread.lastSenderType !== 'ADMIN',
    ).length,
    answered: threads.filter(
      (thread) => thread.status === 'CLOSED' || thread.lastSenderType === 'ADMIN',
    ).length,
  }
  const visibleThreads = threads
    .filter((thread) =>
      `${thread.displayName} ${thread.username} ${thread.preview}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    )
    .filter(
      (thread) =>
        filter === 'all' ||
        (filter === 'answered'
          ? thread.status === 'CLOSED' || thread.lastSenderType === 'ADMIN'
          : thread.status !== 'CLOSED' && thread.lastSenderType !== 'ADMIN'),
    )
  const selectedThread = threads.find((thread) => thread.id === selected)
  return (
    <section className="card feature-card support-inbox-panel">
      <div className="support-desk-heading">
        <div>
          <h1>Hỗ trợ người dùng</h1>
          <p className="muted">Theo dõi và phản hồi các yêu cầu từ người dùng.</p>
        </div>
        <div className="support-inbox-header-actions">
          <span className={`support-inbox-status ${connected ? 'online' : ''}`}>
            <span /> {connected ? 'Đang trực tuyến' : 'Đang kết nối lại'}
          </span>
          <button
            className="button secondary"
            disabled={!connected}
            onClick={() => void reload().catch((e) => setError(e.message))}
          >
            <RefreshCw size={15} /> Làm mới
          </button>
        </div>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div
        className={`support-inbox ${selected ? 'has-selection' : ''} ${showDetails && selected ? 'show-details' : ''}`}
      >
        <nav className="support-thread-list" aria-label="Hội thoại hỗ trợ">
          <div className="support-thread-heading">
            <strong>Hội thoại</strong>
            <span>{visibleThreads.length}</span>
          </div>
          <div className="support-thread-search">
            <Search size={16} />
            <input
              aria-label="Tìm hội thoại"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm người dùng hoặc nội dung"
            />
          </div>
          <div className="support-thread-filters" role="tablist" aria-label="Lọc hội thoại">
            {(
              [
                ['all', 'Tất cả'],
                ['waiting', 'Chờ xử lý'],
                ['answered', 'Đã trả lời'],
              ] as const
            ).map(([key, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={filter === key ? 'active' : ''}
                onClick={() => setFilter(key)}
                key={key}
              >
                {label}
                <b>{counts[key]}</b>
              </button>
            ))}
          </div>
          <div className="support-thread-items">
            {visibleThreads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={`support-thread-item ${selected === thread.id ? 'selected' : ''}`}
                aria-pressed={selected === thread.id}
                onClick={() => {
                  setSelected(thread.id)
                  setShowDetails(false)
                }}
              >
                <span className="support-thread-avatar">
                  {thread.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="support-thread-copy">
                  <strong>{thread.displayName}</strong>
                  <p>{thread.preview}</p>
                  <small>
                    <span
                      className={`support-thread-state ${thread.status === 'CLOSED' || thread.lastSenderType === 'ADMIN' ? 'answered' : ''}`}
                    />
                    {thread.status === 'CLOSED'
                      ? 'Đã đóng'
                      : thread.status === 'IN_PROGRESS'
                        ? 'Đang xử lý'
                        : thread.lastSenderType === 'ADMIN'
                          ? 'Đã trả lời'
                          : 'Chờ xử lý'}{' '}
                    ·{' '}
                    {new Date(thread.updatedAt).toLocaleDateString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                    })}{' '}
                    {new Date(thread.updatedAt).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </span>
              </button>
            ))}
            {!threads.length && <p className="muted">Chưa có hội thoại hỗ trợ.</p>}
            {threads.length > 0 && !visibleThreads.length && (
              <p className="support-empty-list">Không tìm thấy hội thoại phù hợp.</p>
            )}
          </div>
        </nav>
        <div className="support-inbox-chat">
          {selectedThread && (
            <header className="support-chat-toolbar">
              <button
                type="button"
                className="support-inbox-back"
                aria-label="Quay lại danh sách hội thoại"
                onClick={() => {
                  setSelected(null)
                  setShowDetails(false)
                }}
              >
                <ArrowLeft size={20} />
              </button>
              <span className="support-thread-avatar">
                {selectedThread.displayName.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{selectedThread.displayName}</strong>
                <small>
                  @{selectedThread.username} · Hội thoại #{selectedThread.id}
                </small>
              </div>
              <button
                type="button"
                className={`support-details-toggle ${showDetails ? 'active' : ''}`}
                aria-label="Thông tin hội thoại"
                aria-expanded={showDetails}
                aria-controls="support-conversation-details"
                onClick={() => setShowDetails((value) => !value)}
              >
                <Info size={20} />
              </button>
            </header>
          )}
          {selected ? (
            <ConversationPanel key={selected} threadId={selected} />
          ) : (
            <p className="support-empty">
              <MessageCircle size={28} />
              <strong>Chọn một yêu cầu hỗ trợ</strong>
              <span>Chọn hội thoại bên trái để xem lịch sử và trả lời.</span>
            </p>
          )}
        </div>
        <aside
          className="support-user-panel"
          id="support-conversation-details"
          aria-label="Thông tin hội thoại"
          hidden={!showDetails || !selected}
        >
          <div className="support-details-heading">
            <strong>Thông tin hội thoại</strong>
            <button
              type="button"
              aria-label="Đóng thông tin hội thoại"
              onClick={() => setShowDetails(false)}
            >
              <X size={18} />
            </button>
          </div>
          {selectedThread ? (
            <>
              <div className="support-user-profile">
                <span className="support-user-avatar">
                  {selectedThread.displayName.slice(0, 1).toUpperCase()}
                </span>
                <strong>{selectedThread.displayName}</strong>
                <small>{selectedThread.username}</small>
              </div>
              <div className="support-user-section">
                <small>THÔNG TIN HỘI THOẠI</small>
                <dl>
                  <dt>Mã hội thoại</dt>
                  <dd>#{selectedThread.id}</dd>
                  <dt>Hoạt động gần nhất</dt>
                  <dd>{new Date(selectedThread.updatedAt).toLocaleString('vi-VN')}</dd>
                  <dt>Trạng thái hiện tại</dt>
                  <dd>
                    <select
                      className="support-status-select"
                      aria-label="Trạng thái hội thoại"
                      disabled={!connected}
                      value={selectedThread.status}
                      onChange={(event) =>
                        void updateStatus(selectedThread.id, event.target.value as Thread['status'])
                      }
                    >
                      <option value="OPEN">Chờ xử lý</option>
                      <option value="IN_PROGRESS">Đang xử lý</option>
                      <option value="CLOSED">Đã đóng</option>
                    </select>
                  </dd>
                </dl>
              </div>
            </>
          ) : (
            <div className="support-user-empty">
              <UserRound size={26} />
              <span>Thông tin người dùng</span>
              <small>Chọn một hội thoại để xem chi tiết.</small>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
