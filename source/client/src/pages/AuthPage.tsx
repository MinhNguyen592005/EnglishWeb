import { Eye, EyeOff, Rocket, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { api } from '../services/api'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { setUser } = useAuth()
  const navigate = useNavigate()
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      let profile
      if (mode === 'register') {
        await api.register(username, displayName, password)
        profile = await api.login(username, password)
      } else profile = await api.login(username, password)
      setUser(profile)
      navigate(profile.role==='ADMIN'?'/admin':profile.role==='TEACHER'?'/teacher':'/dashboard', { replace: true })
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="auth-page"><div className="auth-art"><div className="auth-orbit orbit-one"/><div className="auth-orbit orbit-two"/><div className="auth-planet"><Rocket size={76}/></div><span className="auth-star star-a">✦</span><span className="auth-star star-b">✦</span><div className="auth-copy"><div className="auth-brand"><Rocket size={26}/> Grammar Quest</div><h1>Học ngữ pháp.<br/>Mở khóa vũ trụ.</h1><p>Mỗi bài học là một trạm mới. Luyện tập, chinh phục thử thách và tiến xa hơn mỗi ngày.</p><div className="art-chip"><Sparkles size={18}/> Hành trình câu điều kiện đang chờ bạn</div></div></div>
    <div className="auth-form-wrap"><div className="auth-form-card"><div className="mobile-brand"><Rocket size={24}/> Grammar Quest</div><span className="section-label">CHÀO MỪNG ĐẾN VỚI TRẠM</span><h2>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h2><p className="muted">{mode === 'login' ? 'Tiếp tục hành trình học ngữ pháp của bạn.' : 'Bắt đầu hành trình của bạn với tài khoản người học.'}</p>
    <form onSubmit={submit}>{error && <div className="error-banner" role="alert">{error}</div>}
      <label htmlFor="username">Tên đăng nhập</label><input id="username" autoComplete="username" required minLength={3} value={username} onChange={e => setUsername(e.target.value)} placeholder="Nhập tên đăng nhập"/>
      {mode === 'register' && <><label htmlFor="display-name">Tên hiển thị</label><input id="display-name" autoComplete="name" required minLength={2} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Bạn muốn được gọi là gì?"/></>}
      <label htmlFor="password">Mật khẩu</label><div className="password-field"><input id="password" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu"/><button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{show ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
      <button className="button primary auth-submit" disabled={busy}>{busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</button>
    </form><p className="auth-switch">{mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'} <Link to={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}</Link></p><p className="auth-footnote">Mật khẩu được bảo vệ bởi máy chủ. Kết quả học tập sẽ được lưu trong tài khoản của bạn.</p></div></div></div>
}
