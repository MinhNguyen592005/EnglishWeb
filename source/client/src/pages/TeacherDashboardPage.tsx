import { BookOpen, ClipboardList, Globe2, School, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { Layout } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import { api } from '../services/api'
import type { TeacherOverview } from '../types'

export function TeacherDashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState<TeacherOverview | null>(null)
  const [error, setError] = useState('')

  function reload() {
    setError('')
    api.teacherOverview().then(setData).catch(e => setError(e.message))
  }
  useEffect(reload, [])

  return <Layout title="Tổng quan giáo viên">
    <div className="page-heading"><div><span className="section-label">GÓC GIÁO VIÊN</span><h1>Chào {user?.displayName}!</h1><p>Quản lý lớp học, giao bài và theo dõi kết quả của học viên.</p></div><div className="heading-icon"><School/></div></div>
    {!data ? error ? <ErrorState message={error} retry={reload}/> : <Loading/> : <>
      <div className="metric-grid">
        <div className="card metric-card"><School/><strong>{data.classes}</strong><span>Lớp đang quản lý</span></div>
        <div className="card metric-card"><UsersRound/><strong>{data.students}</strong><span>Học viên</span></div>
        <div className="card metric-card"><ClipboardList/><strong>{data.openAssignments}</strong><span>Bài giao đang mở</span></div>
        <div className="card metric-card"><BookOpen/><strong>{data.questions}</strong><span>Câu hỏi riêng</span></div>
      </div>
      <div className="feature-grid teacher-actions">
        <Link to="/classes" className="card feature-card feature-link"><div className="card-icon purple"><School/></div><h2>Quản lý lớp và giao bài</h2><p>Tạo lớp, xem thành viên, giao nhiệm vụ và kiểm tra kết quả.</p><span className="button primary">Mở lớp học</span></Link>
        <Link to="/teacher/questions" className="card feature-card feature-link"><div className="card-icon purple"><BookOpen/></div><h2>Ngân hàng câu hỏi</h2><p>Soạn và cập nhật câu hỏi dùng cho bài giao của lớp.</p><span className="button secondary">Soạn câu hỏi</span></Link>
        <Link to="/teacher/curriculum" className="card feature-card feature-link"><div className="card-icon purple"><Globe2/></div><h2>Biên tập hành tinh</h2><p>Thêm chủ đề, sửa kiến thức và chuẩn bị câu hỏi cho lộ trình chung.</p><span className="button secondary">Mở lộ trình</span></Link>
      </div>
      <section className="card feature-card"><h2>Bài giao gần đây</h2>{data.recent.length ? data.recent.map(item => {
        const state = item.status === 'CLOSED' ? 'Đã đóng' : new Date(item.dueAt).getTime() < Date.now() ? 'Quá hạn' : 'Đang mở'
        return <div className="assignment-row" key={item.id}><div><strong>{item.title}</strong><small>{item.className} · {state} · Hạn {new Date(item.dueAt).toLocaleString('vi-VN')} · {item.submitted}/{item.students} học viên đã nộp</small></div><Link className="button secondary" to={`/classes/${item.classId}`}>Mở lớp</Link></div>
      }) : <p className="muted">Bạn chưa giao bài nào. Mở lớp học để tạo nhiệm vụ đầu tiên.</p>}</section>
    </>}
  </Layout>
}
