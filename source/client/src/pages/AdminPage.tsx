import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { api } from '../services/api'
import type { AdminContent, AdminUser, AdminReport } from '../types'
import { SupportInbox } from '../components/SupportChat'
import { AdminStudyContent } from '../components/AdminStudyContent'
import { BusinessOverview } from './BusinessOverview'
import { ServerDashboardPage } from './ServerDashboardPage'
import { useSystemSocket } from '../app/SystemSocketContext'
type Audit={id:number;actor:string;action:string;targetType:string;targetId:number;detail:string;createdAt:string}
export function AdminPage(){
  const {subscribe,request,connected}=useSystemSocket()
  const [search]=useSearchParams(),tab=search.get('tab')||'overview'
  const [users,setUsers]=useState<AdminUser[]>([]),[reports,setReports]=useState<AdminReport[]>([])
  const [content,setContent]=useState<AdminContent>({lessons:[],questions:[]}),[audit,setAudit]=useState<Audit[]>([])
  const [overview,setOverview]=useState<{users:number;classes:number;openReports:number;questions:number}|null>(null)
  const [filter,setFilter]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const [selected,setSelected]=useState<AdminUser|null>(null)
  async function reload(){if(tab==='users')setUsers(await api.adminUsers());else if(tab==='content')setContent(await api.adminContent());else if(tab==='audit')setAudit(await api.adminAudit())}
  useEffect(()=>{reload().catch(e=>setError(e.message));return subscribe(message=>{if(message.action==='CURRICULUM_CHANGED'&&['content','audit'].includes(tab))void reload().catch(e=>setError(e.message))})},[tab,subscribe,connected])
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
  const match=(value:string)=>value.toLocaleLowerCase().includes(filter.toLocaleLowerCase())
  return <Layout title="Quản trị ứng dụng"><div className="page-heading"><div><span className="section-label">BUSINESS ADMINISTRATION</span><h1>Quản trị ứng dụng</h1><p>Quản lý tài khoản, kiểm duyệt nội dung và xử lý vi phạm.</p></div></div>
    {error&&<p className="error-banner" role="alert">{error}</p>}{notice&&<p className="success-banner" role="status">{notice}</p>}
    {tab==='overview'&&<><ServerDashboardPage/>{overview&&<div className="metric-grid">{[[overview.users,'Tài khoản'],[overview.classes,'Lớp học'],[overview.openReports,'Báo cáo chờ'],[overview.questions,'Câu hỏi']].map(([value,label])=><div className="card metric-card" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>}<BusinessOverview/></>}
    {['users','content'].includes(tab)&&<input className="search-input" aria-label="Tìm kiếm" placeholder="Tìm tên, nội dung hoặc ID…" value={filter} onChange={e=>setFilter(e.target.value)}/>}
    {tab==='users'&&<section className="card feature-card"><h2>Quản lý tài khoản</h2><div className="table-wrap"><table><thead><tr><th>ID / Tài khoản</th><th>Vai trò</th><th>XP / Cấp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{users.filter(u=>match(`${u.id} ${u.username} ${u.displayName} ${u.role}`)).map(u=><tr key={u.id}><td>#{u.id} <strong>{u.displayName}</strong><small>{u.username}</small></td><td><select aria-label={`Vai trò ${u.username}`} disabled={busy} value={u.role} onChange={e=>{const role=e.target.value;if(window.confirm(`Đổi vai trò ${u.username} thành ${role}?`))void act(()=>api.adminRole(u.id,role),'Đã đổi vai trò.')}}><option value="LEARNER">Học sinh</option><option value="TEACHER">Giáo viên</option><option value="ADMIN">Admin</option></select></td><td>{u.totalXp} / Cấp {Math.floor(u.totalXp/1000)+1}</td><td>{u.locked?'Đã khóa':'Hoạt động'}</td><td><button className="button secondary" onClick={()=>setSelected(u)}>Hồ sơ</button> <button className="button secondary" disabled={busy} onClick={()=>{if(window.confirm(`${u.locked?'Mở khóa':'Khóa'} ${u.username}?`))void act(()=>api.adminLock(u.id,!u.locked),'Đã cập nhật tài khoản.')}}>{u.locked?'Mở khóa':'Khóa'}</button></td></tr>)}</tbody></table></div></section>}
    {tab==='content'&&<><AdminStudyContent filter={filter}/><section className="card feature-card"><h2>Bài học luyện tập / lớp học</h2><p>Xóa mềm giữ lịch sử học tập. Soạn thảo nội dung nằm tại khu vực giáo viên.</p><div className="table-wrap"><table><thead><tr><th>Bài học</th><th>Chủ đề / Độ khó</th><th>Trạng thái</th><th>Kiểm duyệt</th></tr></thead><tbody>{content.lessons.filter(l=>match(`${l.id} ${l.title} ${l.topicSlug}`)).map(l=><tr key={l.id}><td><strong>#{l.id} {l.title}</strong><details><summary>Xem nội dung</summary><p>{l.summary}</p><p>{l.theory}</p></details></td><td>{l.topicSlug} / {l.difficulty}</td><td>{l.published?'Xuất bản':'Đã ẩn'}</td><td><button className="button secondary" disabled={busy} onClick={()=>void act(()=>api.adminPublishLesson(l.id,!l.published),'Đã cập nhật bài học.')}>{l.published?'Ẩn':'Xuất bản'}</button> <button className="button secondary" disabled={busy} onClick={()=>{if(window.confirm(`Xóa bài #${l.id} và câu hỏi thuộc bài?`))void act(()=>api.adminDeleteLesson(l.id),'Đã xóa mềm bài học.')}}>Xóa</button></td></tr>)}</tbody></table></div></section>
    <section className="card feature-card"><h2>Câu hỏi luyện tập / lớp học</h2><div className="table-wrap"><table><thead><tr><th>Câu hỏi</th><th>Phạm vi</th><th>Trạng thái</th><th>Kiểm duyệt</th></tr></thead><tbody>{content.questions.filter(q=>match(`${q.id} ${q.prompt} ${q.lessonId}`)).map(q=><tr key={q.id}><td>#{q.id} {q.prompt}<small>Bài {q.lessonId}</small><details><summary>Đáp án / giải thích</summary><p>{q.optionA} · {q.optionB} · {q.optionC} · {q.optionD}</p><p>{q.questionType && q.questionType!=='MCQ'?q.acceptedAnswer:q.correctOption} · {q.explanation}</p></details></td><td>{q.ownerId?`Riêng · GV #${q.ownerId}`:'Chung'}</td><td>{q.ownerId?(q.published?'Admin cho phép':'Admin chặn'):q.published?'Đang mở':'Đã ẩn'}</td><td><button className="button secondary" disabled={busy} onClick={()=>void act(()=>api.adminPublishQuestion(q.id,!q.published),'Đã kiểm duyệt câu hỏi.')}>{q.published?'Ẩn':'Mở'}</button> <button className="button secondary" disabled={busy} onClick={()=>{if(window.confirm(`Xóa câu hỏi #${q.id}?`))void act(()=>api.adminDeleteQuestion(q.id),'Đã xóa mềm câu hỏi.')}}>Xóa</button></td></tr>)}</tbody></table></div></section></>}
    {tab==='reports'&&<section className="card feature-card"><h2>Xử lý vi phạm</h2><p className="muted">Hiển thị tối đa 200 báo cáo, ưu tiên những báo cáo đang chờ xử lý. Dữ liệu được đồng bộ qua WebSocket.</p>{reports.length===0&&<p>Chưa có báo cáo.</p>}{reports.map(r=><div className="report-row" key={`${r.source}-${r.id}`}><div><strong>#{r.id} · {r.accusedName} (User #{r.accusedId}) · {r.source}</strong><small>Người gửi báo cáo: User #{r.reporterId}</small><p>{r.messageBody}</p><small>Lý do: {r.reason} · {new Date(r.createdAt).toLocaleString('vi-VN')}</small><p>{r.status} · {r.decision}</p></div>{r.status==='OPEN'&&<div className="button-row">{[['DISMISS','Bỏ qua'],['WARN','Cảnh báo'],['MUTE_24H','Cấm chat 24h'],['LOCK','Khóa tài khoản']].map(([key,label])=><button key={key} className="button secondary" disabled={busy||!connected} onClick={()=>decide(r,key)}>{label}</button>)}</div>}</div>)}</section>}
    {tab==='support'&&<SupportInbox/>}
    {tab==='audit'&&<section className="card feature-card"><h2>Nhật ký Admin & Giáo viên</h2><div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>{audit.map(a=><tr key={a.id}><td>{new Date(a.createdAt).toLocaleString('vi-VN')}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.targetType} #{a.targetId}</td><td>{a.detail}</td></tr>)}</tbody></table></div></section>}
    {selected&&<div className="modal-backdrop"><section className="card modal-card" role="dialog" aria-modal="true" aria-label="Hồ sơ tài khoản"><h2>{selected.displayName}</h2><p>ID: {selected.id} · {selected.username}</p><p>{selected.role} · {selected.totalXp} XP · Cấp {Math.floor(selected.totalXp/1000)+1}</p><p>Đăng ký: {new Date(selected.createdAt).toLocaleString('vi-VN')}</p><button className="button secondary" onClick={()=>setSelected(null)}>Đóng</button></section></div>}
  </Layout>
}
