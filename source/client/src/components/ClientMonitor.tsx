import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Send, Unplug, Users, X } from 'lucide-react'
import './ClientMonitor.css'

export type MonitorClient={sessionId:string;userId:number;username:string;currentActivity:string;page:string;topic:string;lesson:string;lastInteractionAt:number;idleSeconds:number;activeAttemptId:number|null;allocatedQuestions:number;lastPongAt:number;activeExamId?:number|null;allocatedExamQuestions?:number;activeArenaId?:number|null;allocatedArenaQuestions?:number;connectedAt:number;attemptAllocatedAt:number;examAllocatedAt:number;arenaAllocatedAt:number;messagesReceived:number;messagesSent:number}
type Filter='all'|'active'|'idle'|'attention'
const elapsed=(seconds:number)=>seconds<60?`${Math.max(0,seconds)} giây`:`${Math.floor(seconds/60)} phút`
const time=(value:number)=>value>0?new Date(value).toLocaleTimeString('vi-VN'):'Chưa có dữ liệu'
const date=(value:number)=>value>0?new Date(value).toLocaleString('vi-VN'):'Chưa có dữ liệu'
const resources=(c:MonitorClient)=>[
  {id:c.activeAttemptId,count:c.allocatedQuestions,time:c.attemptAllocatedAt,label:'Lượt làm bài'},
  {id:c.activeExamId,count:c.allocatedExamQuestions,time:c.examAllocatedAt,label:'Kiểm tra lớp'},
  {id:c.activeArenaId,count:c.allocatedArenaQuestions,time:c.arenaAllocatedAt,label:'Phòng PvP'}
].filter(r=>r.id)

export function ClientMonitor({clients,loading,connected,selectedId,onSelect,busy,onManage,feedback,activity,alertSessionIds}:{
  clients:MonitorClient[];loading:boolean;connected:boolean;selectedId:string|null;onSelect:(id:string|null)=>void;
  busy:boolean;onManage:(client:MonitorClient,disconnect:boolean)=>Promise<void>;feedback:string;
  activity:(value:string)=>string;alertSessionIds:Set<string>
}) {
  const [query,setQuery]=useState(''),[filter,setFilter]=useState<Filter>('all'),[page,setPage]=useState(0)
  const detail=useRef<HTMLElement>(null)
  const selected=clients.find(c=>c.sessionId===selectedId)
  useEffect(()=>{if(selectedId&&window.matchMedia('(max-width:1100px)').matches)detail.current?.scrollIntoView({behavior:'smooth',block:'start'})},[selectedId])
  useEffect(()=>setPage(0),[query,filter])
  const counts={all:clients.length,active:clients.filter(c=>c.idleSeconds<60).length,idle:clients.filter(c=>c.idleSeconds>=60).length,attention:clients.filter(c=>alertSessionIds.has(c.sessionId)).length}
  const search=query.trim().toLocaleLowerCase()
  const filtered=clients.filter(c=>(filter==='all'||filter==='active'&&c.idleSeconds<60||filter==='idle'&&c.idleSeconds>=60||filter==='attention'&&alertSessionIds.has(c.sessionId))&&`${c.username} ${c.userId} ${c.sessionId} ${c.page} ${c.topic} ${c.lesson}`.toLocaleLowerCase().includes(search))
  const pages=Math.max(1,Math.ceil(filtered.length/8)),currentPage=Math.min(page,pages-1)
  const visible=filtered.slice(currentPage*8,currentPage*8+8)
  return <section className="client-monitor" aria-label="Quản lý kết nối client">
    <div className="client-section-heading"><div><span className="section-label">KẾT NỐI TRỰC TIẾP</span><h2>Quản lý Client</h2><p>Mỗi kết nối tương ứng với một tab. Chọn client để xem chi tiết hoặc gửi lệnh.</p></div><span className="tag">{clients.length} kết nối</span></div>
    <div className="client-workspace">
      <section className="card client-directory" aria-label="Danh sách client">
        <div className="client-directory-tools">
          <label className="client-search"><Search size={18}/><input aria-label="Tìm client" placeholder="Tìm tài khoản, ID hoặc trang…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" aria-label="Xóa tìm kiếm client" onClick={()=>setQuery('')}><X size={16}/></button>}</label>
          <div className="client-filters" aria-label="Lọc trạng thái client">{([['all','Tất cả'],['active','Hoạt động'],['idle','Không thao tác'],['attention','Cần chú ý']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}<span>{counts[key]}</span></button>)}</div>
        </div>
        <div className="client-list">
          {visible.map(c=><button type="button" className={`client-list-item ${selectedId===c.sessionId?'selected':''}`} key={c.sessionId} onClick={()=>onSelect(c.sessionId)} aria-pressed={selectedId===c.sessionId} aria-label={`Xem client ${c.username}, tab ${c.sessionId.slice(0,8)}`}>
            <span className={`client-presence-dot ${c.idleSeconds>=60?'idle':''}`} aria-hidden="true"/>
            <span className="client-list-copy"><span className="client-list-title"><strong>{c.username}</strong>{alertSessionIds.has(c.sessionId)&&<span className="client-attention">Cần chú ý</span>}</span><span className="client-list-activity">{activity(c.currentActivity)}</span><small>#{c.userId} · Tab {c.sessionId.slice(0,8)}{resources(c).length>0&&` · ${resources(c).length} gói đề`}</small></span>
            <span className="client-list-status"><span>{c.idleSeconds>=60?`Vắng ${elapsed(c.idleSeconds)}`:'Hoạt động'}</span><ChevronRight size={16}/></span>
          </button>)}
          {!visible.length&&<div className="client-empty" role="status"><Users size={28}/><strong>{loading?'Đang tải kết nối…':clients.length?'Không tìm thấy client phù hợp':'Chưa có client kết nối'}</strong>{clients.length>0&&<button className="text-button" onClick={()=>{setQuery('');setFilter('all')}}>Xóa bộ lọc</button>}</div>}
        </div>
        <div className="client-directory-footer"><span>{filtered.length?`${currentPage*8+1}–${Math.min((currentPage+1)*8,filtered.length)} / ${filtered.length} kết nối`:'0 kết nối'}</span><div><button type="button" className="icon-button" aria-label="Trang client trước" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={18}/></button><button type="button" className="icon-button" aria-label="Trang client sau" disabled={currentPage===pages-1} onClick={()=>setPage(currentPage+1)}><ChevronRight size={18}/></button></div></div>
      </section>
      <section className="card client-inspector" ref={detail} aria-label="Chi tiết client">
        {!selected?<div className="client-empty"><Users size={32}/><h3>{selectedId?'Client đã ngắt kết nối':'Chọn một client'}</h3><p>{selectedId?'Kết nối này không còn trong danh sách hiện tại.':'Thông tin hoạt động, gói đề và thao tác quản lý sẽ xuất hiện tại đây.'}</p></div>:<>
          <div className="client-inspector-heading"><div><span className="section-label">CLIENT ĐANG CHỌN</span><h3>{selected.username}</h3><small>User #{selected.userId} · Tab {selected.sessionId.slice(0,8)}</small></div><button className="icon-button" type="button" aria-label="Đóng chi tiết client" onClick={()=>onSelect(null)}><X size={18}/></button></div>
          <div className="client-current-activity"><span className={`presence-pill ${selected.idleSeconds>=60?'idle':'active'}`}>{selected.idleSeconds>=60?'Không thao tác':'Đang hoạt động'}</span><strong>{activity(selected.currentActivity)}</strong><p>{[selected.topic,selected.lesson].filter(Boolean).join(' · ')||selected.page||'Chưa ghi nhận vị trí'}</p></div>
          <dl className="client-key-facts"><div><dt>Không thao tác</dt><dd>{elapsed(selected.idleSeconds)}</dd></div><div><dt>Phản hồi kết nối cuối</dt><dd>{time(selected.lastPongAt)}</dd></div></dl>
          <div className="client-learning-resources"><h4>Gói đề đang giữ <span>{resources(selected).length}</span></h4>{resources(selected).map(r=><div className="client-resource-item" key={r.label}><strong>{r.label} #{r.id}</strong><span>{r.count??0} câu · Từ {time(r.time)}</span>{r.label==='Phòng PvP'&&<small>Dùng chung theo phòng</small>}</div>)}{!resources(selected).length&&<p>Không có gói đề đang giữ.</p>}</div>
          <details className="client-technical-details"><summary>Thông tin kỹ thuật</summary><dl><div><dt>Session ID</dt><dd>{selected.sessionId}</dd></div><div><dt>Kết nối lúc</dt><dd>{date(selected.connectedAt)}</dd></div><div><dt>Thao tác cuối</dt><dd>{date(selected.lastInteractionAt)}</dd></div><div><dt>Tin nhắn ứng dụng</dt><dd>Nhận: {selected.messagesReceived??0} · Gửi: {selected.messagesSent??0}</dd></div></dl></details>
          <div className="client-management-actions"><button className="button secondary" disabled={busy||!connected} onClick={()=>void onManage(selected,false)}><Send size={16}/>Gửi lời nhắc</button><button className="button client-disconnect" disabled={busy||!connected} onClick={()=>void onManage(selected,true)}><Unplug size={16}/>Ngắt kết nối</button></div>
        </>}
        {feedback&&<p className="client-action-feedback" role="status">{feedback}</p>}
      </section>
    </div>
  </section>
}
