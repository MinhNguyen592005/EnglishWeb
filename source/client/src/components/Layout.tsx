import { BookOpen, CircleHelp, Compass, Flame, Globe2, House, LogOut, Menu, PencilLine, Rocket, School, Swords, UserRound, UsersRound, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { api } from '../services/api'

const FRAME_CLASSES: Record<string, string> = {
  FRAME_DEFAULT: 'frame-default',
  FRAME_BRONZE: 'frame-bronze',
  FRAME_SILVER: 'frame-silver',
  FRAME_GOLD: 'frame-gold',
  FRAME_PLATINUM: 'frame-platinum',
  FRAME_DIAMOND: 'frame-diamond',
  FRAME_MASTER: 'frame-master',
  FRAME_STREAK_5: 'frame-streak'
}

const learnerLinks = [
  { to: '/dashboard', label: 'Tổng quan', icon: House },
  { to: '/roadmap', label: 'Lộ trình', icon: Compass },
  { to: '/practice', label: 'Luyện tập', icon: BookOpen },
  { to: '/arena', label: 'Đấu trường', icon: Swords },
  { to: '/classes', label: 'Lớp học', icon: UsersRound },
  { to: '/profile', label: 'Hồ sơ', icon: UserRound }
]
const teacherLinks = [
  { to: '/teacher', label: 'Tổng quan', icon: House },
  { to: '/classes', label: 'Lớp học', icon: School },
  { to: '/teacher/curriculum', label: 'Lộ trình', icon: Globe2 },
  { to: '/teacher/questions', label: 'Soạn câu hỏi', icon: PencilLine },
  { to: '/profile', label: 'Hồ sơ', icon: UserRound }
]
const adminLinks = [
  {to:'/admin',label:'Tổng quan & Máy chủ',icon:House},
  {to:'/admin?tab=users',label:'Tài khoản',icon:UsersRound},
  {to:'/admin?tab=content',label:'Kiểm duyệt nội dung',icon:BookOpen},
  {to:'/admin?tab=reports',label:'Báo cáo vi phạm',icon:CircleHelp},
  {to:'/admin?tab=support',label:'Hỗ trợ người dùng',icon:CircleHelp},
  {to:'/admin?tab=audit',label:'Nhật ký quản trị',icon:PencilLine}
]
export function Layout({ children, title }: { children: ReactNode; title: string }) {
  const { user, setUser } = useAuth()
  const isAdmin=user?.role==='ADMIN'
  const isTeacher=user?.role==='TEACHER'
  const home=isAdmin?'/admin':isTeacher?'/teacher':'/dashboard'
  const links=isAdmin?adminLinks:isTeacher?teacherLinks:learnerLinks
  const [menu, setMenu] = useState(false)
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:900px)').matches)
  const sidebar=useRef<HTMLElement>(null)
  const menuButton=useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    const media=window.matchMedia('(max-width:900px)')
    const change=()=>{setCompact(media.matches);if(!media.matches)setMenu(false)}
    media.addEventListener('change',change)
    return()=>media.removeEventListener('change',change)
  },[])
  useEffect(()=>{
    if(!menu||!compact)return
    const previousOverflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    const focusable=()=>Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')||[])
    focusable()[0]?.focus()
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setMenu(false)}
      if(event.key==='Tab'){
        const items=focusable(),first=items[0],last=items.at(-1)
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }
    }
    document.addEventListener('keydown',keydown)
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',keydown);if(menuButton.current?.isConnected)menuButton.current.focus()}
  },[menu,compact])
  const [logoutError, setLogoutError] = useState('')
  const [streak, setStreak] = useState<number | null>(null)
  const frameClass = (!isAdmin && !isTeacher && user?.equippedFrame) ? (FRAME_CLASSES[user.equippedFrame] || '') : ''
  useEffect(() => {
    if (!isAdmin && !isTeacher && user) {
      api.dailyStreak().then(res => setStreak(res.currentStreak)).catch(() => {})
    }
  }, [isAdmin, isTeacher, user])
  const navigate = useNavigate()
  const location=useLocation()
  function isLinkActive(to:string) {
    const target=new URL(to,window.location.origin)
    if(target.pathname==='/admin') return location.pathname==='/admin'&&(new URLSearchParams(location.search).get('tab')||'overview')===(target.searchParams.get('tab')||'overview')
    return location.pathname===target.pathname||(target.pathname==='/classes'&&location.pathname.startsWith('/classes/'))
  }
  async function logout() {
    try { await api.logout(); setUser(null); navigate('/login') }
    catch (e) { setLogoutError((e as Error).message) }
  }
  return <div className="app-layout">
    <aside ref={sidebar} id="app-sidebar" inert={compact&&!menu} className={`sidebar ${menu ? 'open' : ''}`}>
      <Link to={home} className="brand" onClick={() => setMenu(false)}><span className="brand-mark"><Rocket size={23}/></span>Grammar Quest</Link>
      {compact&&<button className="icon-button sidebar-close" type="button" aria-label="Đóng menu điều hướng" onClick={()=>setMenu(false)}><X size={20}/></button>}
      <nav aria-label="Điều hướng chính" className="nav-list">{links.map(({ to, label, icon: Icon }) => <Link key={to} to={to} onClick={() => setMenu(false)} aria-current={isLinkActive(to)?'page':undefined} className={`nav-link ${isLinkActive(to)?'active':''}`}><Icon size={21}/>{label}</Link>)}</nav>
      <div className="sidebar-bottom"><div className={`avatar ${frameClass}`}>{user?.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{user?.displayName}</strong><small>{isAdmin?'Quản trị viên':isTeacher?'Giáo viên':`Cấp tài khoản ${user?.level} · ${user?.pvpRankTitle || 'Đồng'} (${user?.pvpElo ?? 1000} ELO)`}</small></div></div>
    </aside>
    {menu && <button className="backdrop" aria-label="Đóng menu" onClick={() => setMenu(false)}/>}
    <div className="main-panel" inert={compact&&menu}>
      <header className="topbar"><div className="topbar-left"><button ref={menuButton} aria-controls="app-sidebar" aria-expanded={menu} className="icon-button mobile-menu" onClick={() => setMenu(!menu)} aria-label={menu ? 'Đóng menu' : 'Mở menu'}>{menu ? <X/> : <Menu/>}</button><span className="eyebrow">{isAdmin?'QUẢN TRỊ ỨNG DỤNG':isTeacher?'KHÔNG GIAN GIẢNG DẠY':'TRẠM KHÔNG GIAN'}</span><strong>{title}</strong></div><div className="topbar-actions">{!isAdmin&&!isTeacher&&streak!==null&&<span className="streak-pill" title={`Chuỗi ngày liên tiếp: ${streak} ngày`}><Flame size={15}/> {streak}</span>}{!isAdmin&&!isTeacher&&<span className="level-pill">✦ Cấp {user?.level}</span>}<Link to={isAdmin?'/admin':'/profile'} className={`avatar ${frameClass}`} aria-label={isAdmin?'Quản trị':'Hồ sơ'}>{user?.displayName.slice(0,1).toUpperCase()}</Link><button className="icon-button" title="Đăng xuất" aria-label="Đăng xuất" onClick={logout}><LogOut size={20}/></button></div></header>
      {logoutError && <div className="error-banner" role="alert">{logoutError}</div>}
      <main className="page-content">{children}</main>
      {!isAdmin&&<nav className="bottom-nav" aria-label="Điều hướng di động">{(isTeacher?teacherLinks:links.filter(l => ['/dashboard','/roadmap','/practice','/profile'].includes(l.to))).map(({to,label,icon:Icon}) => <NavLink key={to} to={to} end={to==='/teacher'||to==='/admin'} className={({isActive}) => isActive ? 'active' : ''}><Icon size={21}/><span>{label}</span></NavLink>)}</nav>}
    </div>
    <span className="sr-only"><CircleHelp/></span>
  </div>
}
