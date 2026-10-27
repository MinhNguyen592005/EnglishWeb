import { ArrowRight, Award, Check, Clock3, Crown, Gem, Palette, Pencil, School, Shield, Sparkles, Trophy, UsersRound, ClipboardList, HelpCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { Layout } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import { api } from '../services/api'
import type { Attempt } from '../types'
import './profile.css'

export function ProfilePage() {
  const { user } = useAuth()
  return user?.role === 'TEACHER' ? <TeacherProfilePage/> : <LearnerProfilePage/>
}
function TeacherProfilePage() {
  const { user } = useAuth()
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.teacherOverview>> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.teacherOverview().then(setOverview).catch(error => setError(error.message))
  }, [])
  const initial = user?.displayName.slice(0, 1).toUpperCase() || 'G'
  return <Layout title="Hồ sơ giáo viên"><div className="teacher-profile-page">
    <section className="teacher-profile-hero">
      <div className="teacher-profile-orbit" aria-hidden="true"/>
      <div className="teacher-profile-identity">
        <div className="teacher-profile-avatar" aria-hidden="true">{initial}</div>
        <div>
          <span className="section-label">HỒ SƠ GIÁO VIÊN</span>
          <h1>{user?.displayName}</h1>
          <p><strong>@{user?.username}</strong><span>·</span><span className="teacher-role"><School size={15}/> Giáo viên</span></p>
        </div>
      </div>
      <div className="teacher-profile-badge"><Shield size={16}/> Tài khoản đang hoạt động</div>
    </section>
    {error&&<div className="error-banner" role="alert">{error}<button className="button secondary" onClick={()=>{setError('');api.teacherOverview().then(setOverview).catch(error=>setError(error.message))}}>Tải lại</button></div>}
    <div className="teacher-profile-layout">
      <main className="teacher-profile-main">
        <section className="card teacher-profile-card">
          <div className="teacher-profile-card-heading"><div><span className="section-label">THÔNG TIN TÀI KHOẢN</span><h2>Thông tin cá nhân</h2><p className="muted">Thông tin định danh được đồng bộ từ tài khoản đăng nhập.</p></div><School size={24}/></div>
          <dl className="teacher-profile-details"><div><dt>Tên hiển thị</dt><dd>{user?.displayName}</dd></div><div><dt>Tên đăng nhập</dt><dd className="teacher-profile-mono">@{user?.username}</dd></div><div><dt>Vai trò</dt><dd><span className="teacher-profile-role"><Shield size={14}/> Giáo viên</span></dd></div><div><dt>Trạng thái</dt><dd><span className="teacher-profile-status"><span/>Đang hoạt động</span></dd></div></dl>
          <p className="teacher-profile-note"><HelpCircle size={16}/> Username và vai trò được khóa để bảo vệ quyền truy cập. Liên hệ quản trị viên nếu cần thay đổi thông tin tài khoản.</p>
        </section>
        <section className="card teacher-profile-card">
          <div className="teacher-profile-card-heading"><div><span className="section-label">KHÔNG GIAN GIẢNG DẠY</span><h2>Công cụ nhanh</h2><p className="muted">Đi tới đúng khu vực để tiếp tục công việc.</p></div></div>
          <div className="teacher-profile-actions"><Link className="teacher-profile-action primary" to="/teacher"><span><School size={20}/></span><div><strong>Tổng quan giảng dạy</strong><small>Xem các việc cần xử lý</small></div><ArrowRight size={17}/></Link><Link className="teacher-profile-action" to="/classes"><span><UsersRound size={20}/></span><div><strong>Quản lý lớp học</strong><small>Lớp, thành viên và điểm số</small></div><ArrowRight size={17}/></Link><Link className="teacher-profile-action" to="/teacher/questions"><span><HelpCircle size={20}/></span><div><strong>Ngân hàng câu hỏi</strong><small>Soạn và quản lý câu hỏi</small></div><ArrowRight size={17}/></Link></div>
        </section>
      </main>
      <aside className="teacher-profile-side">
        <section className="card teacher-profile-card"><div className="teacher-profile-card-heading compact"><div><span className="section-label">THỐNG KÊ</span><h2>Hoạt động giảng dạy</h2></div><Award size={22}/></div>{overview?<div className="teacher-profile-stats"><Link to="/classes"><UsersRound size={19}/><span><strong>{overview.classes}</strong><small>Lớp đang quản lý</small></span><ArrowRight size={15}/></Link><Link to="/classes"><School size={19}/><span><strong>{overview.students}</strong><small>Học viên</small></span><ArrowRight size={15}/></Link><Link to="/classes"><ClipboardList size={19}/><span><strong>{overview.openAssignments}</strong><small>Nhiệm vụ đang mở</small></span><ArrowRight size={15}/></Link><Link to="/teacher/questions"><HelpCircle size={19}/><span><strong>{overview.questions}</strong><small>Câu hỏi đã tạo</small></span><ArrowRight size={15}/></Link></div>:<Loading/>}</section>
        <section className="card teacher-profile-card teacher-profile-security"><div className="teacher-profile-card-heading compact"><div><span className="section-label">BẢO MẬT</span><h2>Tài khoản an toàn</h2></div><Shield size={22}/></div><p>Phiên đăng nhập được bảo vệ bằng session và CSRF. Không hiển thị hoặc lưu mật khẩu trên trang hồ sơ.</p><Link className="text-link" to="/teacher">Mở không gian giảng dạy <ArrowRight size={15}/></Link></section>
      </aside>
    </div>
  </div></Layout>
}
function LearnerProfilePage() {
  const { user } = useAuth()
  const [history, setHistory] = useState<Attempt[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('Tân binh không gian')
  const [frame, setFrame] = useState('orbit')
  const [accent, setAccent] = useState('indigo')
  const titles = ['Tân binh không gian', 'Thợ săn XP', 'Chiến binh PvP']
  const frames = [
    { id: 'orbit', name: 'Blue Orbit', rarity: 'Đã mở khóa', icon: '◈' },
    { id: 'solar', name: 'Solar Gold', rarity: '800 XP PvP', icon: '✦' },
    { id: 'nova', name: 'Nova Crown', rarity: '1.500 XP PvP', icon: '◆' }
  ]
  const badges = [
    { name: 'First Victory', detail: 'Thắng trận PvP đầu tiên', icon: <Trophy size={18}/>, unlocked: true },
    { name: 'Grammar Explorer', detail: 'Hoàn thành 5 bài học', icon: <Sparkles size={18}/>, unlocked: true },
    { name: 'Arena Veteran', detail: 'Đạt 1.000 XP PvP', icon: <Shield size={18}/>, unlocked: false }
  ]
  useEffect(() => { api.history().then(setHistory).catch(e => setError(e.message)) }, [])
  return <Layout title="Hồ sơ"><div className="profile-page">
    <section className={`profile-hero profile-accent-${accent}`}>
      <div className={`profile-avatar profile-frame-${frame}`}><span>{user?.displayName.slice(0, 1).toUpperCase()}</span><Gem size={16}/></div>
      <div className="profile-hero-copy"><span className="section-label">HỒ SƠ PHI HÀNH GIA</span><h1>{user?.displayName}</h1><p>@{user?.username} · <strong>{title}</strong></p><div className="profile-hero-meta"><span><Trophy size={15}/> Cấp {user?.level}</span><span><Sparkles size={15}/> {user?.totalXp} EXP</span><span><Shield size={15}/> 640 XP PvP <em>demo</em></span></div></div>
      <button className="profile-edit-button" onClick={()=>setEditing(true)}><Pencil size={16}/> Chỉnh sửa thông tin</button>
    </section>
    <div className="profile-stat-grid"><section className="card profile-mini-stat"><Trophy size={20}/><strong>Cấp {user?.level}</strong><span>{user?.xpInLevel}/1.000 XP cấp hiện tại</span></section><section className="card profile-mini-stat profile-pvp-stat"><Shield size={20}/><strong>640 XP PvP</strong><span>8 trận · 62% thắng · dữ liệu demo</span></section><section className="card profile-mini-stat"><Award size={20}/><strong>{badges.filter(b=>b.unlocked).length} huy hiệu</strong><span>Đã mở khóa</span></section></div>
    <div className="profile-cosmetic-grid">
      <section className="card profile-section"><div className="profile-section-heading"><div><span className="section-label">COSMETIC</span><h2>Khung & danh hiệu</h2></div><Palette size={22}/></div><div className="profile-frame-list">{frames.map(item=><button key={item.id} className={`profile-frame-option ${frame===item.id?'selected':''}`} onClick={()=>{setFrame(item.id);setEditing(true)}}><span className={`profile-option-icon profile-frame-${item.id}`}>{item.icon}</span><span><strong>{item.name}</strong><small>{item.rarity}</small></span>{frame===item.id&&<Check size={17}/>}</button>)}</div><div className="profile-title-chips">{titles.map(item=><button key={item} className={title===item?'selected':''} onClick={()=>{setTitle(item);setEditing(true)}}>{item}{title===item&&<Check size={14}/>}</button>)}</div></section>
      <section className="card profile-section"><div className="profile-section-heading"><div><span className="section-label">BADGE SHOWCASE</span><h2>Huy hiệu nổi bật</h2></div><Crown size={22}/></div><div className="profile-badge-list">{badges.map(b=><div className={`profile-badge ${!b.unlocked?'locked':''}`} key={b.name}><span className="profile-badge-icon">{b.icon}</span><div><strong>{b.name}</strong><small>{b.detail}</small></div>{b.unlocked?<Check size={16}/>:<Shield size={16}/>}</div>)}</div></section>
    </div>
    <section className="card profile-rewards"><div><span className="section-label">ARENA REWARDS</span><h2>Phần thưởng từ XP PvP</h2><p className="muted">Tích lũy XP PvP để mở khóa khung, danh hiệu và badge mới.</p></div><div className="profile-reward-track"><span className="profile-reward-node claimed">640</span><div><strong>Blue Orbit</strong><small>Đã mở khóa · 500 XP PvP</small></div><span className="profile-reward-node">800</span><div><strong>Solar Gold</strong><small>Còn 160 XP để mở khóa</small></div><span className="profile-reward-node">1500</span></div></section>
    <section className="card profile-history"><h2>Lịch sử học tập</h2>{!history ? error ? <ErrorState message={error}/> : <Loading/> : history.length ? history.map(a => <Link to={a.status==='IN_PROGRESS'?`/attempts/${a.id}`:`/attempts/${a.id}/result`} key={a.id} className="history-row"><div className="card-icon purple"><Clock3 size={20}/></div><div><strong>{a.kind==='PRACTICE'?'Luyện tập':a.kind==='CHAPTER_BOSS'?'Boss cuối chương':'Boss bài học'}</strong><span>{a.correctCount}/{a.totalQuestions} câu đúng · {a.status==='IN_PROGRESS'?'Đang làm':a.status==='WON'?'Hoàn thành':'Chưa đạt'}</span></div><ArrowRight size={18}/></Link>) : <div className="empty-state">Chưa có lượt làm nào. <Link to="/practice">Bắt đầu luyện tập</Link></div>}</section>
    {editing&&<div className="profile-editor-backdrop" role="presentation" onClick={()=>setEditing(false)}><section className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" onClick={e=>e.stopPropagation()}><button className="profile-editor-close" onClick={()=>setEditing(false)} aria-label="Đóng"><X size={18}/></button><span className="section-label">CUSTOMIZE PROFILE</span><h2 id="profile-editor-title">Chỉnh sửa thông tin</h2><p className="muted">Đây là bản xem trước tĩnh. Cosmetic sẽ kết nối phần thưởng PvP sau.</p><label>Danh hiệu<select value={title} onChange={e=>setTitle(e.target.value)}>{titles.map(item=><option key={item}>{item}</option>)}</select></label><label>Khung avatar<select value={frame} onChange={e=>setFrame(e.target.value)}>{frames.map(item=><option key={item.id} value={item.id}>{item.name} · {item.rarity}</option>)}</select></label><label>Màu hồ sơ<select value={accent} onChange={e=>setAccent(e.target.value)}><option value="indigo">Indigo Orbit</option><option value="emerald">Emerald Nova</option><option value="gold">Solar Gold</option></select></label><button className="button primary profile-save" onClick={()=>setEditing(false)}>Lưu lựa chọn</button></section></div>}
  </div></Layout>
}
export function NotFound() { const { user }=useAuth(); return <Layout title="Không tìm thấy"><div className="state-card"><h1>404 · Không tìm thấy trang</h1><p>Đường dẫn này không tồn tại.</p><Link className="button primary" to={user?.role==='TEACHER'?'/teacher':'/dashboard'}>Về tổng quan</Link></div></Layout> }
export function Forbidden() { const { user }=useAuth(); return <Layout title="Không có quyền"><div className="state-card"><h1>403 · Không có quyền truy cập</h1><p>Tài khoản của bạn không được phép mở nội dung này.</p><Link className="button primary" to={user?.role==='TEACHER'?'/teacher':'/dashboard'}>Về tổng quan</Link></div></Layout> }
