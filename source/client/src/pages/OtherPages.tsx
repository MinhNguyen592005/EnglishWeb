import { ArrowRight, Award, Clock3, Flame, Rocket, School, Swords, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { Layout } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import { api } from '../services/api'
import type { Attempt } from '../types'

export function ProfilePage() {
  const { user } = useAuth()
  return user?.role === 'TEACHER' ? <TeacherProfilePage/> : <LearnerProfilePage/>
}
function TeacherProfilePage() {
  const { user } = useAuth()
  return <Layout title="Hồ sơ giáo viên"><div className="page-heading"><div><span className="section-label">HỒ SƠ GIÁO VIÊN</span><h1>{user?.displayName}</h1><p>Tên đăng nhập: {user?.username}</p></div><div className="heading-icon"><School size={36}/></div></div><section className="card feature-card"><h2>Không gian giảng dạy</h2><p className="muted">Quản lý lớp học, bài giao và ngân hàng câu hỏi của bạn.</p><div className="button-row"><Link className="button primary" to="/teacher">Xem tổng quan</Link><Link className="button secondary" to="/classes">Quản lý lớp</Link><Link className="button secondary" to="/teacher/questions">Soạn câu hỏi</Link></div></section></Layout>
}
function LearnerProfilePage() {
  const { user } = useAuth()
  const [history, setHistory] = useState<Attempt[] | null>(null)
  const [streak, setStreak] = useState<{ currentStreak: number; longestStreak: number; completedToday: boolean } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.history().then(setHistory).catch(e => setError(e.message))
    api.dailyStreak().then(setStreak).catch(() => {})
  }, [])
  return <Layout title="Hồ sơ"><div className="page-heading"><div><span className="section-label">HỒ SƠ PHI HÀNH GIA</span><h1>{user?.displayName}</h1><p>Tên đăng nhập: {user?.username}</p></div><div className="heading-icon"><Rocket size={36}/></div></div><div className="profile-grid"><div style={{display:'grid',gap:20,alignContent:'start'}}><section className="card profile-stat"><Trophy size={28}/><strong>Cấp {user?.level}</strong><p>{user?.totalXp} EXP tích lũy</p><div className="progress-track xp"><div style={{width:`${(user?.xpInLevel||0)/10}%`}}/></div><small>{user?.xpInLevel}/1.000 EXP trong cấp này</small></section><section className="card profile-stat"><Swords size={28} color="#4b57c9"/><strong>Hạng {user?.pvpRankTitle || 'Đồng'} · {user?.pvpElo ?? 1000} ELO</strong><p>Thắng {user?.pvpWins ?? 0} · Thua {user?.pvpLosses ?? 0} · Hòa {user?.pvpDraws ?? 0}</p><small><Award size={13} style={{display:'inline',verticalAlign:'middle'}}/> Đỉnh ELO: {user?.pvpPeakElo ?? 1000} · <Link to="/arena" style={{color:'var(--primary-strong)',fontWeight:700}}>Khung &amp; Bảng xếp hạng</Link></small></section><section className="card profile-stat"><Flame size={28} color="#f59e0b"/><strong>Chuỗi {streak?.currentStreak || 0} ngày</strong><p>Kỷ lục: {streak?.longestStreak || 0} ngày liên tiếp</p><small>{streak?.completedToday ? '✓ Đã duy trì chuỗi hôm nay' : 'Chưa hoàn thành rương hôm nay'}</small></section></div><section className="card profile-history"><h2>Lịch sử học tập</h2>{!history ? error ? <ErrorState message={error}/> : <Loading/> : history.length ? history.map(a => <Link to={a.status==='IN_PROGRESS'?`/attempts/${a.id}`:`/attempts/${a.id}/result`} key={a.id} className="history-row"><div className="card-icon purple"><Clock3 size={20}/></div><div><strong>{a.kind==='PRACTICE'?'Luyện tập':a.kind==='CHAPTER_BOSS'?'Boss cuối chương':'Boss bài học'}</strong><span>{a.correctCount}/{a.totalQuestions} câu đúng · {a.status==='IN_PROGRESS'?'Đang làm':a.status==='WON'?'Hoàn thành':'Chưa đạt'}</span></div><ArrowRight size={18}/></Link>) : <div className="empty-state">Chưa có lượt làm nào. <Link to="/practice">Bắt đầu luyện tập</Link></div>}</section></div></Layout>
}
export function NotFound() { const { user }=useAuth(); return <Layout title="Không tìm thấy"><div className="state-card"><h1>404 · Không tìm thấy trang</h1><p>Đường dẫn này không tồn tại.</p><Link className="button primary" to={user?.role==='TEACHER'?'/teacher':'/dashboard'}>Về tổng quan</Link></div></Layout> }
export function Forbidden() { const { user }=useAuth(); return <Layout title="Không có quyền"><div className="state-card"><h1>403 · Không có quyền truy cập</h1><p>Tài khoản của bạn không được phép mở nội dung này.</p><Link className="button primary" to={user?.role==='TEACHER'?'/teacher':'/dashboard'}>Về tổng quan</Link></div></Layout> }
