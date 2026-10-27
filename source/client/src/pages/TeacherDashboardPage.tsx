import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  School,
  UsersRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { Layout } from '../components/Layout'
import { Loading } from '../components/States'
import { api } from '../services/api'
import { useSystemSocket } from '../app/SystemSocketContext'
import type { TeacherOverview } from '../types'
import './teacher-dashboard.css'

export function TeacherDashboardPage() {
  const { user } = useAuth()
  const { request, subscribe, connected } = useSystemSocket()
  const [data, setData] = useState<TeacherOverview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const value = await api.teacherOverview()
      setData(value)
      setLastUpdated(new Date())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void reload()
    if (!connected)
      return () => {
        active = false
      }
    const stop = subscribe((message) => {
      if (!active) return
      const payload = message.payload as
        { kind?: string; data: TeacherOverview; message: string } | undefined
      if (message.action === 'WORKSPACE_UPDATE' && payload?.kind === 'TEACHER') {
        setData(payload.data)
        setLastUpdated(new Date())
      }
      if (message.action === 'WORKSPACE_ERROR' && payload?.kind === 'TEACHER')
        setError(payload.message || 'Không thể cập nhật realtime')
    })
    void request<TeacherOverview>('TEACHER_OVERVIEW_WATCH', 'WORKSPACE_DATA')
      .then((value) => {
        if (active) {
          setData(value)
          setLastUpdated(new Date())
        }
      })
      .catch(() => {})
    return () => {
      active = false
      stop()
      void request('WORKSPACE_UNWATCH', 'WORKSPACE_DATA').catch(() => {})
    }
  }, [connected, request, subscribe])

  return (
    <Layout title="Tổng quan giáo viên">
      <div className="teacher-dashboard">
        <div className="page-heading teacher-dashboard-heading">
          <div>
            <span className="section-label">GÓC GIÁO VIÊN</span>
            <h1>Chào {user?.displayName}!</h1>
            <p>Quản lý lớp học, giao bài và theo dõi kết quả của học viên.</p>
          </div>
          <div className="heading-icon">
            <School />
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button className="button secondary" onClick={() => void reload()}>
              <RefreshCw size={16} />
              Tải lại
            </button>
          </div>
        )}
        {loading && !data ? (
          <Loading />
        ) : (
          data && (
            <>
              <div className="teacher-dashboard-status" aria-live="polite">
                <span
                  className={connected ? 'status-dot online' : 'status-dot'}
                  aria-hidden="true"
                />
                {connected ? 'Đang cập nhật realtime' : 'Đang dùng dữ liệu gần nhất'}
                {lastUpdated && (
                  <span>
                    · Cập nhật{' '}
                    {lastUpdated.toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
              <div className="teacher-dashboard-metrics">
                <Link to="/classes" className="teacher-metric-card">
                  <span className="teacher-metric-icon">
                    <School />
                  </span>
                  <strong>{data.classes}</strong>
                  <span>Lớp đang quản lý</span>
                  <small>{data.classes ? 'Mở danh sách lớp' : 'Chưa có lớp nào'}</small>
                  <ArrowRight />
                </Link>
                <Link to="/classes" className="teacher-metric-card">
                  <span className="teacher-metric-icon">
                    <UsersRound />
                  </span>
                  <strong>{data.students}</strong>
                  <span>Học viên</span>
                  <small>{data.students ? 'Chọn lớp để xem học viên' : 'Chưa có học viên'}</small>
                  <ArrowRight />
                </Link>
                <Link to="/classes" className="teacher-metric-card">
                  <span className="teacher-metric-icon">
                    <ClipboardList />
                  </span>
                  <strong>{data.openAssignments}</strong>
                  <span>Bài giao đang mở</span>
                  <small>
                    {data.openAssignments ? 'Chọn lớp để xem bài giao' : 'Chưa có bài giao đang mở'}
                  </small>
                  <ArrowRight />
                </Link>
                <Link to="/classes" className="teacher-metric-card">
                  <span className="teacher-metric-icon">
                    <CheckCircle2 />
                  </span>
                  <strong>{data.recent.filter((item) => item.submitted > 0).length}</strong>
                  <span>Bài cần xem kết quả</span>
                  <small>
                    {data.recent.some((item) => item.submitted > 0)
                      ? 'Chọn lớp để mở bảng điểm'
                      : 'Chưa có bài đã nộp'}
                  </small>
                  <ArrowRight />
                </Link>
              </div>
              <section className="teacher-dashboard-section">
                <div className="teacher-dashboard-section-heading">
                  <div>
                    <span className="section-label">THAO TÁC NHANH</span>
                    <h2>Công việc của giáo viên</h2>
                  </div>
                </div>
                <div className="teacher-action-grid">
                  <Link to="/classes" className="teacher-action-card">
                    <span className="teacher-action-icon">
                      <School />
                    </span>
                    <div>
                      <h3>Quản lý lớp học</h3>
                      <p>Tạo lớp, quản lý học viên và giao bài.</p>
                    </div>
                    <span className="button primary">Mở lớp học</span>
                  </Link>
                  <Link to="/teacher/questions" className="teacher-action-card">
                    <span className="teacher-action-icon">
                      <BookOpen />
                    </span>
                    <div>
                      <h3>Soạn câu hỏi</h3>
                      <p>Tạo và quản lý câu hỏi cho bài giao.</p>
                    </div>
                    <span className="button secondary">Mở ngân hàng câu hỏi</span>
                  </Link>
                </div>
              </section>
              <section className="teacher-dashboard-section teacher-attention">
                <div className="teacher-dashboard-section-heading">
                  <div>
                    <span className="section-label">ƯU TIÊN</span>
                    <h2>Bài giao cần chú ý</h2>
                  </div>
                  <Link to="/classes" className="text-link">
                    Xem tất cả <ArrowRight size={16} />
                  </Link>
                </div>
                {data.recent.length ? (
                  data.recent
                    .slice()
                    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
                    .slice(0, 5)
                    .map((item) => {
                      const overdue =
                        item.status !== 'CLOSED' && new Date(item.dueAt).getTime() < Date.now()
                      const state =
                        item.status === 'CLOSED'
                          ? 'Đã đóng'
                          : overdue
                            ? 'Quá hạn'
                            : item.submitted > 0
                              ? 'Có bài đã nộp'
                              : 'Đang mở'
                      return (
                        <div className="teacher-assignment-row" key={item.id}>
                          <div>
                            <strong>{item.title}</strong>
                            <small>
                              {item.className} · Hạn {new Date(item.dueAt).toLocaleString('vi-VN')}{' '}
                              · {item.submitted}/{item.students} đã nộp
                            </small>
                          </div>
                          <span className={`teacher-assignment-state ${overdue ? 'overdue' : ''}`}>
                            {state}
                          </span>
                          <Link
                            className="button secondary"
                            to={`/classes/${item.classId}?view=grades`}
                          >
                            Xem kết quả
                          </Link>
                        </div>
                      )
                    })
                ) : (
                  <p className="muted">Hiện không có bài giao nào cần xử lý.</p>
                )}
              </section>
            </>
          )
        )}
      </div>
    </Layout>
  )
}
