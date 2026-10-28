import {
  BookOpen,
  CircleHelp,
  Compass,
  Flame,
  FileWarning,
  House,
  LogOut,
  Menu,
  Rocket,
  School,
  ScrollText,
  ShieldCheck,
  Swords,
  UsersRound,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { useDailyQuests } from '../app/DailyQuestsContext'
import './DailyQuestsWidget.css'
import { api } from '../services/api'

const FRAME_CLASSES: Record<string, string> = {
  FRAME_DEFAULT: 'frame-default',
  FRAME_BRONZE: 'frame-bronze',
  FRAME_SILVER: 'frame-silver',
  FRAME_GOLD: 'frame-gold',
  FRAME_PLATINUM: 'frame-platinum',
  FRAME_DIAMOND: 'frame-diamond',
  FRAME_MASTER: 'frame-master',
  FRAME_STREAK_5: 'frame-streak',
}

const learnerLinks = [
  { to: '/dashboard', label: 'Tổng quan', icon: House },
  { to: '/roadmap', label: 'Lộ trình', icon: Compass },
  { to: '/practice', label: 'Luyện tập', icon: BookOpen },
  { to: '/arena', label: 'Đấu trường', icon: Swords },
  { to: '/classes', label: 'Lớp học', icon: UsersRound },
]
const teacherLinks = [
  { to: '/teacher', label: 'Tổng quan', icon: House },
  { to: '/classes', label: 'Lớp học', icon: School },
  { to: '/teacher/questions', label: 'Kho học liệu', icon: BookOpen },
]
const adminLinks = [
  { to: '/admin', label: 'Tổng quan', icon: House },
  { to: '/admin?tab=users', label: 'Quản lý tài khoản', icon: UsersRound },
  { to: '/admin?tab=reports', label: 'Báo cáo vi phạm', icon: FileWarning },
  { to: '/admin?tab=support', label: 'Hỗ trợ người dùng', icon: CircleHelp },
  { to: '/admin?tab=audit', label: 'Nhật ký quản trị', icon: ScrollText },
]
export function Layout({ children, title }: { children: ReactNode; title: string }) {
  const { user, setUser } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isTeacher = user?.role === 'TEACHER'
  const home = isAdmin ? '/admin' : isTeacher ? '/teacher' : '/dashboard'
  const links = isAdmin ? adminLinks : isTeacher ? teacherLinks : learnerLinks
  const [menu, setMenu] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const { data: dailyQuests } = useDailyQuests()
  const streak = dailyQuests?.streak.currentStreak ?? null
  const frameClass =
    !isAdmin && !isTeacher && user?.equippedFrame ? FRAME_CLASSES[user.equippedFrame] || '' : ''
  const navigate = useNavigate()
  const location = useLocation()
  function isLinkActive(to: string) {
    const target = new URL(to, window.location.origin)
    if (target.pathname === '/admin')
      return (
        location.pathname === '/admin' &&
        (new URLSearchParams(location.search).get('tab') || 'overview') ===
          (target.searchParams.get('tab') || 'overview')
      )
    return (
      location.pathname === target.pathname ||
      (target.pathname === '/classes' && location.pathname.startsWith('/classes/'))
    )
  }
  async function logout() {
    try {
      await api.logout()
      setUser(null)
      navigate('/login')
    } catch (e) {
      setLogoutError((e as Error).message)
    }
  }
  return (
    <div className="app-layout">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link
          to={home}
          className={`brand ${isAdmin ? 'admin-brand' : ''}`}
          onClick={() => setMenu(false)}
        >
          <span className="brand-mark">
            {isAdmin ? <ShieldCheck size={22} /> : <Rocket size={23} />}
          </span>
          <span>
            <strong>Grammar Quest</strong>
            {isAdmin && <small>ORBITAL ADMIN</small>}
          </span>
        </Link>
        <nav aria-label="Điều hướng chính" className="nav-list">
          {isAdmin && <span className="nav-section-label">TRUNG TÂM CHỈ HUY</span>}
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMenu(false)}
              aria-current={isLinkActive(to) ? 'page' : undefined}
              className={`nav-link ${isLinkActive(to) ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{label}</span>
              {isAdmin && isLinkActive(to) && <i aria-hidden="true" />}
            </Link>
          ))}
        </nav>
      </aside>
      {menu && (
        <button className="backdrop" aria-label="Đóng menu" onClick={() => setMenu(false)} />
      )}
      <div className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label={menu ? 'Đóng menu' : 'Mở menu'}
            >
              {menu ? <X /> : <Menu />}
            </button>
            <span className="eyebrow">
              {isAdmin
                ? 'QUẢN TRỊ ỨNG DỤNG'
                : isTeacher
                  ? 'KHÔNG GIAN GIẢNG DẠY'
                  : 'TRẠM KHÔNG GIAN'}
            </span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            {!isAdmin && !isTeacher && streak !== null && (
              <span className="streak-pill" title={`Chuỗi ngày liên tiếp: ${streak} ngày`}>
                <Flame size={15} /> {streak}
              </span>
            )}
            {isAdmin && (
              <span className="admin-realtime-pill">
                <i /> Trực tuyến
              </span>
            )}
            {!isAdmin && !isTeacher && user && (
              <span className="topbar-exp" title="Tổng EXP tích lũy">
                <strong>{user.totalXp.toLocaleString('vi-VN')}</strong>
                <span>EXP</span>
              </span>
            )}
            <Link
              to={isAdmin ? '/admin' : '/profile'}
              className="topbar-profile"
              aria-label={isAdmin ? 'Mở trang quản trị' : 'Mở hồ sơ cá nhân'}
            >
              <span className={`avatar ${frameClass}`}>
                {user?.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="topbar-profile-copy">
                <strong>{user?.displayName}</strong>
                <small>
                  {isAdmin ? 'Quản trị viên' : isTeacher ? 'Giáo viên' : `Cấp ${user?.level}`}
                </small>
              </span>
            </Link>
            <button
              className="icon-button"
              title="Đăng xuất"
              aria-label="Đăng xuất"
              onClick={logout}
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>
        {logoutError && (
          <div className="error-banner" role="alert">
            {logoutError}
          </div>
        )}
        <main className="page-content">{children}</main>
        {!isAdmin && (
          <nav className="bottom-nav" aria-label="Điều hướng di động">
            {(isTeacher
              ? teacherLinks
              : links.filter((l) => ['/dashboard', '/roadmap', '/practice'].includes(l.to))
            ).map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/teacher' || to === '/admin'}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon size={21} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
      <span className="sr-only">
        <CircleHelp />
      </span>
    </div>
  )
}
