import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, FileCheck2, Eye, FileWarning, Lock, ScrollText, Search, ShieldAlert, Unlock, UsersRound, X, SlidersHorizontal } from 'lucide-react'
import { Layout } from '../components/Layout'
import { Pagination, PAGE_SIZE } from '../components/Pagination'
import { api } from '../services/api'
import type { AdminUser, AdminReport } from '../types'
import { SupportInbox } from '../components/SupportChat'
import { BusinessOverview } from './BusinessOverview'
import { ServerDashboardPage } from './ServerDashboardPage'
import { useSystemSocket } from '../app/SystemSocketContext'
import './admin.css'
type Audit={id:number;actor:string;action:string;targetType:string;targetId:number;detail:string;createdAt:string}
type ReportFilter='all'|'open'|'review'|'resolved'
type ReportSort='newest'|'oldest'
type ReportCounts=Record<ReportFilter,number>&{user:number}
const reportLabels:{key:ReportFilter;label:string;icon:typeof ShieldAlert}[]=[
  {key:'all',label:'Tất cả',icon:FileWarning},{key:'open',label:'Mới',icon:ShieldAlert},{key:'review',label:'Đang xem xét',icon:AlertTriangle},
  {key:'resolved',label:'Đã xử lý',icon:FileCheck2}
]
function reportSource(source:AdminReport['source']){return source==='CLASS'?'Chat lớp':'Người dùng'}
function reportReason(reason:string){
  const labels:Record<string,string>={
    AUTO_BOT:'Sử dụng bot / auto click',
    HACK:'Can thiệp hệ thống / xem trước đáp án',
    'inappropriate language':'Ngôn ngữ không phù hợp',
    inpropriate:'Ngôn ngữ không phù hợp',
    queue_dodged:'Rời hàng chờ / né ghép trận',
    INVALID_PROFILE:'Tên hoặc avatar vi phạm'
  }
  return labels[reason.trim()]||reason
}
function reportStatus(status:string){return status==='OPEN'?'Mới':status==='IN_PROGRESS'?'Đang xem xét':'Đã xử lý'}
function roleLabel(role:string){return role==='ADMIN'?'Admin':role==='TEACHER'?'Giáo viên':role==='LEARNER'?'Học sinh':'Không xác định'}

// Thanh phân trang dùng chung cho bảng tài khoản và nhật ký
function UsersPanel({users,presence,filter,setFilter,busy,onLock}:{users:AdminUser[];presence:Map<number,number>;filter:string;setFilter:(value:string)=>void;busy:boolean;onLock:(user:AdminUser)=>void}){
  const [roleFilter,setRoleFilter]=useState<'all'|'ADMIN'|'TEACHER'|'LEARNER'|'locked'>('all'),[page,setPage]=useState(1)
  const visible=users.filter(user=>`${user.username} ${user.displayName}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).filter(user=>roleFilter==='all'||(roleFilter==='locked'?user.locked:user.role===roleFilter))
  const pages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE)),current=Math.min(page,pages),rows=visible.slice((current-1)*PAGE_SIZE,current*PAGE_SIZE)
  useEffect(()=>setPage(1),[filter,roleFilter])
  const counts={all:users.length,ADMIN:users.filter(user=>user.role==='ADMIN').length,TEACHER:users.filter(user=>user.role==='TEACHER').length,LEARNER:users.filter(user=>user.role==='LEARNER').length,locked:users.filter(user=>user.locked).length}
  return <section className="card feature-card users-board"><div className="users-board-head"><div><span className="section-label">QUẢN LÝ TÀI KHOẢN</span><h2>Tài khoản hệ thống</h2><p className="muted">Vai trò chỉ được hiển thị. Trạng thái online dựa trên phiên kết nối thực tế.</p></div><span className="users-total">{visible.length} tài khoản</span></div><div className="users-filters" role="tablist" aria-label="Lọc tài khoản">{([['all','Tất cả'],['ADMIN','Admin'],['TEACHER','Giáo viên'],['LEARNER','Học sinh'],['locked','Đã khóa']] as const).map(([key,label])=><button type="button" role="tab" aria-selected={roleFilter===key} className={roleFilter===key?'active':''} onClick={()=>setRoleFilter(key)} key={key}>{label}<b>{counts[key]}</b></button>)}</div><div className="table-wrap"><table className="users-table"><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>XP / Cấp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map(user=><tr key={user.id}><td><div className="user-cell"><span className="user-avatar">{user.displayName.slice(0,1).toUpperCase()}</span><span><strong>{user.displayName}</strong><small>{user.username}</small></span></div></td><td><span className={`role-badge ${user.role.toLowerCase()}`}>{roleLabel(user.role)}</span></td><td>{user.role==='LEARNER'?`${user.totalXp} / Cấp ${Math.floor(user.totalXp/1000)+1}`:<span className="muted">—</span>}</td><td><span className={`presence-status ${presence.has(user.id)?'online':'offline'} ${user.locked?'locked':''}`}><i/>{user.locked?'Đã khóa':presence.has(user.id)?'Đang online':'Offline'}</span></td><td><div className="user-actions"><button type="button" className={`button ${user.locked?'unlock-button':'lock-button'}`} disabled={busy} onClick={()=>onLock(user)}>{user.locked?<Unlock size={15}/>:<Lock size={15}/>} {user.locked?'Mở khóa':'Khóa'}</button><span className="reset-password-disabled" title="Backend chưa hỗ trợ reset mật khẩu">Reset MK</span></div></td></tr>)}</tbody></table></div>{!rows.length&&<div className="users-empty"><UsersRound size={28}/><strong>Không tìm thấy tài khoản</strong><span>Không có tài khoản phù hợp với bộ lọc hiện tại.</span>{(filter||roleFilter!=='all')&&<button type="button" className="button secondary" onClick={()=>{setFilter('');setRoleFilter('all')}}>Xóa bộ lọc</button>}</div>}<Pagination total={visible.length} page={current} onPageChange={setPage}/></section>
}

// Nhật ký quản trị: tìm kiếm + phân trang, cùng phong cách với bảng tài khoản
function AuditPanel({audit}:{audit:Audit[]}){
  const [search,setSearch]=useState(''),[page,setPage]=useState(1)
  const visible=audit.filter(item=>`${item.actor} ${item.action} ${item.targetType} ${item.detail}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const pages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE)),current=Math.min(page,pages),rows=visible.slice((current-1)*PAGE_SIZE,current*PAGE_SIZE)
  useEffect(()=>setPage(1),[search])
  return (
    <section className="card feature-card audit-board">
      <div className="users-board-head">
        <div>
          <span className="section-label">NHẬT KÝ QUẢN TRỊ</span>
          <h2>Nhật ký Admin</h2>
          <p className="muted">Lịch sử các thao tác quản trị trên hệ thống, mới nhất ở trên cùng.</p>
        </div>
        <span className="users-total">{visible.length} bản ghi</span>
      </div>
      <div className="audit-toolbar">
        <div className="report-search"><Search size={16}/><input aria-label="Tìm trong nhật ký" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tìm người thực hiện, hành động hoặc chi tiết"/></div>
      </div>
      {rows.length?(
        <div className="table-wrap">
          <table className="audit-table">
            <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
            <tbody>
              {rows.map(item=>{
                const when=new Date(item.createdAt)
                return (
                  <tr key={item.id}>
                    <td><div className="audit-time"><strong>{when.toLocaleDateString('vi-VN')}</strong><small>{when.toLocaleTimeString('vi-VN')}</small></div></td>
                    <td><div className="user-cell"><span className="user-avatar">{item.actor.slice(0,1).toUpperCase()}</span><span><strong>{item.actor}</strong></span></div></td>
                    <td><span className="audit-action">{item.action}</span></td>
                    <td><span className="audit-target">{item.targetType}<small>#{item.targetId}</small></span></td>
                    <td><p className="audit-detail">{item.detail||'—'}</p></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ):(
        <div className="users-empty">
          <ScrollText size={28}/>
          <strong>{audit.length?'Không có bản ghi phù hợp':'Chưa có nhật ký'}</strong>
          <span>{audit.length?'Hãy thử đổi từ khóa tìm kiếm.':'Các thao tác quản trị sẽ xuất hiện tại đây.'}</span>
          {search&&<button type="button" className="button secondary" onClick={()=>setSearch('')}>Xóa tìm kiếm</button>}
        </div>
      )}
      <Pagination total={visible.length} page={current} onPageChange={setPage}/>
    </section>
  )
}

function ReportsPanel({reports,visibleReports,counts,filter,setFilter,search,setSearch,sort,setSort,busy,connected,onView,onDecide}:{reports:AdminReport[];visibleReports:AdminReport[];counts:ReportCounts;filter:ReportFilter;setFilter:(value:ReportFilter)=>void;search:string;setSearch:(value:string)=>void;sort:ReportSort;setSort:(value:ReportSort)=>void;busy:boolean;connected:boolean;onView:(report:AdminReport)=>void;onDecide:(report:AdminReport,action:string)=>void}){
  return <section className="admin-reports">
    <div className="report-kpi-grid"><article><ShieldAlert/><strong>{counts.open}</strong><span>Báo cáo mới</span></article><article><AlertTriangle/><strong>{counts.review}</strong><span>Đang xem xét</span></article><article><FileCheck2/><strong>{counts.resolved}</strong><span>Đã xử lý</span></article></div>
    <section className="card feature-card report-board"><div className="report-board-head"><div><span className="section-label">BÁO CÁO & AN TOÀN CỘNG ĐỒNG</span><h2>Xử lý vi phạm</h2><p className="muted">Tiếp nhận, phân loại và xử lý báo cáo được đồng bộ qua WebSocket.</p></div><span className={`report-live ${connected?'online':''}`}><i/>{connected?'Realtime ổn định':'Đang kết nối lại'}</span></div>
      <div className="report-toolbar"><div className="report-search"><Eye size={16}/><input aria-label="Tìm báo cáo" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tìm mã, người dùng hoặc nội dung"/></div><div className="report-sort-wrapper">
  <SlidersHorizontal size={14} />
  <select 
    aria-label="Sắp xếp báo cáo theo thời gian" 
    value={sort} 
    onChange={event => setSort(event.target.value as ReportSort)}
  >
    <option value="newest">Mới nhất</option>
    <option value="oldest">Cũ nhất</option>
  </select>
</div></div>
      <div className="report-filters" role="tablist" aria-label="Lọc báo cáo">{reportLabels.map(({key,label,icon:Icon})=><button type="button" role="tab" aria-selected={filter===key} className={filter===key?'active':''} onClick={()=>setFilter(key)} key={key}><Icon size={15}/>{label}<b>{counts[key]}</b></button>)}</div>
      {!reports.length?<div className="report-empty"><FileWarning size={30}/><strong>Chưa có báo cáo</strong><span>Hiện chưa có báo cáo nào trong hệ thống.</span></div>:!visibleReports.length?<div className="report-empty"><FileWarning size={30}/><strong>Không có báo cáo phù hợp</strong><span>Hãy thử đổi bộ lọc hoặc từ khóa tìm kiếm.</span></div>:<div className="report-list">{visibleReports.map(report=><article className={`report-card ${report.status!=='OPEN'?'resolved':''}`} key={`${report.source}-${report.id}`}><div className="report-card-icon"><FileWarning size={18}/></div><div className="report-card-main"><div className="report-card-top"><strong>#{report.id} · {report.accusedName}</strong><span className={`report-badge ${report.status==='OPEN'?'open':'resolved'}`}>{reportStatus(report.status)}</span></div><div className="report-card-meta"><span>{reportSource(report.source)}</span><span>User #{report.accusedId}</span><time>{new Date(report.createdAt).toLocaleString('vi-VN')}</time></div><p className="report-reason"><b>{reportReason(report.reason)}</b> · {report.messageBody}</p><small>Người báo cáo: User #{report.reporterId}{report.decision?` · Quyết định: ${report.decision}`:''}</small></div><div className="report-card-actions"><button type="button" className="button secondary" onClick={()=>onView(report)}><Eye size={15}/> Chi tiết</button>{report.status==='OPEN'&&<div className="report-action-row">{[['DISMISS','Bỏ qua'],['WARN','Cảnh báo'],['MUTE_24H','Cấm chat 24h'],['LOCK','Khóa tài khoản']].map(([key,label])=><button type="button" className="button secondary" key={key} disabled={busy||!connected} onClick={()=>onDecide(report,key)}>{label}</button>)}</div>}</div></article>)}</div>}
    </section>
  </section>
}
function ReportDetail({report,onClose,onDecide,busy,connected}:{report:AdminReport;onClose:()=>void;onDecide:(report:AdminReport,action:string)=>void;busy:boolean;connected:boolean}){
  return <div className="modal-backdrop"><section className="card report-detail" role="dialog" aria-modal="true" aria-label={`Chi tiết báo cáo #${report.id}`}><header><div><span className="section-label">CHI TIẾT BÁO CÁO</span><h2>#{report.id} · {reportSource(report.source)}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={20}/></button></header><div className="report-detail-status"><span className={`report-badge ${report.status==='OPEN'?'open':'resolved'}`}>{reportStatus(report.status)}</span><span>{new Date(report.createdAt).toLocaleString('vi-VN')}</span></div><div className="report-detail-grid"><div><small>Người bị báo cáo</small><strong>{report.accusedName}</strong><span>User #{report.accusedId}</span></div><div><small>Người báo cáo</small><strong>User #{report.reporterId}</strong><span>{report.source==='USER'?'Báo cáo hành vi người dùng':'Báo cáo nội dung/tin nhắn'}</span></div></div><div className="report-detail-section"><small>Lý do báo cáo</small><p>{reportReason(report.reason)}</p></div><div className="report-detail-section"><small>Nội dung liên quan</small><p>{report.messageBody}</p></div>{report.decision&&<div className="report-detail-section"><small>Quyết định đã ghi nhận</small><p>{report.decision}</p></div>}{report.status==='OPEN'&&<div className="report-detail-actions">{[['DISMISS','Bỏ qua'],['WARN','Cảnh báo'],['MUTE_24H','Cấm chat 24h'],['LOCK','Khóa tài khoản']].map(([key,label])=><button type="button" className="button secondary" disabled={busy||!connected} key={key} onClick={()=>onDecide(report,key)}>{label}</button>)}</div>}</section></div>
}
export function AdminPage(){
  const {subscribe,request,connected}=useSystemSocket()
  const [search]=useSearchParams(),tab=search.get('tab')||'overview'
  const [users,setUsers]=useState<AdminUser[]>([]),[reports,setReports]=useState<AdminReport[]>([])
  const [presence,setPresence]=useState<Map<number,number>>(new Map())
  const [audit,setAudit]=useState<Audit[]>([])
  const [overview,setOverview]=useState<{users:number;classes:number;openReports:number;questions:number}|null>(null)
  const [filter,setFilter]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const [selectedReport,setSelectedReport]=useState<AdminReport|null>(null),[reportFilter,setReportFilter]=useState<ReportFilter>('all'),[reportSearch,setReportSearch]=useState(''),[reportSort,setReportSort]=useState<ReportSort>('newest')
  async function reload(){if(tab==='users')setUsers(await api.adminUsers());else if(tab==='audit')setAudit(await api.adminAudit())}
  useEffect(()=>{reload().catch(e=>setError(e.message))},[tab])
  useEffect(()=>{
    if(tab!=='users'||!connected)return
    let active=true
    const stop=subscribe(message=>{
      if(message.action!=='STATS_UPDATE')return
      const data=message.data as {clients?:{userId:number;lastPongAt?:number}[]}|undefined
      if(!active||!data?.clients)return
      setPresence(new Map(data.clients.map(client=>[client.userId,client.lastPongAt||Date.now()])))
    })
    request('SYSTEM_MONITOR_WATCH','SYSTEM_MONITOR_DATA').catch(e=>{if(active)setError(e.message)})
    return()=>{active=false;stop();setPresence(new Map());void request('SYSTEM_MONITOR_UNWATCH','SYSTEM_MONITOR_DATA').catch(()=>{})}
  },[connected,request,subscribe,tab])
  useEffect(()=>{
    if(!connected||!['overview','reports'].includes(tab))return
    let active=true
    const update=(data:{reports:AdminReport[];overview:NonNullable<typeof overview>})=>{setReports(data.reports);setOverview(data.overview)}
    const stop=subscribe(message=>{
      if(!active)return
      const payload=message.payload as {kind?:string;data:{reports:AdminReport[];overview:NonNullable<typeof overview>};message:string} | undefined
      if(message.action==='WORKSPACE_UPDATE'&&payload?.kind==='REPORTS')update(payload!.data)
      if(message.action==='WORKSPACE_ERROR'){setReports([]);setOverview(null);setError(payload?.message||'Không thể cập nhật dữ liệu')}
    })
    request<{reports:AdminReport[];overview:NonNullable<typeof overview>}>('ADMIN_REPORTS_WATCH','WORKSPACE_DATA').then(data=>{if(active)update(data)}).catch(e=>{if(active)setError(e.message)})
    return()=>{active=false;stop();void request('WORKSPACE_UNWATCH','WORKSPACE_DATA').catch(()=>{})}
  },[connected,request,subscribe,tab])
  async function act(work:()=>Promise<unknown>,message:string,refresh=true){setBusy(true);setError('');try{await work();if(refresh)await reload();setNotice(message)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  function decide(report:AdminReport,action:string){const note=window.prompt('Ghi chú xử lý (tối đa 500 ký tự):','');if(note===null)return;if(note.length>500){setError('Ghi chú xử lý không được vượt quá 500 ký tự.');return}void act(()=>request('ADMIN_REPORT_DECIDE','REPORT_DECISION_DATA',{reportId:report.id,action,note,source:report.source}),'Đã xử lý báo cáo.',false)}
  function lockUser(user:AdminUser){const action=user.locked?'Mở khóa':'Khóa';if(window.confirm(`Bạn có chắc muốn ${action.toLowerCase()} tài khoản ${user.username}?`))void act(()=>api.adminLock(user.id,!user.locked),`Đã ${action.toLowerCase()} tài khoản.`)}
  const reportCounts=useMemo(()=>{
    const userReports=reports.filter(report=>report.source!=='CLASS')
    return {all:userReports.length,open:userReports.filter(r=>r.status==='OPEN').length,review:userReports.filter(r=>r.status==='IN_PROGRESS').length,resolved:userReports.filter(r=>r.status==='RESOLVED').length,user:userReports.length}
  },[reports])
  const visibleReports=useMemo(()=>reports.filter(report=>report.source!=='CLASS').filter(report=>{
    const matchesSearch=`${report.id} ${report.reason} ${report.messageBody} ${report.accusedName} ${report.accusedId} ${report.reporterId}`.toLocaleLowerCase().includes(reportSearch.toLocaleLowerCase())
    const matchesFilter=reportFilter==='all'||(reportFilter==='open'&&report.status==='OPEN')||(reportFilter==='review'&&report.status==='IN_PROGRESS')||(reportFilter==='resolved'&&report.status==='RESOLVED')
    return matchesSearch&&matchesFilter
  }).sort((a,b)=>{
    const difference=new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()
    return reportSort==='oldest'?difference:-difference
  }),[reports,reportFilter,reportSearch,reportSort])
  const dashboardCards=overview?[
    {label:'Tổng tài khoản',value:overview.users,detail:'Người dùng trong hệ thống',icon:UsersRound,tone:'purple'},
    {label:'Báo cáo cần xử lý',value:overview.openReports,detail:'Yêu cầu đang chờ xem xét',icon:AlertTriangle,tone:'danger'},
  ]:[], tabTitle=tab==='users'?'Quản lý tài khoản':tab==='reports'?'Báo cáo vi phạm':tab==='support'?'Hỗ trợ người dùng':tab==='audit'?'Nhật ký Admin':'Tổng quan quản trị'
  return <Layout title={tabTitle}><div className="admin-page">
    <div className="admin-breadcrumb"><span>Hệ thống</span><ArrowRight size={14}/><strong>{tabTitle}</strong></div>
    {error&&<p className="error-banner" role="alert">{error}</p>}{notice&&<p className="success-banner" role="status">{notice}</p>}
    {tab==='overview'&&<><div className="admin-kpi-grid">{dashboardCards.map(({label,value,detail,icon:Icon,tone})=><article className={`admin-kpi-card ${tone}`} key={label}><div className="admin-kpi-top"><span>{label}</span><i><Icon size={20}/></i></div><strong>{value}</strong><small>{detail}</small></article>)}</div><ServerDashboardPage/><BusinessOverview/></>}
    {tab==='users'&&<input className="search-input" aria-label="Tìm kiếm" placeholder="Tìm theo tên hoặc tài khoản…" value={filter} onChange={e=>setFilter(e.target.value)}/>}
    {tab==='users'&&<UsersPanel users={users} presence={presence} filter={filter} setFilter={setFilter} busy={busy} onLock={lockUser}/>}
    {tab==='reports'&&<ReportsPanel reports={reports} visibleReports={visibleReports} counts={reportCounts} filter={reportFilter} setFilter={setReportFilter} search={reportSearch} setSearch={setReportSearch} sort={reportSort} setSort={setReportSort} busy={busy} connected={connected} onView={setSelectedReport} onDecide={decide}/>}
    {tab==='support'&&<SupportInbox/>}
    {tab==='audit'&&<AuditPanel audit={audit}/>}
    {selectedReport&&<ReportDetail report={selectedReport} onClose={()=>setSelectedReport(null)} onDecide={decide} busy={busy} connected={connected}/>}
  </div></Layout>
}