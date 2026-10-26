import { School } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { Layout } from '../components/Layout'
import { LearnerProfilePage } from './LearnerProfilePage'

export function ProfilePage() {
  const { user } = useAuth()
  return user?.role === 'TEACHER' ? <TeacherProfilePage/> : <LearnerProfilePage/>
}
function TeacherProfilePage() {
  const { user } = useAuth()
  return <Layout title="Hồ sơ giáo viên"><div className="page-heading"><div><span className="section-label">HỒ SƠ GIÁO VIÊN</span><h1>{user?.displayName}</h1><p>Tên đăng nhập: {user?.username}</p></div><div className="heading-icon"><School size={36}/></div></div><section className="card feature-card"><h2>Không gian giảng dạy</h2><p className="muted">Quản lý lớp học, bài giao và ngân hàng câu hỏi của bạn.</p><div className="button-row"><Link className="button primary" to="/teacher">Xem tổng quan</Link><Link className="button secondary" to="/classes">Quản lý lớp</Link><Link className="button secondary" to="/teacher/questions">Soạn câu hỏi</Link></div></section></Layout>
}
export function NotFound() { const { user }=useAuth(); return <Layout title="Không tìm thấy"><div className="state-card"><h1>404 · Không tìm thấy trang</h1><p>Đường dẫn này không tồn tại.</p><Link className="button primary" to={user?.role==='TEACHER'?'/teacher':'/dashboard'}>Về tổng quan</Link></div></Layout> }
export function Forbidden() { const { user }=useAuth(); return <Layout title="Không có quyền"><div className="state-card"><h1>403 · Không có quyền truy cập</h1><p>Tài khoản của bạn không được phép mở nội dung này.</p><Link className="button primary" to={user?.role==='TEACHER'?'/teacher':'/dashboard'}>Về tổng quan</Link></div></Layout> }
