import { useEffect, useRef, useState } from 'react'
import { Activity, Database, MemoryStick } from 'lucide-react'
import { useSystemSocket } from '../app/SystemSocketContext'
import './ServerDashboardPage.css'
import { SecurityIncidentsPanel } from '../components/SecurityIncidentsPanel'
import { ClientMonitor, type MonitorClient as Client } from '../components/ClientMonitor'

type NetworkEvent={id:number;time:string;level:string;message:string}
type QueueEntry={username:string;sessionId:string;level:number;queuedAt:number;waitingSeconds:number;allowedGap:number;elo:number;allowedEloGap:number}
type Alert={key:string;level:string;message:string;sessionId:string}
type Capacity={maxSockets:number;maxSocketsPerAccount:number;reservedSockets:number;maxConcurrentRequests:number;activeRequests:number;rejectedRequests:number;rejectedConnections:number}
type Stats={connections:number;ram:number;activeSockets:number;heapCommitted:number;heapMax:number;activeSnapshots:number;clients:Client[];events:NetworkEvent[];queue?:QueueEntry[];alerts?:Alert[];eventsDelta?:boolean;capacity?:Capacity}
const activity=(value:string)=>value.startsWith('READING_LESSON_')?'Đang học lý thuyết':({VIEWING_EXAM_RESULT:'Đang xem kết quả kiểm tra',TAKING_EXAM:'Đang làm kiểm tra lớp',MONITORING_EXAM:'Đang theo dõi kiểm tra',MATCHMAKING:'Đang chờ ghép trận PvP',VIEWING_ROADMAP:'Đang xem lộ trình',PRACTICING:'Đang luyện tập',LESSON_BOSS:'Đang làm Boss bài học',CHAPTER_BOSS:'Đang làm Boss chủ đề',VIEWING_RESULT:'Đang xem kết quả',CHOOSING_PRACTICE:'Đang chọn bài luyện',IN_CLASSROOM:'Đang trong lớp học',PVP_LOBBY:'Đang ở sảnh PvP',PLAYING_PVP:'Đang ở phòng PvP',IN_LOBBY:'Đang ở sảnh',CONNECTED:'Vừa kết nối',VIEWING_PAGE:'Đang xem trang'} as Record<string,string>)[value]||value
const duration=(seconds:number)=>seconds<60?`${seconds} giây`:`${Math.floor(seconds/60)} phút ${seconds%60} giây`
/** Được nhúng vào AdminPage, không mở socket hoặc layout độc lập. */
export function ServerDashboardPage(){
  const {connected,subscribe,request}=useSystemSocket()
  const [selectedId,setSelectedId]=useState<string|null>(null),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('')
  const [stats,setStats]=useState<Stats|null>(null),[updated,setUpdated]=useState(''),[paused,setPaused]=useState(false)
  useEffect(()=>{
    if(!connected)return
    // Request a fresh log window on mount/reconnect; stop telemetry when leaving.
    setStats(null)
    void request('SYSTEM_MONITOR_WATCH','SYSTEM_MONITOR_DATA').catch(e=>setFeedback(e.message))
    return()=>{void request('SYSTEM_MONITOR_UNWATCH','SYSTEM_MONITOR_DATA').catch(()=>{})}
  },[connected,request])
  const selectClient=(id:string|null)=>{setSelectedId(id);setFeedback('')}
  const revealClient=(id:string)=>{selectClient(id);document.querySelector('.client-monitor')?.scrollIntoView({behavior:'smooth',block:'start'})}
  const consoleRef=useRef<HTMLDivElement>(null)
  async function manage(client:Client,disconnect:boolean){
    const message=disconnect?'':window.prompt(`Gửi lời nhắc cho ${client.username}:`,'Mình tiếp tục học nhé! Nếu cần hỗ trợ, hãy nhắn cho giáo viên.')
    if(message===null)return
    if(disconnect&&!window.confirm(`Ngắt tab ${client.sessionId.slice(0,8)} của ${client.username}? Server sẽ thu hồi tài nguyên của tab này.`))return
    setBusy(true);setFeedback('')
    try{await request('SYSTEM_'+(disconnect?'DISCONNECT':'REMIND'),'SYSTEM_ACTION_RESULT',{sessionId:client.sessionId,message});setFeedback(disconnect?'Đã ngắt socket và thu hồi tài nguyên.':'Đã gửi lời nhắc.')}
    catch(e){setFeedback((e as Error).message)}finally{setBusy(false)}
  }
  useEffect(()=>subscribe(message=>{
    if(message.action!=='STATS_UPDATE')return
    const data=message.data as Stats
    if(!data||!Array.isArray(data.clients)||!Array.isArray(data.events))return
    setStats(previous=>{
      const events=data.eventsDelta?[...(previous?.events||[]),...data.events]:data.events
      const unique=[...new Map(events.map(event=>[event.id,event])).values()].sort((a,b)=>a.id-b.id).slice(-200)
      return {...data,events:unique}
    });setUpdated(new Date().toLocaleTimeString('vi-VN'))
  }),[subscribe])
  const lastEvent=stats?.events[stats.events.length-1]?.id
  useEffect(()=>{if(!paused&&consoleRef.current)consoleRef.current.scrollTop=consoleRef.current.scrollHeight},[lastEvent,paused])
  return <section className="admin-monitor" aria-label="Giám sát máy chủ">
    <div className="monitor-heading"><span className={`monitor-live ${connected?'online':''}`}><i/>{connected?'Trực tiếp · mỗi 2,5 giây':'Đang kết nối lại…'}</span><small>Cập nhật: {updated||'Đang chờ'}</small></div>
    {stats?.capacity&&<details className="monitor-capacity"><summary>Giới hạn vận hành</summary><p className="monitor-scope">Giới hạn tải: {stats.capacity.reservedSockets}/{stats.capacity.maxSockets} socket (tối đa {stats.capacity.maxSocketsPerAccount}/tài khoản) · {stats.capacity.activeRequests}/{stats.capacity.maxConcurrentRequests} yêu cầu nghiệp vụ đang xử lý · Đã từ chối từ lúc khởi động: {stats.capacity.rejectedRequests} yêu cầu, {stats.capacity.rejectedConnections} kết nối. Không gồm các job định kỳ.</p></details>}
    <div className="monitor-cards">
      <article className="card monitor-metric"><span className="card-icon purple"><Activity size={23}/></span><div><h2>Kết nối đang mở</h2><strong>{stats?.activeSockets??'—'}</strong><p>{stats?.connections??0} tài khoản đang kết nối</p></div></article>
      <article className="card monitor-metric"><span className="card-icon mint"><MemoryStick size={23}/></span><div><h2>Bộ nhớ máy chủ</h2><strong>{stats?stats.ram.toFixed(0):'—'} <small>/ {stats?stats.heapCommitted.toFixed(0):'—'} MiB</small></strong><p>Đang sử dụng / heap đã cấp cho JVM</p><div className="progress-track"><div style={{width:`${stats?Math.min(100,stats.ram/Math.max(1,stats.heapCommitted)*100):0}%`}}/></div></div></article>
      <article className="card monitor-metric"><span className="card-icon amber"><Database size={23}/></span><div><h2>Gói đề đang giữ</h2><strong>{stats?.activeSnapshots??'—'}</strong><p>Gói đề đang được giữ trên RAM</p></div></article>
    </div>
    <ClientMonitor clients={stats?.clients||[]} loading={!stats} connected={connected} selectedId={selectedId} onSelect={selectClient} busy={busy} onManage={manage} feedback={feedback} activity={activity} alertSessionIds={new Set((stats?.alerts||[]).map(a=>a.sessionId).filter(Boolean))}/>
    <details className="card feature-card monitor-disclosure" onToggle={e=>{if(e.currentTarget.open&&!paused&&consoleRef.current)consoleRef.current.scrollTop=consoleRef.current.scrollHeight}}><summary>Nhật ký mạng <span>200 sự kiện gần nhất</span></summary><div className="panel-heading"><div><h2>Nhật ký Mạng</h2><p className="muted">Sự kiện kết nối, cấp phát/thu hồi tài nguyên và bảo mật.</p></div><button className="button secondary" onClick={()=>setPaused(!paused)}>{paused?'Tiếp tục cuộn':'Tạm dừng cuộn'}</button></div><div className="admin-network-terminal" ref={consoleRef} role="log" aria-live="polite" aria-label="Nhật ký mạng">{stats?.events.map(event=><div className={`network-line ${event.level.toLowerCase()}`} key={event.id}><time>{new Date(event.time).toLocaleTimeString('vi-VN')}</time> <b>[{event.level}]</b> {event.message}</div>)}{!stats?.events.length&&<p>Chờ sự kiện từ server…</p>}</div></details>
    <section className="card feature-card"><h2>Hàng đợi PvP trực tiếp · {stats?.queue?.length??0} người</h2><div className="table-wrap"><table><thead><tr><th>Tài khoản / Socket</th><th>Cấp tài khoản / Elo</th><th>Thời gian chờ</th><th>Phạm vi ghép hiện tại</th></tr></thead><tbody>{stats?.queue?.map(q=><tr key={q.sessionId}><td><button className="button secondary" onClick={()=>revealClient(q.sessionId)}>{q.username} · {q.sessionId.slice(0,8)}</button></td><td>{q.level} / {q.elo} Elo</td><td>{duration(q.waitingSeconds)}</td><td>±{q.allowedEloGap} Elo</td></tr>)}</tbody></table></div>{!stats?.queue?.length&&<p>Chưa có học sinh đang chờ ghép trận.</p>}<small>Ghép trận còn phụ thuộc phạm vi chấp nhận của cả hai người chơi.</small></section>
    <section className="card feature-card"><h2>Cảnh báo bất thường · {stats?.alerts?.length??0}</h2><p>Heap ≥85% giới hạn JVM; thiếu Pong &gt;30 giây; AFK ≥2 phút; giữ gói đề &gt;15 phút. Giữ gói lâu là tín hiệu cần xem xét, không tự động xác định vi phạm.</p>{stats?.alerts?.map(a=><div className={`system-alert ${a.level.toLowerCase()}`} key={a.key}><strong>[{a.level}]</strong> {a.message} {a.sessionId&&<button className="button secondary" onClick={()=>revealClient(a.sessionId)}>Xem client</button>}</div>)}{!stats?.alerts?.length&&<p>Chưa phát hiện bất thường.</p>}<small>Kèm sự kiện cảnh báo/bảo mật trong 60 giây gần nhất. Khi socket đã bị ngắt, cảnh báo kết nối hiện tại sẽ biến mất; nhật ký vẫn giữ sự kiện.</small></section>
    <SecurityIncidentsPanel/>
    <p className="monitor-scope">Sockets được đếm tại /api/ws-system; không phải toàn bộ TCP của máy. Gói câu hỏi PvP dùng RAM chung theo phòng; DB lưu trạng thái và kết quả. Ping/Pong kiểm tra kết nối; AFK tính từ thao tác người dùng. Bộ đếm tin nhắn tính JSON ứng dụng qua handler, không tính frame Ping/Pong hay gói telemetry.</p>
  </section>
}
