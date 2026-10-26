import { useCallback, useEffect, useRef, useState } from 'react'
import { useSystemSocket } from '../app/SystemSocketContext'
import { api } from '../services/api'

export type SecurityIncident = {
  id: number; userId: number | null; username: string | null; peerAddress: string | null
  ruleCode: string; severity: string; message: string; eventCount: number; windowSeconds: number
  status: string; decision: string | null; note: string | null; occurredAt: string
  resolvedBy: string | null; resolvedAt: string | null
}

export function SecurityIncidentsPanel() {
  const { subscribe, connected } = useSystemSocket()
  const [incidents, setIncidents] = useState<SecurityIncident[]>([])
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true)
  const [openOnly, setOpenOnly] = useState(true)
  const mounted = useRef(false)
  const reload = useCallback(async () => {
    try {
      const data = await api.securityIncidents()
      if (mounted.current) { setIncidents(data); setError('') }
    } catch (e) { if (mounted.current) setError((e as Error).message) }
    finally { if (mounted.current) setLoading(false) }
  }, [])
  useEffect(() => {
    mounted.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    // Coalesce bursts of alerts before refreshing the review queue.
    const stop = subscribe(message => {
      if (['SECURITY_INCIDENT', 'SECURITY_INCIDENT_UPDATED'].includes(message.action) && !timer)
        timer = setTimeout(() => { timer = undefined; void reload() }, 500)
    })
    void reload()
    const fallback = setInterval(() => { void reload() }, 30000)
    return () => { mounted.current = false; stop(); clearTimeout(timer); clearInterval(fallback) }
  }, [subscribe, reload, connected])
  async function decide(incident: SecurityIncident, action: 'WARN' | 'LOCK' | 'DISMISS') {
    const note = window.prompt('Ghi chú xử lý cảnh báo (tối đa 500 ký tự):', '')
    if (note === null) return
    if (note.length > 500) { setError('Ghi chú không được vượt quá 500 ký tự.'); return }
    if (action === 'LOCK' && !window.confirm(`Khóa tài khoản ${incident.username} sau khi xem xét cảnh báo #${incident.id}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api.decideSecurityIncident(incident.id, action, note)
      if (mounted.current) setNotice(`Đã xử lý cảnh báo #${incident.id}.`)
      await reload()
    } catch (e) { if (mounted.current) setError((e as Error).message) }
    finally { if (mounted.current) setBusy(false) }
  }
  const visible = incidents.filter(i => !openOnly || i.status === 'OPEN')
  return <section id="security-incidents" className="card feature-card" aria-label="Cảnh báo bảo mật">
    <h2>Phát hiện spam và hoạt động bất thường · {incidents.filter(i => i.status === 'OPEN').length} chờ xử lý</h2>
    <p>Server theo dõi tần suất trong cửa sổ 10–60 giây. Đây là tín hiệu cần xem xét; tài khoản chỉ bị khóa khi admin quyết định. Cảnh báo được lưu kể cả khi client ngắt kết nối.</p>
    <div className="button-row"><label><input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} /> Chỉ hiện cảnh báo chờ xử lý</label><button className="button secondary" disabled={busy} onClick={() => void reload()}>Làm mới</button></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {notice && <p className="success-banner" role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải cảnh báo…</p> : visible.length === 0 && <p>Không có cảnh báo trong danh sách này.</p>}
    {visible.map(incident => <article className={`system-alert ${incident.severity === 'HIGH' ? 'critical' : ''}`} key={incident.id}>
      <strong>#{incident.id} · {incident.username || 'Chưa đăng nhập'} · {incident.severity === 'HIGH' ? 'Mức cao' : 'Cảnh báo'}</strong>
      <p>{incident.message}</p>
      <small>{new Date(incident.occurredAt).toLocaleString('vi-VN')} · {incident.ruleCode} · {incident.eventCount} sự kiện/{incident.windowSeconds} giây{incident.peerAddress ? ` · Địa chỉ kết nối: ${incident.peerAddress}` : ''}</small>
      {incident.status === 'OPEN' ? <div className="button-row">
        <button className="button secondary" disabled={busy || !incident.userId} onClick={() => void decide(incident, 'WARN')}>Cảnh cáo</button>
        <button className="button secondary" disabled={busy || !incident.userId} onClick={() => void decide(incident, 'LOCK')}>Khóa tài khoản</button>
        <button className="button secondary" disabled={busy} onClick={() => void decide(incident, 'DISMISS')}>Bỏ qua / ghi chú</button>
      </div> : <p>Đã xử lý: {({ WARN: 'Cảnh cáo', LOCK: 'Khóa tài khoản', DISMISS: 'Bỏ qua' } as Record<string, string>)[incident.decision || '']} · {incident.resolvedBy || 'Admin'}{incident.note ? ` · ${incident.note}` : ''}</p>}
      {!incident.userId && incident.status === 'OPEN' && <p className="muted">Chưa xác định tài khoản. Địa chỉ kết nối có thể được nhiều người dùng chung.</p>}
    </article>)}
    <small>Hiển thị tối đa 200 cảnh báo, ưu tiên cảnh báo chờ xử lý.</small>
  </section>
}
