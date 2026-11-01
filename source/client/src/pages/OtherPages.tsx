import {
  ArrowRight,
  Award,
  Clock3,
  Flame,
  School,
  Shield,
  Sparkles,
  Trophy,
  UsersRound,
  ClipboardList,
  HelpCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { useDailyQuests } from '../app/DailyQuestsContext'
import { Layout } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import { api } from '../services/api'
import type { Attempt } from '../types'
import './profile.css'
import {
  DisplayNameEditor,
  ProfileCosmetics,
  useProfileCosmetics,
} from '../components/ProfileControls'

export function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null
  return user.role === 'ADMIN' ? (
    <AdminProfilePage />
  ) : user.role === 'TEACHER' ? (
    <TeacherProfilePage />
  ) : (
    <LearnerProfilePage />
  )
}
function TeacherProfilePage() {
  const { user } = useAuth()
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.teacherOverview>> | null>(
    null,
  )
  const [error, setError] = useState('')
  useRealtimeRefresh(() =>
    api
      .teacherOverview()
      .then(setOverview)
      .catch((e) => setError(e.message)),
  )
  useEffect(() => {
    api
      .teacherOverview()
      .then(setOverview)
      .catch((error) => setError(error.message))
  }, [])
  const initial = user?.displayName.slice(0, 1).toUpperCase() || 'G'
  return (
    <Layout title="Hồ sơ giáo viên">
      <div className="teacher-profile-page">
        <section className="teacher-profile-hero">
          <div className="teacher-profile-orbit" aria-hidden="true" />
          <div className="teacher-profile-identity">
            <div className="teacher-profile-avatar" aria-hidden="true">
              {initial}
            </div>
            <div>
              <h1>{user?.displayName}</h1>
              <p>
                <strong>@{user?.username}</strong>
                <span>·</span>
                <span className="teacher-role">
                  <School size={15} /> Giáo viên
                </span>
              </p>
            </div>
          </div>
          <div className="teacher-profile-badge">
            <Shield size={16} /> Tài khoản đang hoạt động
          </div>
        </section>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button
              className="button secondary"
              onClick={() => {
                setError('')
                api
                  .teacherOverview()
                  .then(setOverview)
                  .catch((error) => setError(error.message))
              }}
            >
              Tải lại
            </button>
          </div>
        )}
        <div className="teacher-profile-layout">
          <main className="teacher-profile-main">
            <section className="card teacher-profile-card">
              <div className="teacher-profile-card-heading">
                <div>
                  <span className="section-label">THÔNG TIN TÀI KHOẢN</span>
                  <h2>Thông tin cá nhân</h2>
                  <p className="muted">Cập nhật tên để giáo viên và học viên dễ nhận ra bạn.</p>
                </div>
                <School size={24} />
              </div>
              <dl className="teacher-profile-details">
                <div>
                  <dt>Tên hiển thị</dt>
                  <dd>{user?.displayName}</dd>
                </div>
                <div>
                  <dt>Tên đăng nhập</dt>
                  <dd className="teacher-profile-mono">@{user?.username}</dd>
                </div>
                <div>
                  <dt>Vai trò</dt>
                  <dd>
                    <span className="teacher-profile-role">
                      <Shield size={14} /> Giáo viên
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>
                    <span className="teacher-profile-status">
                      <span />
                      Đang hoạt động
                    </span>
                  </dd>
                </div>
              </dl>
              {user && <DisplayNameEditor key={user.id} user={user} />}
              <p className="teacher-profile-note">
                <HelpCircle size={16} /> Đổi tên hiển thị không thay đổi tên đăng nhập của bạn.
              </p>
            </section>
            <section className="card teacher-profile-card">
              <div className="teacher-profile-card-heading">
                <div>
                  <h2>Công cụ nhanh</h2>
                  <p className="muted">Đi tới đúng khu vực để tiếp tục công việc.</p>
                </div>
              </div>
              <div className="teacher-profile-actions">
                <Link className="teacher-profile-action primary" to="/teacher">
                  <span>
                    <School size={20} />
                  </span>
                  <div>
                    <strong>Tổng quan giảng dạy</strong>
                    <small>Xem các việc cần xử lý</small>
                  </div>
                  <ArrowRight size={17} />
                </Link>
                <Link className="teacher-profile-action" to="/classes">
                  <span>
                    <UsersRound size={20} />
                  </span>
                  <div>
                    <strong>Quản lý lớp học</strong>
                    <small>Lớp, thành viên và điểm số</small>
                  </div>
                  <ArrowRight size={17} />
                </Link>
                <Link className="teacher-profile-action" to="/teacher/questions">
                  <span>
                    <HelpCircle size={20} />
                  </span>
                  <div>
                    <strong>Ngân hàng câu hỏi</strong>
                    <small>Soạn và quản lý câu hỏi</small>
                  </div>
                  <ArrowRight size={17} />
                </Link>
              </div>
            </section>
          </main>
          <aside className="teacher-profile-side">
            <section className="card teacher-profile-card">
              <div className="teacher-profile-card-heading compact">
                <div>
                  <span className="section-label">THỐNG KÊ</span>
                  <h2>Hoạt động giảng dạy</h2>
                </div>
                <Award size={22} />
              </div>
              {overview ? (
                <div className="teacher-profile-stats">
                  <Link to="/classes">
                    <UsersRound size={19} />
                    <span>
                      <strong>{overview.classes}</strong>
                      <small>Lớp đang quản lý</small>
                    </span>
                    <ArrowRight size={15} />
                  </Link>
                  <Link to="/classes">
                    <School size={19} />
                    <span>
                      <strong>{overview.students}</strong>
                      <small>Học viên</small>
                    </span>
                    <ArrowRight size={15} />
                  </Link>
                  <Link to="/classes">
                    <ClipboardList size={19} />
                    <span>
                      <strong>{overview.openAssignments}</strong>
                      <small>Nhiệm vụ đang mở</small>
                    </span>
                    <ArrowRight size={15} />
                  </Link>
                  <Link to="/teacher/questions">
                    <HelpCircle size={19} />
                    <span>
                      <strong>{overview.questions}</strong>
                      <small>Câu hỏi đã tạo</small>
                    </span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              ) : (
                <Loading />
              )}
            </section>
            <section className="card teacher-profile-card teacher-profile-security">
              <div className="teacher-profile-card-heading compact">
                <div>
                  <span className="section-label">BẢO MẬT</span>
                  <h2>Tài khoản an toàn</h2>
                </div>
                <Shield size={22} />
              </div>
              <p>
                Chỉ sử dụng tài khoản của bạn và đăng xuất khi dùng xong trên thiết bị dùng chung.
              </p>
              <Link className="text-link" to="/teacher">
                Mở không gian giảng dạy <ArrowRight size={15} />
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </Layout>
  )
}
function LearnerProfilePage() {
  const { data: dailyQuests } = useDailyQuests()
  const streak = dailyQuests?.streak
  const { user } = useAuth()
  const cosmetics = useProfileCosmetics()
  const [history, setHistory] = useState<Attempt[] | null>(null)
  const [error, setError] = useState('')
  const reloadHistory = useCallback(
    () =>
      api
        .history()
        .then((data) => {
          setHistory(data)
          setError('')
        })
        .catch((e) => setError(e.message)),
    [],
  )
  useRealtimeRefresh(reloadHistory)
  useEffect(() => {
    void reloadHistory()
  }, [reloadHistory])
  if (!user) return null
  const wins = user.pvpWins ?? 0
  const matches = wins + (user.pvpLosses ?? 0) + (user.pvpDraws ?? 0)
  const unlockedBadges = cosmetics.data?.items.filter(
    (item) => item.type === 'BADGE' && item.unlocked,
  ).length
  return (
    <Layout title="Hồ sơ học viên">
      <div className="profile-page">
        <section className="profile-hero">
          <div
            className={`profile-avatar ${cosmetics.frame?.cssClass ?? 'frame-default'}`}
            aria-hidden="true"
          >
            <span>{user.displayName.slice(0, 1).toUpperCase()}</span>
          </div>
          <div className="profile-hero-copy">
            <span className="section-label">HỒ SƠ HỌC VIÊN</span>
            <h1>{user.displayName}</h1>
            <p>@{user.username}</p>
            <div className="profile-hero-meta">
              <span>
                <Trophy size={15} /> Cấp {user.level}
              </span>
              <span>
                <Sparkles size={15} /> {user.totalXp.toLocaleString('vi-VN')} EXP
              </span>
              <span>
                <Shield size={15} /> Hạng {user.pvpRankTitle ?? 'Đồng'} · {user.pvpElo ?? 1000} ELO
              </span>
            </div>
            {cosmetics.badge && (
              <div className="profile-equipped-badge">
                <span className={`pvp-badge-pill ${cosmetics.badge.cssClass}`}>
                  <Award size={15} /> {cosmetics.badge.name}
                </span>
              </div>
            )}
          </div>
          <a className="profile-edit-button" href="#profile-personal-info">
            Chỉnh sửa tên
          </a>
        </section>
        <div className="profile-stat-grid">
          <section className="card profile-mini-stat">
            <Trophy size={20} />
            <strong>Cấp {user.level}</strong>
            <span>{user.xpInLevel}/1.000 EXP cấp hiện tại</span>
          </section>
          <section className="card profile-mini-stat profile-pvp-stat">
            <Shield size={20} />
            <strong>{user.pvpElo ?? 1000} ELO</strong>
            <span>
              {matches} trận · {wins} thắng · {matches ? Math.round((wins / matches) * 100) : 0}%
              thắng
            </span>
          </section>
          <section className="card profile-mini-stat">
            <Award size={20} />
            <strong>{unlockedBadges ?? '—'} huy hiệu</strong>
            <span>Đã mở khóa từ PvP</span>
          </section>
        </div>
        <section className="card profile-section" id="profile-personal-info">
          <div className="profile-section-heading">
            <div>
              <span className="section-label">THÔNG TIN CÁ NHÂN</span>
              <h2>Chỉnh sửa hồ sơ</h2>
            </div>
          </div>
          <DisplayNameEditor key={user.id} user={user} />
        </section>
        <ProfileCosmetics cosmetics={cosmetics} />
        <section className="card profile-stat">
          <Flame size={28} color="#f59e0b" />
          <strong>Chuỗi {streak?.currentStreak || 0} ngày</strong>
          <p>Kỷ lục: {streak?.longestStreak || 0} ngày liên tiếp</p>
          <small>
            {streak?.completedToday
              ? '✓ Đã duy trì chuỗi hôm nay'
              : 'Chưa hoàn thành rương hôm nay'}
          </small>
        </section>
        <section className="card profile-history">
          <h2>Lịch sử học tập</h2>
          {!history ? (
            error ? (
              <ErrorState message={error} retry={reloadHistory} />
            ) : (
              <Loading />
            )
          ) : history.length ? (
            history.map((a) => (
              <Link
                to={a.status === 'IN_PROGRESS' ? `/attempts/${a.id}` : `/attempts/${a.id}/result`}
                key={a.id}
                className="history-row"
              >
                <div className="card-icon purple">
                  <Clock3 size={20} />
                </div>
                <div>
                  <strong>
                    {a.kind === 'PRACTICE'
                      ? 'Luyện tập'
                      : a.kind === 'CHAPTER_BOSS'
                        ? 'Boss cuối chương'
                        : 'Boss bài học'}
                  </strong>
                  <span>
                    {a.correctCount}/{a.totalQuestions} câu đúng ·{' '}
                    {a.status === 'IN_PROGRESS'
                      ? 'Đang làm'
                      : a.status === 'WON'
                        ? 'Hoàn thành'
                        : 'Chưa đạt'}
                  </span>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))
          ) : (
            <div className="empty-state">
              Chưa có lượt làm nào. <Link to="/practice">Bắt đầu luyện tập</Link>
            </div>
          )}
        </section>
      </div>
    </Layout>
  )
}

function AdminProfilePage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <Layout title="Hồ sơ quản trị viên">
      <div className="profile-page">
        <section className="profile-hero profile-admin-hero">
          <div className="profile-avatar" aria-hidden="true">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="profile-hero-copy">
            <span className="section-label">HỒ SƠ QUẢN TRỊ VIÊN</span>
            <h1>{user.displayName}</h1>
            <p>@{user.username}</p>
            <div className="profile-hero-meta">
              <span>
                <Shield size={15} /> Quản trị viên
              </span>
            </div>
          </div>
        </section>
        <section className="card profile-section">
          <div className="profile-section-heading">
            <div>
              <span className="section-label">THÔNG TIN CÁ NHÂN</span>
              <h2>Chỉnh sửa hồ sơ</h2>
            </div>
            <Shield size={23} />
          </div>
          <dl className="profile-account-details">
            <div>
              <dt>Tên đăng nhập</dt>
              <dd>@{user.username}</dd>
            </div>
            <div>
              <dt>Vai trò</dt>
              <dd>Quản trị viên</dd>
            </div>
          </dl>
          <DisplayNameEditor key={user.id} user={user} />
        </section>
        <section className="card profile-section">
          <h2>Công cụ quản trị</h2>
          <div className="profile-admin-actions">
            <Link className="button secondary" to="/admin?tab=users">
              <UsersRound size={18} /> Quản lý tài khoản
            </Link>
            <Link className="button secondary" to="/admin?tab=reports">
              <Shield size={18} /> Báo cáo vi phạm
            </Link>
            <Link className="button secondary" to="/admin/journeys">
              <School size={18} /> Quản lý hành trình
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  )
}
export function NotFound() {
  const { user } = useAuth()
  return (
    <Layout title="Không tìm thấy">
      <div className="state-card">
        <h1>404 · Không tìm thấy trang</h1>
        <p>Đường dẫn này không tồn tại.</p>
        <Link className="button primary" to={user?.role === 'TEACHER' ? '/teacher' : '/dashboard'}>
          Về tổng quan
        </Link>
      </div>
    </Layout>
  )
}
export function Forbidden() {
  const { user } = useAuth()
  return (
    <Layout title="Không có quyền">
      <div className="state-card">
        <h1>403 · Không có quyền truy cập</h1>
        <p>Tài khoản của bạn không được phép mở nội dung này.</p>
        <Link className="button primary" to={user?.role === 'TEACHER' ? '/teacher' : '/dashboard'}>
          Về tổng quan
        </Link>
      </div>
    </Layout>
  )
}
import { useRealtimeRefresh } from '../services/realtimeRefresh'
