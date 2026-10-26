import { Award, CheckCircle2, Clock3, Crown, Flame, Gem, Lock, MessageCircle, Send, Shield, Sparkles, Swords, Target, Trophy, UsersRound, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import { Layout } from '../components/Layout'
import type { ArenaHistory, ArenaMessage, ArenaRoom, PvpCosmeticItem, PvpCosmeticsResponse, PvpLeaderboardResponse } from '../types'

type QueueState = {
  status: 'IDLE' | 'WAITING' | 'MATCHED' | 'ERROR';
  level?: number;
  elo?: number;
  rankTier?: string;
  rankTitle?: string;
  queuedAt?: number;
  allowedGap?: number;
  allowedEloGap?: number;
  room?: ArenaRoom;
  message?: string;
  declineCount?: number;
  maxDeclines?: number;
  banUntil?: string | null;
  banRemainingSeconds?: number;
}

const FRAME_CLASS_MAP: Record<string, string> = {
  FRAME_DEFAULT: 'frame-default',
  FRAME_BRONZE: 'frame-bronze',
  FRAME_SILVER: 'frame-silver',
  FRAME_GOLD: 'frame-gold',
  FRAME_PLATINUM: 'frame-platinum',
  FRAME_DIAMOND: 'frame-diamond',
  FRAME_MASTER: 'frame-master',
  FRAME_STREAK_5: 'frame-streak'
}

const BADGE_LABEL_MAP: Record<string, { label: string; css: string }> = {
  BADGE_BRONZE: { label: 'Tân Binh Đấu Trường', css: 'badge-bronze' },
  BADGE_FIRST_WIN: { label: 'Chiến Thắng Đầu Tiên', css: 'badge-first-win' },
  BADGE_STREAK_3: { label: 'Chuỗi Thắng Bất Bại', css: 'badge-streak-3' },
  BADGE_VETERAN_5: { label: 'Chiến Binh Chuyên Cần', css: 'badge-veteran' },
  BADGE_GLADIATOR_10: { label: 'Đấu Sĩ Không Gian', css: 'badge-gladiator' },
  BADGE_SILVER: { label: 'Chiến Binh Bạc', css: 'badge-silver' },
  BADGE_GOLD: { label: 'Kỵ Sĩ Vàng', css: 'badge-gold' },
  BADGE_PLATINUM: { label: 'Thủ Lĩnh Bạch Kim', css: 'badge-platinum' },
  BADGE_DIAMOND: { label: 'Bá Chủ Kim Cương', css: 'badge-diamond' },
  BADGE_MASTER: { label: 'Huyền Thoại Cao Thủ', css: 'badge-master' }
}

const RANK_TIER_META: Record<string, { title: string; colorClass: string; range: string }> = {
  BRONZE: { title: 'Đồng', colorClass: 'rank-bronze', range: '< 1.100 ELO' },
  SILVER: { title: 'Bạc', colorClass: 'rank-silver', range: '1.100 – 1.299 ELO' },
  GOLD: { title: 'Vàng', colorClass: 'rank-gold', range: '1.300 – 1.499 ELO' },
  PLATINUM: { title: 'Bạch Kim', colorClass: 'rank-platinum', range: '1.500 – 1.699 ELO' },
  DIAMOND: { title: 'Kim Cương', colorClass: 'rank-diamond', range: '1.700 – 1.999 ELO' },
  MASTER: { title: 'Cao Thủ', colorClass: 'rank-master', range: '≥ 2.000 ELO' }
}

function CosmeticIcon({ name, size = 18 }: { name?: string; size?: number }) {
  switch (name) {
    case 'Crown': return <Crown size={size} />
    case 'Sparkles': return <Sparkles size={size} />
    case 'Gem': return <Gem size={size} />
    case 'Flame': return <Flame size={size} />
    case 'Swords': return <Swords size={size} />
    case 'Target': return <Target size={size} />
    case 'Trophy': return <Trophy size={size} />
    case 'Shield': return <Shield size={size} />
    default: return <Award size={size} />
  }
}

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`
}

function resultReasonLabel(resultType?: string | null) {
  switch (resultType) {
    case 'SCORE': return 'Phân định thắng thua theo tổng điểm câu hỏi trong trận'
    case 'SPEED_TIEBREAKER': return 'Bằng điểm câu hỏi · Phân định thắng thua bằng tổng thời gian trả lời đúng nhanh hơn'
    case 'DRAW': return 'Hòa điểm câu hỏi và thời gian thi đấu'
    case 'MATCH_TIME_LIMIT': return 'Hết giới hạn thời gian toàn trận · Tính kết quả theo điểm số hiện tại'
    case 'FORFEIT': return 'Đối thủ chủ động rời trận đấu (xử thua)'
    case 'TIMEOUT_FORFEIT': return 'Mất kết nối quá 30 giây không quay lại (xử thua)'
    default: return 'Hoàn thành trận đấu PvP'
  }
}

export function ArenaPage() {
  const { request, subscribe, connected } = useSystemSocket()
  const { user, setUser } = useAuth()
  const [activeTab, setActiveTab] = useState<'arena' | 'leaderboard' | 'cosmetics'>('arena')
  const [rankFilter, setRankFilter] = useState<string>('ALL')
  const [queue, setQueue] = useState<QueueState>({ status: 'IDLE' })
  const [queueNow, setQueueNow] = useState(Date.now())
  const queueWaiting = queue.status === 'WAITING'
  const [room, setRoom] = useState<ArenaRoom | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<ArenaMessage[] | null>(null)
  const [chatText, setChatText] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [history, setHistory] = useState<ArenaHistory[]>([])
  const [leaderboard, setLeaderboard] = useState<PvpLeaderboardResponse | null>(null)
  const [cosmetics, setCosmetics] = useState<PvpCosmeticsResponse | null>(null)
  const [notice, setNotice] = useState('')
  const chatList = useRef<HTMLDivElement>(null)
  const roomRef = useRef(room)
  roomRef.current = room

  function refreshArenaMeta() {
    if (!connected) return
    request<PvpLeaderboardResponse>('ARENA_LEADERBOARD', 'ARENA_DATA').then(data => {
      if (data && 'leaders' in data) setLeaderboard(data)
    }).catch(() => {})
    request<PvpCosmeticsResponse>('ARENA_COSMETICS', 'ARENA_DATA').then(data => {
      if (data && 'items' in data) setCosmetics(data)
    }).catch(() => {})
  }

  useEffect(() => subscribe(message => {
    if (message.action === 'ARENA_ROOM_UPDATE') {
      const next = message.payload as ArenaRoom
      setRoom(current => current?.id === next.id && current.stateVersion <= next.stateVersion ? next : current)
      if (next.status === 'CANCELLED' && next.cancelReason === 'DECLINED') {
        setError('Trận đấu đã bị hủy do có người chơi từ chối xác nhận tham gia.')
        request<QueueState>('QUEUE_STATUS', 'MATCHMAKING_UPDATE').then(setQueue).catch(() => {})
      } else if (next.status === 'CANCELLED' && next.cancelReason === 'CONFIRM_TIMEOUT') {
        setError('Hết thời gian 15 giây xác nhận tham gia trận đấu. Trận đấu đã bị hủy.')
        request<QueueState>('QUEUE_STATUS', 'MATCHMAKING_UPDATE').then(setQueue).catch(() => {})
      }
      return
    }
    if (message.action === 'ARENA_MESSAGES_UPDATE') {
      const update = message.payload as { roomId: number; messages: ArenaMessage[] }
      if (roomRef.current?.id === update.roomId) setMessages(update.messages)
      return
    }
    if (message.action === 'ARENA_ERROR') {
      setError((message.payload as { message: string }).message)
      return
    }
    if (message.action !== 'MATCHMAKING_UPDATE') return
    const update = message.payload as QueueState
    if (!update || !['IDLE', 'WAITING', 'MATCHED', 'ERROR'].includes(update.status)) return
    setQueue(update)
    if (update.status === 'ERROR') setError(update.message || 'Không thể tìm trận')
    if (update.status === 'MATCHED' && update.room) {
      setRoom(update.room)
      setNotice(update.room.status === 'CONFIRMING'
        ? 'Đã tìm thấy đối thủ phù hợp! Vui lòng xác nhận tham gia trận đấu trong 15 giây.'
        : 'Đã tìm thấy đối thủ phù hợp. Trận đấu bắt đầu!')
      request('QUEUE_CANCEL', 'MATCHMAKING_UPDATE').catch(() => {})
    }
  }), [subscribe, request])

  useEffect(() => {
    if (!connected) { setQueue({ status: 'IDLE' }); return }
    request<QueueState>('QUEUE_STATUS', 'MATCHMAKING_UPDATE').then(setQueue).catch(() => {})
  }, [connected, request])

  // Đồng hồ hiển thị tại client; không gửi bất kỳ request polling nào.
  useEffect(() => {
    const timer = setInterval(() => setQueueNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function findMatch() {
    setBusy(true); setError(''); setNotice('')
    try { setQueue(await request<QueueState>('QUEUE_JOIN', 'MATCHMAKING_UPDATE')) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  async function cancelMatch() {
    setBusy(true)
    try { setQueue(await request<QueueState>('QUEUE_CANCEL', 'MATCHMAKING_UPDATE')) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  useEffect(() => () => {
    request('QUEUE_CANCEL', 'MATCHMAKING_UPDATE').catch(() => {})
    request('ARENA_UNWATCH', 'ARENA_DATA').catch(() => {})
  }, [request])

  useEffect(() => {
    request('CLIENT_ACTIVITY', 'ACTIVITY_UPDATED', { path: '/arena' }).catch(() => {})
  }, [request, room?.id, room?.status])

  useEffect(() => {
    if (!connected) return
    let active = true
    request<ArenaRoom | Record<string, never>>('ARENA_OPEN', 'ARENA_DATA', roomRef.current ? { roomId: roomRef.current.id } : {})
      .then(data => { if (active && data && 'id' in data) setRoom(data as ArenaRoom) })
      .catch(e => { if (active) setError(e.message) })
    request<ArenaHistory[]>('ARENA_HISTORY', 'ARENA_DATA')
      .then(data => { if (active && Array.isArray(data)) setHistory(data) })
      .catch(e => { if (active) setError(e.message) })
    refreshArenaMeta()
    return () => { active = false }
  }, [connected, request])

  useEffect(() => {
    if (!connected || !room?.id) return
    let active = true
    setMessages(null)
    request<ArenaRoom>('ARENA_OPEN', 'ARENA_DATA', { roomId: room.id })
      .then(next => { if (active && next && 'id' in next) setRoom(current => current?.id === next.id && current.stateVersion <= next.stateVersion ? next : current) })
      .catch(e => { if (active) setError(e.message) })
    if (['WAITING', 'IN_PROGRESS'].includes(room.status)) {
      request<ArenaMessage[]>('ARENA_MESSAGES', 'ARENA_DATA', { roomId: room.id })
        .then(data => { if (active && Array.isArray(data)) setMessages(data) })
        .catch(e => { if (active) setError(e.message) })
    }
    return () => { active = false }
  }, [connected, room?.id, room?.status, request])

  useEffect(() => {
    if (room?.status === 'FINISHED' || room?.status === 'CANCELLED') {
      request<ArenaHistory[]>('ARENA_HISTORY', 'ARENA_DATA').then(data => { if (Array.isArray(data)) setHistory(data) }).catch(e => setError(e.message))
      request<QueueState>('QUEUE_STATUS', 'MATCHMAKING_UPDATE').then(setQueue).catch(() => {})
      refreshArenaMeta()
    }
  }, [room?.status, request])

  useEffect(() => {
    if (chatList.current) chatList.current.scrollTop = chatList.current.scrollHeight
  }, [messages?.at(-1)?.id])

  async function act(body: Record<string, unknown>) {
    setBusy(true); setError('')
    const { action, ...payload } = body
    try {
      const next = await request<ArenaRoom>(`ARENA_${action}`, 'ARENA_DATA', payload)
      setRoom(current => current?.id === next.id && current.stateVersion > next.stateVersion ? current : next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmMatch() {
    if (!room) return
    setBusy(true); setError(''); setNotice('')
    try {
      const next = await request<ArenaRoom>('ARENA_CONFIRM', 'ARENA_DATA', { roomId: room.id })
      setRoom(next)
      setNotice(next.status === 'IN_PROGRESS' ? 'Cả hai đã xác nhận! Đếm ngược bắt đầu trận đấu...' : 'Đã xác nhận tham gia! Đang chờ đối thủ xác nhận...')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function declineMatch() {
    if (!room) return
    setBusy(true); setError(''); setNotice('')
    try {
      await request<ArenaRoom>('ARENA_DECLINE', 'ARENA_DATA', { roomId: room.id })
      setRoom(null)
      setMessages(null)
      const q = await request<QueueState>('QUEUE_STATUS', 'MATCHMAKING_UPDATE')
      setQueue(q)
      refreshArenaMeta()
      setError('Bạn đã từ chối xác nhận trận đấu. Lưu ý: Từ chối 3 lần sẽ bị cấm ghép trận tạm thời 5 phút.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function equipCosmetic(item: PvpCosmeticItem) {
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await request<PvpCosmeticsResponse>('ARENA_EQUIP_COSMETIC', 'ARENA_DATA', { code: item.code })
      if (res && 'items' in res) {
        setCosmetics(res)
        if (res.profile) setUser(res.profile)
        setNotice(`Đã trang bị ${item.type === 'FRAME' ? 'khung avatar' : 'huy hiệu'} "${item.name}"!`)
        refreshArenaMeta()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function join(e: FormEvent) { e.preventDefault(); await act({ action: 'JOIN', code }) }
  async function leaveWaiting() {
    if (!room) return
    setBusy(true); setError('')
    try { await request('ARENA_LEAVE', 'ARENA_DATA', { roomId: room.id }); setRoom(null); setMessages(null) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    if (!room || !chatText.trim()) return
    setChatBusy(true); setError('')
    try { await request('ARENA_CHAT', 'ARENA_DATA', { roomId: room.id, body: chatText }); setChatText('') }
    catch (e) { setError((e as Error).message) }
    finally { setChatBusy(false) }
  }
  async function reportMessage(messageId: number) {
    if (!room) return
    const reason = window.prompt('Lý do báo cáo tin nhắn (tối đa 500 ký tự):')
    if (!reason?.trim()) return
    setError('')
    try { await request('ARENA_REPORT', 'ARENA_DATA', { roomId: room.id, messageId, reason }); setNotice('Đã gửi báo cáo cho quản trị viên.') }
    catch (e) { setError((e as Error).message) }
  }
  async function reportOpponent() {
    if (!room) return
    const targetId = room.isHost ? room.guestId : room.hostId
    if (!targetId) return
    const reason = window.prompt('Lý do báo cáo đối thủ (tối đa 500 ký tự):')
    if (!reason?.trim()) return
    try { await request('REPORT_USER', 'REPORT_DATA', { targetId, contextType: 'ARENA', contextId: room.id, reason }); setNotice('Đã gửi báo cáo đối thủ cho quản trị viên.') }
    catch (e) { setError((e as Error).message) }
  }

  const seconds = room?.deadlineAt ? Math.max(0, Math.ceil((new Date(room.deadlineAt).getTime() - queueNow) / 1000)) : 0
  const confirmSeconds = room?.confirmDeadlineAt ? Math.max(0, Math.ceil((new Date(room.confirmDeadlineAt).getTime() - queueNow) / 1000)) : 0
  const countdownSeconds = room?.countdownUntil ? Math.max(0, Math.ceil((new Date(room.countdownUntil).getTime() - queueNow) / 1000)) : 0
  const matchSeconds = room?.matchDeadlineAt ? Math.max(0, Math.ceil((new Date(room.matchDeadlineAt).getTime() - queueNow) / 1000)) : 0

  const banUntilTime = queue.banUntil || leaderboard?.myStats?.banUntil || null
  const banSecondsLeft = banUntilTime ? Math.max(0, Math.ceil((new Date(banUntilTime).getTime() - queueNow) / 1000)) : 0
  const declineCount = queue.declineCount ?? leaderboard?.myStats?.declineCount ?? 0
  const maxDeclines = queue.maxDeclines ?? leaderboard?.myStats?.maxDeclines ?? 3

  const myElo = leaderboard?.myStats?.elo ?? queue.elo ?? user?.pvpElo ?? 1000
  const myRankTier = leaderboard?.myStats?.rankTier ?? queue.rankTier ?? user?.pvpRankTier ?? 'BRONZE'
  const myRankTitle = leaderboard?.myStats?.rankTitle ?? queue.rankTitle ?? user?.pvpRankTitle ?? 'Đồng'
  const myFrame = cosmetics?.equippedFrame ?? leaderboard?.myStats?.equippedFrame ?? user?.equippedFrame ?? 'FRAME_DEFAULT'
  const myBadge = cosmetics?.equippedBadge ?? leaderboard?.myStats?.equippedBadge ?? user?.equippedBadge ?? 'BADGE_BRONZE'

  const myReady = room && (room.isHost ? room.hostReady : room.guestReady)
  const opponentReady = room && (room.isHost ? room.guestReady : room.hostReady)
  const canChat = room && ['WAITING', 'IN_PROGRESS'].includes(room.status)

  const chat = room && canChat && (
    <section className="card feature-card arena-chat">
      <h2><MessageCircle size={21} /> Chat phòng đấu</h2>
      <div className="arena-chat-list" ref={chatList} role="log" aria-label="Lịch sử chat phòng đấu">
        {messages === null ? <p className="muted">Đang tải tin nhắn...</p> : messages.length ? messages.map(m => (
          <div className={`arena-chat-message ${m.userId === user?.id ? 'mine' : ''}`} key={m.id}>
            <div>
              <strong>{m.displayName}</strong>
              <time>{new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
            <p>{m.body}</p>
            {m.userId !== user?.id && <button className="text-button" onClick={() => reportMessage(m.id)}>Báo cáo</button>}
          </div>
        )) : <p className="muted">Chưa có tin nhắn. Hãy chào đối thủ!</p>}
      </div>
      <form className="arena-chat-form" onSubmit={sendMessage}>
        <input aria-label="Tin nhắn phòng đấu" required maxLength={1000} value={chatText} onChange={e => setChatText(e.target.value)} placeholder="Nhắn cho đối thủ..." />
        <button className="button primary" disabled={chatBusy || !chatText.trim()} aria-label="Gửi tin nhắn"><Send size={18} /></button>
      </form>
    </section>
  )

  const filteredLeaders = leaderboard?.leaders.filter(l => rankFilter === 'ALL' || l.rankTier === rankFilter) || []

  return (
    <Layout title="Đấu trường">
      <div className="page-heading">
        <div>
          <span className="section-label">THỬ THÁCH HAI NGƯỜI · XẾP HẠNG ELO</span>
          <h1>Đấu trường PvP</h1>
          <p>Hai người chơi cùng 10 câu hỏi (20 giây/câu, giới hạn 3 phút/trận). Bằng số câu đúng sẽ hòa. Phòng tự tạo là giao hữu, không đổi ELO; ghép tự động là xếp hạng; điểm ELO đánh giá trình độ &amp; xếp hạng PvP (không cộng EXP học tập).</p>
        </div>
        <div className="heading-icon"><Swords /></div>
      </div>

      {/* Thanh thông tin ELO, Phân hạng, Khung Avatar & Huy hiệu cá nhân */}
      <section className="card pvp-profile-strip" aria-label="Thông tin xếp hạng PvP của bạn">
        <div className="pvp-strip-user">
          <div className={`pvp-avatar ${FRAME_CLASS_MAP[myFrame] || 'frame-default'}`}>
            <span>{user?.displayName.slice(0, 1).toUpperCase()}</span>
          </div>
          <div>
            <div className="pvp-strip-name-row">
              <strong>{user?.displayName}</strong>
              <span className={`pvp-rank-pill ${RANK_TIER_META[myRankTier]?.colorClass || 'rank-bronze'}`}>
                <Trophy size={14} /> Hạng {myRankTitle} ({myElo} ELO)
              </span>
              {myBadge && BADGE_LABEL_MAP[myBadge] && (
                <span className={`pvp-badge-pill ${BADGE_LABEL_MAP[myBadge].css}`}>
                  <Award size={13} /> {BADGE_LABEL_MAP[myBadge].label}
                </span>
              )}
            </div>
            <small className="muted">
              Thắng {leaderboard?.myStats?.wins ?? user?.pvpWins ?? 0} · Thua {leaderboard?.myStats?.losses ?? user?.pvpLosses ?? 0} · Hòa {leaderboard?.myStats?.draws ?? user?.pvpDraws ?? 0}
              {leaderboard?.myStats?.rank ? ` · Hạng #${leaderboard.myStats.rank} toàn máy chủ` : ''}
              {' · '}Điểm trận đấu tách biệt với điểm ELO và không cộng EXP học tập
            </small>
          </div>
        </div>
        {!room && (
          <div className="pvp-tab-pills" role="tablist" aria-label="Chế độ xem Đấu trường">
            <button role="tab" aria-selected={activeTab === 'arena'} className={`pvp-tab-btn ${activeTab === 'arena' ? 'active' : ''}`} onClick={() => setActiveTab('arena')}>
              <Swords size={16} /> Thi đấu
            </button>
            <button role="tab" aria-selected={activeTab === 'leaderboard'} className={`pvp-tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => { setActiveTab('leaderboard'); refreshArenaMeta() }}>
              <Trophy size={16} /> Bảng xếp hạng ELO
            </button>
            <button role="tab" aria-selected={activeTab === 'cosmetics'} className={`pvp-tab-btn ${activeTab === 'cosmetics' ? 'active' : ''}`} onClick={() => { setActiveTab('cosmetics'); refreshArenaMeta() }}>
              <Sparkles size={16} /> Khung &amp; Huy hiệu
            </button>
          </div>
        )}
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="success-banner" role="status">{notice}</div>}
      {room?.guestId && <button className="text-button" disabled={!connected} onClick={reportOpponent}>Báo cáo đối thủ</button>}

      {!room && activeTab === 'leaderboard' && (
        <div className="pvp-subview">
          <section className="card feature-card">
            <div className="panel-heading">
              <div>
                <h2><Crown size={21} /> Các bậc Phân hạng ELO Đấu trường</h2>
                <p className="muted">Điểm ELO được cập nhật sau mỗi trận đấu dựa trên kết quả Thắng/Thua/Hòa và chênh lệch ELO với đối thủ.</p>
              </div>
            </div>
            <div className="pvp-tiers-grid">
              {(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER'] as const).map(code => {
                const meta = RANK_TIER_META[code]
                const isCurrent = myRankTier === code
                return (
                  <div key={code} className={`pvp-tier-card ${meta.colorClass} ${isCurrent ? 'current' : ''}`}>
                    <div className="pvp-tier-header">
                      <strong>Hạng {meta.title}</strong>
                      {isCurrent && <span className="tag">Hạng hiện tại</span>}
                    </div>
                    <span>{meta.range}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="card feature-card">
            <div className="panel-heading">
              <div>
                <h2><Trophy size={21} /> Bảng xếp hạng Đấu sĩ theo ELO</h2>
                <p className="muted">Top 50 học viên có điểm ELO PvP cao nhất hệ thống.</p>
              </div>
              <div className="button-row">
                {(['ALL', 'MASTER', 'DIAMOND', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE'] as const).map(tier => (
                  <button
                    key={tier}
                    className={`button ${rankFilter === tier ? 'primary' : 'secondary'} pvp-filter-btn`}
                    onClick={() => setRankFilter(tier)}
                  >
                    {tier === 'ALL' ? 'Tất cả' : RANK_TIER_META[tier].title}
                  </button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hạng</th>
                    <th>Đấu sĩ</th>
                    <th>Phân hạng</th>
                    <th>Điểm ELO (Đỉnh)</th>
                    <th>Thắng / Thua / Hòa</th>
                    <th>Tỷ lệ thắng</th>
                    <th>Chuỗi thắng</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaders.map(entry => (
                    <tr key={entry.userId} className={entry.userId === user?.id ? 'pvp-my-row' : ''}>
                      <td><strong>#{entry.rank}</strong></td>
                      <td>
                        <div className="pvp-leader-cell">
                          <div className={`pvp-avatar sm ${FRAME_CLASS_MAP[entry.equippedFrame] || 'frame-default'}`}>
                            <span>{entry.displayName.slice(0, 1).toUpperCase()}</span>
                          </div>
                          <div>
                            <strong>{entry.displayName} {entry.userId === user?.id && '(Bạn)'}</strong>
                            {entry.equippedBadge && BADGE_LABEL_MAP[entry.equippedBadge] && (
                              <span className={`pvp-badge-pill sm ${BADGE_LABEL_MAP[entry.equippedBadge].css}`}>
                                {BADGE_LABEL_MAP[entry.equippedBadge].label}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`pvp-rank-pill ${entry.rankColorClass}`}>
                          {entry.rankTitle}
                        </span>
                      </td>
                      <td>
                        <strong>{entry.elo} ELO</strong>
                        <small>Cao nhất: {entry.peakElo}</small>
                      </td>
                      <td>{entry.wins}W – {entry.losses}L – {entry.draws}D</td>
                      <td>{entry.winRate}% ({entry.totalMatches} trận)</td>
                      <td>🔥 {entry.winStreak} (Kỷ lục: {entry.bestWinStreak})</td>
                    </tr>
                  ))}
                  {filteredLeaders.length === 0 && (
                    <tr><td colSpan={7} className="muted">Chưa có người chơi ở phân hạng này.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {!room && activeTab === 'cosmetics' && (
        <div className="pvp-subview">
          <section className="card feature-card">
            <h2><Shield size={21} /> Khung Avatar Đấu Trường (Avatar Frames)</h2>
            <p className="muted">Mở khóa khung avatar đặc biệt khi đạt mốc phân hạng ELO hoặc chuỗi thắng liên tiếp.</p>
            <div className="pvp-cosmetics-grid">
              {(cosmetics?.items.filter(i => i.type === 'FRAME') || []).map(item => (
                <div key={item.code} className={`pvp-cosmetic-card ${item.unlocked ? 'unlocked' : 'locked'} ${item.equipped ? 'equipped' : ''}`}>
                  <div className="pvp-cosmetic-preview">
                    <div className={`pvp-avatar lg ${item.cssClass}`}>
                      <span>{user?.displayName.slice(0, 1).toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="pvp-cosmetic-body">
                    <strong>{item.name}</strong>
                    <p className="muted">{item.description}</p>
                    {!item.unlocked && (
                      <div className="pvp-cosmetic-progress">
                        <div className="progress-track">
                          <div style={{ width: `${Math.min(100, Math.round((item.currentProgress / Math.max(1, item.unlockThreshold)) * 100))}%` }} />
                        </div>
                        <small><Lock size={12} /> Tiến độ: {item.currentProgress}/{item.unlockThreshold}</small>
                      </div>
                    )}
                    {item.unlocked && (
                      <button
                        className={`button ${item.equipped ? 'secondary' : 'primary'} full`}
                        disabled={busy || item.equipped}
                        onClick={() => equipCosmetic(item)}
                      >
                        {item.equipped ? '✓ Đang trang bị' : 'Trang bị khung'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card feature-card">
            <h2><Award size={21} /> Huy Hiệu Vinh Quang (PvP Badges)</h2>
            <p className="muted">Huy hiệu danh giá hiển thị cạnh tên của bạn trên bảng xếp hạng và trong trận đấu.</p>
            <div className="pvp-cosmetics-grid">
              {(cosmetics?.items.filter(i => i.type === 'BADGE') || []).map(item => (
                <div key={item.code} className={`pvp-cosmetic-card ${item.unlocked ? 'unlocked' : 'locked'} ${item.equipped ? 'equipped' : ''}`}>
                  <div className="pvp-cosmetic-preview">
                    <span className={`pvp-badge-showcase ${item.cssClass}`}>
                      <CosmeticIcon name={item.icon} size={26} />
                    </span>
                  </div>
                  <div className="pvp-cosmetic-body">
                    <strong>{item.name}</strong>
                    <p className="muted">{item.description}</p>
                    {!item.unlocked && (
                      <div className="pvp-cosmetic-progress">
                        <div className="progress-track">
                          <div style={{ width: `${Math.min(100, Math.round((item.currentProgress / Math.max(1, item.unlockThreshold)) * 100))}%` }} />
                        </div>
                        <small><Lock size={12} /> Tiến độ: {item.currentProgress}/{item.unlockThreshold}</small>
                      </div>
                    )}
                    {item.unlocked && (
                      <button
                        className={`button ${item.equipped ? 'secondary' : 'primary'} full`}
                        disabled={busy || item.equipped}
                        onClick={() => equipCosmetic(item)}
                      >
                        {item.equipped ? '✓ Đang trang bị' : 'Trang bị huy hiệu'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {!room && activeTab === 'arena' && (
        <>
          <section className="card feature-card matchmaking-card">
            <div className="card-icon purple"><Swords /></div>
            <h2>Tìm và ghép đối thủ cùng trình độ</h2>
            <p>
              Cấp tài khoản: <strong>{queue.level ?? user?.level}</strong> · Điểm ELO: <strong>{myElo} ({myRankTitle})</strong>.
              Ghép trận xếp hạng theo ELO: ban đầu ±150, sau 15 giây ±300, sau 30 giây ±600. Cấp tài khoản không giới hạn đối thủ.
            </p>

            {banSecondsLeft > 0 && (
              <div className="error-banner pvp-ban-banner" role="alert">
                <strong>⛔ Tạm khóa ghép trận tự động ({formatDuration(banSecondsLeft)})</strong>
                <p>Bạn đã từ chối hoặc bỏ lỡ xác nhận trận đấu {maxDeclines}/{maxDeclines} lần liên tiếp. Vui lòng chờ hết thời gian phạt để tìm trận mới.</p>
              </div>
            )}

            {banSecondsLeft === 0 && declineCount > 0 && (
              <p className="pvp-decline-warning">
                ⚠️ Số lần từ chối xác nhận trận gần đây: <strong>{declineCount}/{maxDeclines}</strong> (Từ chối đủ {maxDeclines} lần sẽ bị cấm ghép trận tạm thời 5 phút).
              </p>
            )}

            {queueWaiting ? (
              <>
                <p className="tag" role="status">
                  Đang tìm trận · {Math.max(0, Math.floor((queueNow - (queue.queuedAt || queueNow)) / 1000))} giây · Chênh lệch tối đa ±{queue.allowedEloGap ?? 150} ELO
                </p>
                <p className="muted">Bạn có thể hủy bất cứ lúc nào. Khi tìm thấy đối thủ, cả hai người chơi sẽ có 15 giây để xác nhận tham gia trận đấu.</p>
                <button className="button secondary" disabled={busy} onClick={cancelMatch}>Hủy tìm trận</button>
              </>
            ) : (
              <button className="button primary" disabled={busy || !connected || banSecondsLeft > 0} onClick={findMatch}>
                {banSecondsLeft > 0 ? `Bị cấm ghép trận (${formatDuration(banSecondsLeft)})` : 'Tìm trận PvP'}
              </button>
            )}
          </section>

          <h2 className="section-heading">Hoặc đấu riêng bằng mã phòng</h2>
          <div className="feature-grid">
            <section className="card feature-card">
              <div className="card-icon purple"><Swords /></div>
              <h2>Tạo phòng đấu</h2>
              <p className="muted">Chia sẻ mã phòng cho người chơi thứ hai.</p>
              <button className="button primary" disabled={busy || queueWaiting} onClick={() => act({ action: 'CREATE' })}>Tạo phòng</button>
            </section>
            <section className="card feature-card">
              <div className="card-icon mint"><UsersRound /></div>
              <h2>Vào phòng</h2>
              <form className="inline-form" onSubmit={join}>
                <input aria-label="Mã phòng" required maxLength={12} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Nhập mã phòng" />
                <button className="button primary" disabled={busy || queueWaiting}>Tham gia</button>
              </form>
            </section>
          </div>
        </>
      )}

      {room && (
        <>
          <section className="card arena-banner">
            <div>
              <span className="section-label">PHÒNG {room.code}</span>
              <h2>
                {room.status === 'CONFIRMING' ? 'Xác nhận tham gia trận đấu'
                  : room.status === 'WAITING' ? 'Đang chờ người chơi'
                  : room.status === 'IN_PROGRESS' ? `Vòng ${room.currentRound}/${room.questionLimit}`
                  : room.status === 'CANCELLED' ? 'Phòng đã hủy'
                  : 'Trận đấu kết thúc'}
              </h2>
            </div>
            <div className="arena-score">
              <div className="arena-player-box">
                <div className={`pvp-avatar sm ${FRAME_CLASS_MAP[room.hostFrame || 'FRAME_DEFAULT'] || 'frame-default'}`}>
                  <span>{room.hostName?.slice(0, 1).toUpperCase()}</span>
                </div>
                <strong>{room.hostName}</strong>
                <small className="muted">{room.hostRankTitle || 'Đồng'} · {room.hostElo ?? room.hostEloBefore ?? 1000} ELO</small>
                <span>{room.hostScore} điểm</span>
              </div>
              <Swords />
              <div className="arena-player-box">
                <div className={`pvp-avatar sm ${FRAME_CLASS_MAP[room.guestFrame || 'FRAME_DEFAULT'] || 'frame-default'}`}>
                  <span>{(room.guestName || '?').slice(0, 1).toUpperCase()}</span>
                </div>
                <strong>{room.guestName || 'Chờ đối thủ'}</strong>
                <small className="muted">{room.guestId ? `${room.guestRankTitle || 'Đồng'} · ${room.guestElo ?? room.guestEloBefore ?? 1000} ELO` : 'Đang chờ'}</small>
                <span>{room.guestScore} điểm</span>
              </div>
            </div>
          </section>

          {/* Giai đoạn 2: Xác nhận tham gia trận đấu (Match Confirmation) */}
          {room.status === 'CONFIRMING' && (
            <section className="card feature-card pvp-confirm-card" role="region" aria-label="Xác nhận tham gia trận đấu">
              <div className="panel-heading">
                <span className="tag">GHÉP CẶP THÀNH CÔNG</span>
                <span className={`timer ${confirmSeconds <= 5 ? 'urgent' : ''}`}>
                  <Clock3 size={18} /> Hạn xác nhận: {confirmSeconds}s
                </span>
              </div>
              <h2>Xác nhận tham gia trận đấu PvP</h2>
              <p className="muted">
                Cả hai người chơi cần xác nhận tham gia trước khi hết thời gian đếm ngược. Từ chối hoặc không phản hồi {maxDeclines} lần sẽ bị cấm ghép trận tạm thời 5 phút.
              </p>
              <div className="progress-track" style={{ marginBottom: 18 }}>
                <div style={{ width: `${Math.min(100, Math.round((confirmSeconds / 15) * 100))}%` }} />
              </div>
              <div className="pvp-confirm-players">
                <div className={`pvp-confirm-slot ${room.hostReady ? 'confirmed' : ''}`}>
                  <strong>{room.hostName}</strong>
                  <small>{room.hostRankTitle || 'Đồng'} ({room.hostElo ?? room.hostEloBefore ?? 1000} ELO)</small>
                  <span>{room.hostReady ? <><CheckCircle2 size={16} /> Đã xác nhận</> : '⏳ Đang chờ xác nhận...'}</span>
                </div>
                <div className={`pvp-confirm-slot ${room.guestReady ? 'confirmed' : ''}`}>
                  <strong>{room.guestName || 'Đối thủ'}</strong>
                  <small>{room.guestRankTitle || 'Đồng'} ({room.guestElo ?? room.guestEloBefore ?? 1000} ELO)</small>
                  <span>{room.guestReady ? <><CheckCircle2 size={16} /> Đã xác nhận</> : '⏳ Đang chờ xác nhận...'}</span>
                </div>
              </div>
              <div className="button-row" style={{ marginTop: 18 }}>
                <button className="button primary" disabled={busy || !!myReady || confirmSeconds === 0} onClick={confirmMatch}>
                  {myReady ? '✓ Đã xác nhận (Chờ đối thủ...)' : 'Xác nhận tham gia'}
                </button>
                <button className="button secondary" disabled={busy} onClick={declineMatch}>
                  <XCircle size={17} /> Từ chối trận đấu
                </button>
              </div>
              {myReady && !opponentReady && (
                <p className="muted" style={{ marginTop: 12 }}>Bạn đã sẵn sàng! Trận đấu sẽ bắt đầu đếm ngược ngay khi đối thủ xác nhận.</p>
              )}
            </section>
          )}

          {room.status === 'WAITING' && (
            <>
              <section className="card feature-card">
                <h2>Chuẩn bị trận đấu</h2>
                <p>Chia sẻ mã <strong>{room.code}</strong>. Cả hai người chơi cần chọn sẵn sàng.</p>
                <div className="ready-list">
                  <span>{room.hostName}: {room.hostReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</span>
                  <span>{room.guestName || 'Chờ người chơi'}: {room.guestReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</span>
                </div>
                <div className="button-row">
                  <button className="button secondary" disabled={busy} onClick={() => act({ action: 'READY', roomId: room.id, ready: !myReady })}>
                    {myReady ? 'Hủy sẵn sàng' : 'Tôi sẵn sàng'}
                  </button>
                  {room.isHost && (
                    <button className="button primary" disabled={busy || !room.guestId || !room.hostReady || !room.guestReady} onClick={() => act({ action: 'START', roomId: room.id })}>
                      Bắt đầu trận
                    </button>
                  )}
                  <button className="button secondary" disabled={busy} onClick={leaveWaiting}>Rời phòng</button>
                </div>
              </section>
              {chat}
            </>
          )}

          {room.status === 'IN_PROGRESS' && (
            <div className="arena-grid">
              <section className="card feature-card">
                {countdownSeconds > 0 && (
                  <div className="pvp-countdown-banner" role="status">
                    <strong>🚀 Trận đấu bắt đầu sau: {countdownSeconds} giây!</strong>
                    <p>Hãy chuẩn bị tinh thần! Đáp án sẽ mở khóa ngay khi kết thúc đếm ngược.</p>
                  </div>
                )}
                <div className="panel-heading">
                  <span className="tag">CÂU {room.currentRound}/{room.questionLimit}</span>
                  <div className="pvp-timers-wrap">
                    {room.matchDeadlineAt && (
                      <span className={`timer pvp-match-timer ${matchSeconds <= 30 ? 'urgent' : ''}`} title="Giới hạn tổng thời gian thi đấu toàn trận">
                        Tổng trận: {formatDuration(matchSeconds)}
                      </span>
                    )}
                    <span className={`timer ${seconds <= 5 ? 'urgent' : ''}`} title="Thời gian trả lời câu hỏi hiện tại">
                      <Clock3 size={18} /> {room.pausedUserId ? 'Tạm dừng' : `${seconds}s`}
                    </span>
                  </div>
                </div>
                {room.pausedUserId && (
                  <div className="error-banner" role="status">
                    {room.pausedUserId === user?.id ? 'Đang kết nối lại trận đấu...' : 'Đối thủ mất kết nối. Chờ tối đa 30 giây để họ trở lại.'}
                  </div>
                )}
                {room.question && (
                  <>
                    <h2 className="arena-question">{room.question.prompt}</h2>
                    <div className="arena-options">
                      {room.question.options.map((option, i) => {
                        const letter = 'ABCD'[i]
                        return (
                          <button
                            disabled={busy || !!room.myAnswer || seconds === 0 || countdownSeconds > 0 || !!room.pausedUserId}
                            className={`arena-option ${room.myAnswer === letter ? 'chosen' : ''}`}
                            key={letter}
                            onClick={() => act({ action: 'ANSWER', roomId: room.id, roundNo: room.currentRound, option: letter })}
                          >
                            <strong>{letter}</strong>{option}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
                {room.myAnswer && (
                  <p className="success-banner">
                    Đã gửi đáp án. {room.opponentAnswered ? 'Đối thủ đã trả lời.' : 'Đang chờ đối thủ hoặc hết giờ.'}
                  </p>
                )}
              </section>
              <aside className="arena-side">
                <section className="card feature-card">
                  <h2>Diễn biến</h2>
                  {room.lastResult ? (
                    <div className="round-result">
                      <strong>Vòng {room.lastResult.roundNo}</strong>
                      <p>Đáp án đúng: {room.lastResult.correctOption}</p>
                      <p>{room.lastResult.explanation}</p>
                    </div>
                  ) : (
                    <p className="muted">Đáp án chỉ hiện khi cả hai đã trả lời hoặc hết giờ.</p>
                  )}
                  <button className="button secondary" onClick={() => { if (window.confirm(room.isMatchmade?'Rời trận sẽ bị xử thua và trừ điểm ELO. Tiếp tục?':'Rời trận giao hữu sẽ bị xử thua, không đổi ELO. Tiếp tục?')) act({ action: 'LEAVE', roomId: room.id }) }}>
                    Rời trận
                  </button>
                </section>
                {chat}
              </aside>
            </div>
          )}

          {room.status === 'FINISHED' && (
            <section className="card feature-card arena-finish">
              <Trophy size={45} />
              <h2>{room.winnerId === null ? 'Hòa!' : room.winnerId === user?.id ? 'Bạn thắng!' : 'Bạn thua!'}</h2>
              <p><strong>Điểm trận đấu:</strong> {room.hostName} {room.hostScore} – {room.guestScore} {room.guestName}</p>
              <p className="muted">{resultReasonLabel(room.resultType)}</p>

              {/* Thống kê biến động ELO sau trận */}
              {!room.isMatchmade&&<p className="muted">Trận giao hữu · Không đổi ELO hoặc thành tích xếp hạng.</p>}
              {room.isMatchmade&&<div className="pvp-elo-summary">
                <div className="pvp-elo-box">
                  <strong>{room.hostName}</strong>
                  <span>
                    {(room.hostEloBefore ?? 1000)} ELO {' → '} {(room.hostEloBefore ?? 1000) + (room.hostEloChange ?? 0)} ELO
                  </span>
                  <b className={(room.hostEloChange ?? 0) > 0 ? 'elo-up' : (room.hostEloChange ?? 0) < 0 ? 'elo-down' : 'elo-even'}>
                    {(room.hostEloChange ?? 0) > 0 ? `+${room.hostEloChange} ELO` : `${room.hostEloChange ?? 0} ELO`}
                  </b>
                </div>
                <div className="pvp-elo-box">
                  <strong>{room.guestName}</strong>
                  <span>
                    {(room.guestEloBefore ?? 1000)} ELO {' → '} {(room.guestEloBefore ?? 1000) + (room.guestEloChange ?? 0)} ELO
                  </span>
                  <b className={(room.guestEloChange ?? 0) > 0 ? 'elo-up' : (room.guestEloChange ?? 0) < 0 ? 'elo-down' : 'elo-even'}>
                    {(room.guestEloChange ?? 0) > 0 ? `+${room.guestEloChange} ELO` : `${room.guestEloChange ?? 0} ELO`}
                  </b>
                </div>
              </div>}
              <small className="muted" style={{ display: 'block', marginBottom: 14 }}>
                ✦ Điểm trả lời câu hỏi dùng để xác định kết quả trận đấu · Điểm ELO dùng để xếp hạng PvP · Không cộng EXP học tập
              </small>

              {room.lastResult && <p>Đáp án vòng cuối: {room.lastResult.correctOption} · {room.lastResult.explanation}</p>}
              <button className="button primary" onClick={() => setRoom(null)}>Tạo trận khác</button>
            </section>
          )}

          {room.status === 'CANCELLED' && (
            <section className="card feature-card">
              <p>
                {room.cancelReason === 'DECLINED'
                  ? 'Phòng đấu đã hủy do có người chơi từ chối xác nhận tham gia.'
                  : room.cancelReason === 'CONFIRM_TIMEOUT'
                  ? 'Phòng đấu đã hủy do hết thời gian 15 giây xác nhận tham gia.'
                  : 'Phòng đã hủy.'}
              </p>
              <button className="button primary" onClick={() => setRoom(null)}>Quay lại đấu trường</button>
            </section>
          )}
        </>
      )}

      {history.length > 0 && activeTab === 'arena' && (
        <section className="card feature-card">
          <h2>Lịch sử trận đấu PvP</h2>
          {history.map(match => {
            const amHost = match.hostId === user?.id
            const myDelta = amHost ? (match.hostEloChange ?? 0) : (match.guestEloChange ?? 0)
            return (
              <div className="assignment-row" key={match.id}>
                <div>
                  <strong>{match.hostName} {match.hostScore} – {match.guestScore} {match.guestName}</strong>
                  <small>
                    {new Date(match.createdAt).toLocaleString('vi-VN')} · Phòng {match.code}
                    {match.resultType ? ` · ${resultReasonLabel(match.resultType)}` : ''}
                  </small>
                </div>
                <div className="button-row">
                  <span className={`pvp-elo-pill ${myDelta > 0 ? 'up' : myDelta < 0 ? 'down' : ''}`}>
                    {myDelta > 0 ? `+${myDelta} ELO` : `${myDelta} ELO`}
                  </span>
                  <span className="tag">{match.winnerId === null ? 'Hòa' : match.winnerId === user?.id ? 'Thắng' : 'Thua'}</span>
                </div>
              </div>
            )
          })}
        </section>
      )}
    </Layout>
  )
}
