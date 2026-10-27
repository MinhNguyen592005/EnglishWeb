import {
  AlertCircle,
  ArrowRight,
  CircleUserRound,
  Eye,
  EyeOff,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { useRegistrationWelcome } from '../app/RegistrationWelcomeContext'
import { api } from '../services/api'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { setUser } = useAuth()
  const { showAfterRegistration } = useRegistrationWelcome()
  const navigate = useNavigate()
  const isRegister = mode === 'register'

  useEffect(() => {
    setError('')
    setDisplayName('')
    setConfirmPassword('')
  }, [mode])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    if (isRegister && password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp. Vui lòng kiểm tra lại.')
      setBusy(false)
      return
    }
    try {
      let profile
      if (isRegister) {
        await api.register(username, displayName, password)
        profile = await api.login(username, password)
      } else {
        profile = await api.login(username, password)
      }
      if (isRegister && profile.role === 'LEARNER') showAfterRegistration(profile.id)
      setUser(profile)
      navigate(
        profile.role === 'ADMIN'
          ? '/admin'
          : profile.role === 'TEACHER'
            ? '/teacher'
            : isRegister
              ? '/placement'
              : '/',
        { replace: true },
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#14213D] selection:bg-[#EEF0FF] selection:text-[#4B57C9]">
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <section className="relative flex w-full flex-col justify-between overflow-hidden border-b border-[#E5EAF2] bg-gradient-to-br from-[#EEF0FF] via-[#F8FAFC] to-[#F1F5F9] p-6 sm:p-10 lg:w-1/2 lg:border-b-0 lg:border-r lg:p-14">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <svg
              className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 opacity-40 sm:h-[720px] sm:w-[720px]"
              viewBox="0 0 800 800"
              fill="none"
            >
              <circle cx="400" cy="400" r="180" stroke="#6674E8" strokeDasharray="6 6" />
              <circle cx="400" cy="400" r="280" stroke="#16B8A6" strokeDasharray="4 8" />
              <circle cx="400" cy="400" r="360" stroke="#6674E8" strokeDasharray="2 12" />
              <circle cx="580" cy="400" r="6" fill="#16B8A6" />
              <circle cx="200" cy="200" r="4" fill="#6674E8" />
              <circle cx="400" cy="20" r="8" fill="#4B57C9" />
            </svg>
            <Sparkles className="absolute right-12 top-16 text-[#6674E8]/30" size={22} />
            <Sparkles className="absolute bottom-32 left-12 text-[#16B8A6]/40" size={18} />
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#E5EAF2] bg-white text-[#6674E8] shadow-sm">
              <Rocket size={25} />
            </div>
            <div>
              <strong className="block text-lg tracking-tight">Grammar Quest</strong>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#52627A]">
                Orbital exploration systems
              </span>
            </div>
          </div>

          <div className="relative z-10 my-12 max-w-xl lg:my-auto">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E5EAF2] bg-white/80 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[#16B8A6]" />
              Trạm vũ trụ học tập · Orbital academy
            </div>
            <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Học ngữ pháp.
              <br />
              <span className="text-[#6674E8]">Mở khóa vũ trụ.</span>
            </h1>
            <p className="mb-8 max-w-lg text-base leading-relaxed text-[#52627A] sm:text-lg">
              Khám phá các quy tắc ngôn ngữ qua từng chặng du hành không gian. Tích lũy tinh thể ngữ
              pháp và mở khóa các module kiến thức vô tận.
            </p>

            <div className="relative flex h-64 items-center justify-center sm:h-72">
              <div className="absolute h-44 w-44 rounded-full bg-[#6674E8]/10 blur-2xl" />
              <div className="absolute h-48 w-48 rounded-full border border-[#6674E8]/25 sm:h-56 sm:w-56" />
              <div className="absolute h-64 w-64 rotate-12 rounded-full border border-dashed border-[#16B8A6]/35 sm:h-72 sm:w-72" />
              <div className="absolute h-72 w-72 -rotate-12 rounded-full border border-[#6674E8]/20 sm:h-80 sm:w-80" />
              <span className="absolute left-[16%] top-[18%] h-3 w-3 rounded-full bg-[#6674E8] shadow-lg shadow-[#6674E8]/50" />
              <span className="absolute right-[15%] top-[30%] h-2.5 w-2.5 rounded-full bg-[#16B8A6] shadow-lg shadow-[#16B8A6]/50" />
              <span className="absolute bottom-[15%] left-[27%] h-2 w-2 rounded-full bg-[#F4B544]" />
              <div className="relative z-10 grid h-32 w-32 place-items-center rounded-full border-2 border-white bg-white shadow-2xl shadow-[#6674E8]/25 sm:h-36 sm:w-36">
                <div className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-[#EEF0FF] via-[#DDE2FF] to-[#B9C2FF] text-[#4B57C9] shadow-inner">
                  <Rocket size={40} strokeWidth={1.8} />
                </div>
                <span className="absolute -bottom-2 rounded-full bg-[#16B8A6] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md shadow-[#16B8A6]/30">
                  Online
                </span>
              </div>
              <div className="absolute left-0 top-2 flex items-center gap-3 rounded-2xl border border-white/80 bg-white/95 p-3 shadow-lg shadow-[#14213D]/5 sm:left-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF0FF] text-[#6674E8]">
                  <Target size={18} />
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[#52627A]">
                    Đang kích hoạt
                  </span>
                  <strong className="text-xs">Chặng 1: Thì hiện tại đơn</strong>
                </div>
              </div>
              <div className="absolute bottom-1 right-0 flex items-center gap-3 rounded-2xl border border-white/80 bg-white/95 p-3 shadow-lg shadow-[#14213D]/5 sm:right-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#E8FAF6] text-[#087F73]">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[#52627A]">
                    Trạm học tập
                  </span>
                  <strong className="text-xs">Sẵn sàng cho hành trình mới</strong>
                </div>
              </div>
              <div className="absolute bottom-8 left-[7%] hidden rounded-2xl border border-white/80 bg-white/95 p-3 shadow-lg shadow-[#14213D]/5 sm:block">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#52627A]">
                  <Target size={14} className="text-[#6674E8]" /> Điểm đến tiếp theo
                </div>
                <strong className="block text-xs text-[#14213D]">Khám phá trạm ngữ pháp</strong>
                <span className="mt-1 block text-[10px] text-[#52627A]">
                  Học theo lộ trình của riêng bạn
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-[#E5EAF2]/80 pt-4 text-[10px] font-semibold uppercase tracking-wider text-[#52627A]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-[#16B8A6]" /> Grammar Quest Station OS v2.4
            </span>
            <span className="hidden items-center gap-1.5 text-[#6674E8] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16B8A6]" /> Kết nối an toàn
            </span>
          </div>
        </section>

        <section className="flex w-full flex-1 items-center justify-center bg-[#F8FAFC] p-5 sm:p-10 lg:w-1/2 lg:p-16">
          <div className="w-full max-w-md">
            <div className="rounded-3xl border border-[#E5EAF2] bg-white p-6 shadow-xl shadow-indigo-100/40 sm:p-10">
              <div className="mb-6">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#EEF0FF] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6674E8]">
                  <Sparkles size={13} />
                  Chào mừng đến với trạm
                </div>
                <h2 className="mb-1.5 text-3xl font-extrabold tracking-tight">
                  {isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
                </h2>
                <p className="text-sm leading-6 text-[#52627A]">
                  {isRegister
                    ? 'Bắt đầu hành trình của bạn với tài khoản người học.'
                    : 'Tiếp tục hành trình học ngữ pháp của bạn.'}
                </p>
              </div>

              {error && (
                <div
                  className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm leading-5 text-[#992235]"
                  role="alert"
                >
                  <AlertCircle size={19} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form className="space-y-5" onSubmit={submit}>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-bold text-[#14213D]"
                    htmlFor="username"
                  >
                    Tên đăng nhập <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <CircleUserRound
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      size={19}
                      aria-hidden="true"
                    />
                    <input
                      className="h-12 w-full rounded-xl border border-[#E5EAF2] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#6674E8] focus:ring-4 focus:ring-[#6674E8]/15"
                      id="username"
                      autoComplete="username"
                      required
                      minLength={3}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Nhập tên đăng nhập"
                    />
                  </div>
                </div>

                {isRegister && (
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-bold text-[#14213D]"
                      htmlFor="display-name"
                    >
                      Tên hiển thị <span className="text-red-500">*</span>
                    </label>
                    <input
                      className="h-12 w-full rounded-xl border border-[#E5EAF2] bg-white px-4 text-sm outline-none transition focus:border-[#6674E8] focus:ring-4 focus:ring-[#6674E8]/15"
                      id="display-name"
                      autoComplete="name"
                      required
                      minLength={2}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Bạn muốn được gọi là gì?"
                    />
                  </div>
                )}

                <div>
                  <label
                    className="mb-1.5 block text-xs font-bold text-[#14213D]"
                    htmlFor="password"
                  >
                    Mật khẩu <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                      aria-hidden="true"
                    />
                    <input
                      className="h-12 w-full rounded-xl border border-[#E5EAF2] bg-white pl-11 pr-12 text-sm outline-none transition focus:border-[#6674E8] focus:ring-4 focus:ring-[#6674E8]/15"
                      id="password"
                      type={show ? 'text' : 'password'}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      required
                      minLength={isRegister ? 8 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu"
                    />
                    <button
                      className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-[#EEF0FF] hover:text-[#4B57C9]"
                      type="button"
                      onClick={() => setShow(!show)}
                      aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {show ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>
                </div>

                {isRegister && (
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-bold text-[#14213D]"
                      htmlFor="confirm-password"
                    >
                      Nhập lại mật khẩu <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <LockKeyhole
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        size={18}
                        aria-hidden="true"
                      />
                      <input
                        className="h-12 w-full rounded-xl border border-[#E5EAF2] bg-white pl-11 pr-12 text-sm outline-none transition focus:border-[#6674E8] focus:ring-4 focus:ring-[#6674E8]/15"
                        id="confirm-password"
                        type={show ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Nhập lại mật khẩu"
                      />
                    </div>
                  </div>
                )}

                <button
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#6674E8] font-bold tracking-wide text-white shadow-md shadow-[#6674E8]/25 transition hover:bg-[#4B57C9] hover:shadow-lg hover:shadow-[#6674E8]/35 disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />{' '}
                      Đang xử lý...
                    </>
                  ) : (
                    <>
                      {isRegister ? 'Đăng ký' : 'Đăng nhập'} <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 border-t border-[#E5EAF2] pt-6 text-center">
                <p className="text-sm text-[#52627A]">
                  {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
                  <Link
                    className="ml-1 inline-flex items-center gap-0.5 font-bold text-[#6674E8] hover:text-[#4B57C9] hover:underline"
                    to={isRegister ? '/login' : '/register'}
                  >
                    {isRegister ? 'Đăng nhập' : 'Đăng ký ngay'} <ArrowRight size={14} />
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
