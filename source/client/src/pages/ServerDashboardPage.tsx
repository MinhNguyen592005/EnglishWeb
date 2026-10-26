import { useEffect, useRef, useState } from 'react'
import { Activity, Database, MemoryStick } from 'lucide-react'
import { useSystemSocket } from '../app/SystemSocketContext'
import './ServerDashboardPage.css'
import { SecurityIncidentsPanel } from '../components/SecurityIncidentsPanel'

type Client={sessionId:string;userId:number;username:string;currentActivity:string;page:string;topic:string;lesson:string;lastInteractionAt:number;idleSeconds:number;activeAttemptId:number|null;allocatedQuestions:number;lastPongAt:number;activeExamId?:number|null;allocatedExamQuestions?:number;activeArenaId?:number|null;allocatedArenaQuestions?:number;connectedAt:number;attemptAllocatedAt:number;examAllocatedAt:number;arenaAllocatedAt:number;messagesReceived:number;messagesSent:number}
type NetworkEvent={id:number;time:string;level:string;message:string}
type QueueEntry={username:string;sessionId:string;level:number;queuedAt:number;waitingSeconds:number;allowedGap:number;elo:number;allowedEloGap:number}
type Alert={key:string;level:string;message:string;sessionId:string}
type Capacity={maxSockets:number;maxSocketsPerAccount:number;reservedSockets:number;maxConcurrentRequests:number;activeRequests:number;rejectedRequests:number;rejectedConnections:number}
type Stats={connections:number;ram:number;activeSockets:number;heapCommitted:number;heapMax:number;activeSnapshots:number;clients:Client[];events:NetworkEvent[];queue?:QueueEntry[];alerts?:Alert[];eventsDelta?:boolean;capacity?:Capacity}
const activity=(value:string)=>value.startsWith('READING_LESSON_')?'Đang học lý thuyết':({VIEWING_EXAM_RESULT:'Đang xem kết quả kiểm tra',TAKING_EXAM:'Đang làm kiểm tra lớp',MONITORING_EXAM:'Đang theo dõi kiểm tra',MATCHMAKING:'Đang chờ ghép trận PvP',VIEWING_ROADMAP:'Đang xem lộ trình',PRACTICING:'Đang luyện tập',LESSON_BOSS:'Đang làm Boss bài học',CHAPTER_BOSS:'Đang làm Boss chủ đề',VIEWING_RESULT:'Đang xem kết quả',CHOOSING_PRACTICE:'Đang chọn bài luyện',IN_CLASSROOM:'Đang trong lớp học',PVP_LOBBY:'Đang ở sảnh PvP',PLAYING_PVP:'Đang ở phòng PvP',IN_LOBBY:'Đang ở sảnh',CONNECTED:'Vừa kết nối',VIEWING_PAGE:'Đang xem trang'} as Record<string,string>)[value]||value
const duration=(seconds:number)=>seconds<60?`${seconds} giây`:`${Math.floor(seconds/60)} phút ${seconds%60} giây`
const emptyLearningPacket=(client:Client)=>client.currentActivity.startsWith('READING_LESSON_')
  ? 'Đọc lý thuyết — không giữ snapshot trên server'
  : 'Không giữ gói đề trên server'

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
  const consoleRef=useRef<HTMLDivElement>(null)
  const detailRef=useRef<HTMLElement>(null)
  useEffect(()=>{if(selectedId)detailRef.current?.scrollIntoView({behavior:'smooth',block:'start'})},[selectedId])
  const selected=stats?.clients.find(c=>c.sessionId===selectedId)
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
    <SecurityIncidentsPanel/>
    <div className="monitor-heading"><span className={`monitor-live ${connected?'online':''}`}><i/>{connected?'Trực tiếp · mỗi 2,5 giây':'Đang kết nối lại…'}</span><small>Cập nhật: {updated||'Đang chờ'}</small></div>
    {stats?.capacity&&<p className="monitor-scope">Giới hạn tải: {stats.capacity.reservedSockets}/{stats.capacity.maxSockets} socket (tối đa {stats.capacity.maxSocketsPerAccount}/tài khoản) · {stats.capacity.activeRequests}/{stats.capacity.maxConcurrentRequests} yêu cầu nghiệp vụ đang xử lý · Đã từ chối từ lúc khởi động: {stats.capacity.rejectedRequests} yêu cầu, {stats.capacity.rejectedConnections} kết nối. Không gồm các job định kỳ.</p>}
    <div className="monitor-cards">
      <article className="card monitor-metric"><span className="card-icon purple"><Activity size={23}/></span><div><h2>Active Sockets</h2><strong>{stats?.activeSockets??'—'}</strong><p>{stats?.connections??0} tài khoản đang kết nối</p></div></article>
      <article className="card monitor-metric"><span className="card-icon mint"><MemoryStick size={23}/></span><div><h2>JVM Heap Memory</h2><strong>{stats?stats.ram.toFixed(0):'—'} <small>/ {stats?stats.heapCommitted.toFixed(0):'—'} MiB</small></strong><p>Đang sử dụng / heap đã cấp cho JVM</p><div className="progress-track"><div style={{width:`${stats?Math.min(100,stats.ram/Math.max(1,stats.heapCommitted)*100):0}%`}}/></div></div></article>
      <article className="card monitor-metric"><span className="card-icon amber"><Database size={23}/></span><div><h2>Active Snapshots</h2><strong>{stats?.activeSnapshots??'—'}</strong><p>Gói đề đang được giữ trên RAM</p></div></article>
    </div>
    <section className="card feature-card monitor-clients"><div className="panel-heading"><div><h2>Quản lý Client</h2><p className="muted">Mỗi dòng là một tab đang kết nối. Tài nguyên được thu hồi khi hoàn thành hoặc ngắt kết nối.</p></div><span className="tag">{stats?.clients.length??0} kết nối</span></div>
      <div className="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Hoạt động hiện tại</th><th>Gói học tập đang giữ</th><th>Trạng thái nhịp tim (Ping / AFK)</th></tr></thead><tbody>{stats?.clients.map(c=><tr key={c.sessionId} className={c.idleSeconds>=60?'monitor-afk':''}><td><button className="button secondary" onClick={()=>setSelectedId(c.sessionId)}>{c.username}</button><small>ID: {c.userId} · Tab: {c.sessionId.slice(0,8)}</small></td><td><strong>{activity(c.currentActivity)}</strong><small>{[c.topic,c.lesson].filter(Boolean).join(' · ')||c.page}</small></td><td>{c.activeArenaId?<><span className="monitor-resource">Gói PvP #{c.activeArenaId} ({c.allocatedArenaQuestions} câu)</span><small>RAM · dùng chung theo phòng</small></>:c.activeExamId?<><span className="monitor-resource">Kiểm tra #{c.activeExamId} ({c.allocatedExamQuestions} câu)</span><small>Snapshot kiểm tra · RAM</small></>:c.activeAttemptId?<><span className="monitor-resource">{c.lesson||`Gói lượt #${c.activeAttemptId}`} ({c.allocatedQuestions} câu)</span><small>Snapshot #{c.activeAttemptId} · RAM</small></>:<><span className="muted">{emptyLearningPacket(c)}</span><small>Socket và trạng thái client vẫn sử dụng RAM</small></>}</td><td><span className={`presence-pill ${c.idleSeconds>=60?'idle':'active'}`}>{c.idleSeconds>=60?`🟡 Không thao tác ${duration(c.idleSeconds)}`:'🟢 Hoạt động'}</span><small>Pong: {new Date(c.lastPongAt).toLocaleTimeString('vi-VN')}</small></td></tr>)}</tbody></table></div>
      {!stats&&<p className="muted">Đang chờ dữ liệu máy chủ…</p>}{stats?.clients.length===0&&<p className="muted">Chưa có client kết nối.</p>}
    </section>
    <section className="card feature-card"><div className="panel-heading"><div><h2>Nhật ký Mạng</h2><p className="muted">Sự kiện kết nối, cấp phát/thu hồi tài nguyên và bảo mật.</p></div><button className="button secondary" onClick={()=>setPaused(!paused)}>{paused?'Tiếp tục cuộn':'Tạm dừng cuộn'}</button></div><div className="admin-network-terminal" ref={consoleRef} role="log" aria-live="polite" aria-label="Nhật ký mạng">{stats?.events.map(event=><div className={`network-line ${event.level.toLowerCase()}`} key={event.id}><time>{new Date(event.time).toLocaleTimeString('vi-VN')}</time> <b>[{event.level}]</b> {event.message}</div>)}{!stats?.events.length&&<p>Chờ sự kiện từ server…</p>}</div></section>
    <section className="card feature-card" ref={detailRef}><h2>Chi tiết và điều khiển Client</h2><p>Chọn socket để xem thời gian cấp phát, lưu lượng và gửi lệnh quản lý.</p>
      <select aria-label="Chọn client" value={selectedId||''} onChange={e=>setSelectedId(e.target.value||null)}><option value="">Chọn một kết nối…</option>{stats?.clients.map(c=><option key={c.sessionId} value={c.sessionId}>{c.username} · {c.sessionId.slice(0,8)}</option>)}</select>
      {selectedId&&!selected&&<p>Client đã ngắt kết nối.</p>}
      {selected&&<><dl className="client-detail-grid"><div><dt>Tài khoản / Socket</dt><dd>#{selected.userId} · {selected.username}<br/>{selected.sessionId}</dd></div><div><dt>Kết nối lúc</dt><dd>{new Date(selected.connectedAt).toLocaleString('vi-VN')}</dd></div><div><dt>Hoạt động / vị trí</dt><dd>{activity(selected.currentActivity)} · {[selected.topic,selected.lesson].filter(Boolean).join(' · ')||selected.page}</dd></div><div><dt>Thao tác cuối</dt><dd>{new Date(selected.lastInteractionAt).toLocaleString('vi-VN')} · AFK {duration(selected.idleSeconds)}</dd></div><div><dt>Tin nhắn ứng dụng</dt><dd>Client → Server: {selected.messagesReceived}<br/>Server → Client: {selected.messagesSent}</dd></div></dl>
      <h3>Gói học tập đang giữ</h3>{[
        {id:selected.activeAttemptId,time:selected.attemptAllocatedAt,count:selected.allocatedQuestions,label:'Lượt làm'},
        {id:selected.activeExamId,time:selected.examAllocatedAt,count:selected.allocatedExamQuestions,label:'Kiểm tra'},
        {id:selected.activeArenaId,time:selected.arenaAllocatedAt,count:selected.allocatedArenaQuestions,label:'PvP (dùng chung theo phòng)'}
      ].filter(r=>r.id).map(r=><p key={r.label}>{r.label} #{r.id} · {r.count} câu · cấp lúc {new Date(r.time).toLocaleTimeString('vi-VN')} · giữ {duration(Math.max(0,Math.floor((Date.now()-r.time)/1000)))}</p>)}
      {!selected.activeAttemptId&&!selected.activeExamId&&!selected.activeArenaId&&<><p>{emptyLearningPacket(selected)}</p><p className="muted">Socket và trạng thái client vẫn sử dụng RAM.</p></>}
      <div className="button-row"><button className="button secondary" disabled={busy||!connected} onClick={()=>void manage(selected,false)}>Gửi lời nhắc</button><button className="button secondary" disabled={busy||!connected} onClick={()=>void manage(selected,true)}>Ngắt kết nối</button></div></>}
      {feedback&&<p role="status">{feedback}</p>}
    </section>
    <section className="card feature-card"><h2>Hàng đợi PvP trực tiếp · {stats?.queue?.length??0} người</h2><div className="table-wrap"><table><thead><tr><th>Tài khoản / Socket</th><th>Cấp tài khoản / Elo</th><th>Thời gian chờ</th><th>Phạm vi ghép hiện tại</th></tr></thead><tbody>{stats?.queue?.map(q=><tr key={q.sessionId}><td><button className="button secondary" onClick={()=>setSelectedId(q.sessionId)}>{q.username} · {q.sessionId.slice(0,8)}</button></td><td>{q.level} / {q.elo} Elo</td><td>{duration(q.waitingSeconds)}</td><td>±{q.allowedEloGap} Elo</td></tr>)}</tbody></table></div>{!stats?.queue?.length&&<p>Chưa có học sinh đang chờ ghép trận.</p>}<small>Ghép trận còn phụ thuộc phạm vi chấp nhận của cả hai người chơi.</small></section>
    <section className="card feature-card"><h2>Cảnh báo bất thường · {stats?.alerts?.length??0}</h2><p>Heap ≥85% giới hạn JVM; thiếu Pong &gt;30 giây; AFK ≥2 phút; giữ gói đề &gt;15 phút. Giữ gói lâu là tín hiệu cần xem xét, không tự động xác định vi phạm.</p>{stats?.alerts?.map(a=><div className={`system-alert ${a.level.toLowerCase()}`} key={a.key}><strong>[{a.level}]</strong> {a.message} {a.sessionId&&<button className="button secondary" onClick={()=>setSelectedId(a.sessionId)}>Xem client</button>}</div>)}{!stats?.alerts?.length&&<p>Chưa phát hiện bất thường.</p>}<small>Kèm sự kiện cảnh báo/bảo mật trong 60 giây gần nhất. Khi socket đã bị ngắt, cảnh báo kết nối hiện tại sẽ biến mất; nhật ký vẫn giữ sự kiện.</small></section>
    <p className="monitor-scope">Sockets được đếm tại /api/ws-system; không phải toàn bộ TCP của máy. Gói câu hỏi PvP dùng RAM chung theo phòng; DB lưu trạng thái và kết quả. Ping/Pong kiểm tra kết nối; AFK tính từ thao tác người dùng. Bộ đếm tin nhắn tính JSON ứng dụng qua handler, không tính frame Ping/Pong hay gói telemetry.</p>
  </section>
}
