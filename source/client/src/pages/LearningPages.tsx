import { ArrowRight, BookOpen, ChevronRight, CircleAlert, Rocket, ShieldCheck, Sparkles, Target, Trophy, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import { Layout } from '../components/Layout'
import { DailyQuestsWidget } from '../components/DailyQuestsWidget'
import { ErrorState, Loading } from '../components/States'
import { difficultyName, sortLessons, topicName } from './RoadmapPage'
import type { Lesson, Attempt } from '../types'

function useLessons() {
  const {user}=useAuth()
  const { request,connected,subscribe } = useSystemSocket()
  const [revision,setRevision]=useState(0)
  useEffect(()=>subscribe(message=>{if(message.action==='CURRICULUM_CHANGED')setRevision(value=>value+1)}),[subscribe])
  const [data, setData] = useState<Lesson[] | null>(null)
  const [error, setError] = useState('')
  const reload = () => { setError(''); request<{lessons: Lesson[]}[]>('GET_ROADMAP', 'ROADMAP_DATA',{passive:true}).then(groups => setData(groups.flatMap(group => group.lessons))).catch(e => setError(e.message)) }
  useEffect(()=>{if(connected)reload()}, [request,user?.totalXp,connected,revision])
  return { data, error, reload }
}
const progress = (lessons: Lesson[]) => lessons.filter(l => l.status === 'COMPLETED').length

export function Dashboard() {
  const { user } = useAuth()
  const { data, error, reload } = useLessons()
  if (!data) return <Layout title="Tổng quan">{error ? <ErrorState message={error} retry={reload}/> : <Loading/>}</Layout>
  const ordered=sortLessons(data)
  const completedCount=progress(data)
  const progressPercent=data.length ? Math.round(completedCount/data.length*100) : 0
  const current = ordered.find(l => l.status === 'AVAILABLE')
  const bossLesson = current ?? ordered.find(lesson => lesson.status !== 'LOCKED')
  const pendingTopic=[...new Set(ordered.map(l=>l.topicSlug))].find(slug=>{
    const chapter=ordered.filter(l=>l.topicSlug===slug)
    return chapter.every(l=>l.status==='COMPLETED')&&!chapter[0].chapterCompleted
  })
  const pendingName=ordered.find(l=>l.topicSlug===pendingTopic)?.topicTitle || (pendingTopic ? topicName(pendingTopic) : '')
  const xpPercent=Math.min(100, Math.max(0, user?.xpInLevel || 0) / 10)
  const currentLevel=user?.level || 1
  const nextLevelXp=currentLevel*1000
  const xpToNextLevel=Math.max(0, nextLevelXp-(user?.totalXp || 0))
  const hasLessons=data.length>0
  const nextHref=current ? `/lessons/${current.id}` : pendingTopic ? `/roadmap?planet=${pendingTopic}#${pendingTopic}` : '/roadmap'

  return <Layout title="Tổng quan">
    <div className="mb-7 flex items-start justify-between gap-5">
      <div>
        <span className="section-label">TRẠM CHỈ HUY</span>
        <h1 className="mb-1 mt-2">Chào {user?.displayName || user?.username}!</h1>
        <p className="mb-0 text-[#52627A]">Một bài học nhỏ hôm nay sẽ đưa bạn đến hành trình lớn hơn.</p>
      </div>
      <div className="grid h-[74px] w-[74px] shrink-0 place-items-center rounded-[20px] bg-[#EEF0FF] text-[#4B57C9] shadow-sm"><Rocket size={36}/></div>
    </div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,1fr)]">
      <div className="contents lg:grid lg:content-start lg:gap-5">
        <section className="relative min-h-[276px] overflow-hidden rounded-[20px] bg-gradient-to-br from-[#4B57C9] via-[#6674E8] to-[#8D98F4] p-7 text-white shadow-lg shadow-[#6674E8]/20 sm:p-8">
          <div className="relative z-10 max-w-[72%] sm:max-w-[66%]">
            <span className="text-xs font-bold tracking-[0.14em] text-[#E5E8FF]">HÀNH TRÌNH HIỆN TẠI</span>
            <h2 className="mt-3 text-2xl font-extrabold text-white sm:text-[1.7rem]">Chinh phục ngữ pháp</h2>
            <p className="mt-2 text-sm leading-6 text-[#EDF0FF]">Theo dõi từng chủ đề và tiến bộ qua mỗi chặng học.</p>
            <div className="mt-7 flex items-center justify-between text-xs font-bold">
              <span>{hasLessons ? `${completedCount}/${data.length} bài đã hoàn thành` : 'Chưa có bài học'}</span>
              <strong>{hasLessons ? `${progressPercent}%` : '—'}</strong>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/30" role="progressbar" aria-label="Tiến độ học tập" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
              <div className="h-full rounded-full bg-[#71F8E4] transition-all" style={{width:`${progressPercent}%`}}/>
            </div>
            <Link className="group mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#4F46E5] px-6 py-3 text-sm font-bold !text-white shadow-md shadow-[#4F46E5]/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4338CA] hover:shadow-lg hover:shadow-[#4F46E5]/35 active:translate-y-0 active:scale-95" to="/roadmap">Xem lộ trình <ArrowRight className="text-white transition-transform duration-200 group-hover:translate-x-1" size={17}/></Link>
          </div>
          <div className="pointer-events-none absolute -right-10 top-5 grid h-64 w-64 place-items-center rounded-full border border-white/20 sm:-right-2 sm:h-72 sm:w-72" aria-hidden="true">
            <div className="grid h-36 w-36 place-items-center rounded-full bg-[#B9E5FF]/70 shadow-[0_20px_45px_rgba(23,37,120,0.3)]"><div className="h-24 w-24 rounded-full bg-gradient-to-br from-[#E5FAFF] to-[#8BBBF4]"/></div>
          </div>
          <Sparkles className="absolute right-[22%] top-7 text-[#FFE7A4]" size={16}/>
        </section>

        <section className="rounded-[15px] border border-[#E5EAF2] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3 border-b border-[#E5EAF2] pb-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF0FF] text-[#4B57C9]"><BookOpen size={20}/></div>
            <div><span className="inline-flex rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-[11px] font-bold tracking-[0.08em] text-[#1D4ED8]">{current ? 'BÀI HỌC TIẾP THEO' : pendingTopic ? 'MỤC TIÊU TIẾP THEO' : 'LỘ TRÌNH CỦA BẠN'}</span><p className="mt-1 text-xs text-[#7A8AA4]">Tiếp tục chặng học của bạn</p></div>
          </div>
          <div className="mt-4 rounded-xl border border-[#E5EAF2] bg-[#F8FAFC] p-4 sm:p-5">
            <h2 className="text-lg font-bold text-[#14213D]">{current?.title || (pendingTopic ? pendingName : hasLessons ? 'Bạn đã hoàn thành các bài hiện có' : 'Bắt đầu hành trình học')}</h2>
            <p className="mt-1 text-sm leading-6 text-[#52627A]">{current?.summary || (pendingTopic ? 'Khám phá mục tiêu tiếp theo trong lộ trình của bạn.' : hasLessons ? 'Bạn có thể xem lại lộ trình hoặc luyện tập thêm.' : 'Hãy khám phá lộ trình để tìm bài học đầu tiên.')}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-[#52627A]">
              <span className="rounded-full border border-[#BAE6FD] bg-[#F0F9FF] px-2.5 py-1 text-[#0369A1]">◉ Kiến thức trọng tâm</span>
              <span className="rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-2.5 py-1 text-[#C2410C]">◷ Khoảng 15 phút</span>
              <span className="rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-1 text-[#4B5563]">✦ Học theo lộ trình</span>
            </div>
          </div>
          <div className="mt-4 flex justify-end"><Link className="group inline-flex min-h-10 items-center gap-2 rounded-full bg-[#4F46E5] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[#4F46E5]/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4338CA] hover:shadow-lg hover:shadow-[#4F46E5]/30 active:translate-y-0 active:scale-95" to={nextHref}>{current ? 'Tiếp tục học' : pendingTopic ? 'Khám phá mục tiêu' : 'Xem lộ trình'} <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" size={17}/></Link></div>
        </section>

        <div className="order-3 grid content-start gap-5 lg:order-none">
        <section className="rounded-[15px] border border-[#E5EAF2] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[#E5EAF2] pb-4">
            <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#FFF7E6] text-[#A36B0A]"><ShieldCheck size={22}/></div>
            <span className="text-xs font-bold tracking-[0.1em] text-[#52627A]">TIẾN ĐỘ CỦA BẠN</span>
            </div>
            <span className="rounded-full bg-[#FFF7E6] px-2.5 py-1 text-[11px] font-bold text-[#A36B0A]">Cấp {user?.level ?? '—'}</span>
          </div>
          <div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-xs text-[#7A8AA4]">Tiến trình cấp độ</p><h2 className="mt-1 text-xl font-extrabold text-[#14213D]">{user ? `${user.xpInLevel.toLocaleString('vi-VN')} / 1.000 XP` : '—'}</h2></div><strong className="text-sm text-[#4B57C9]">{Math.round(xpPercent)}%</strong></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E9EDF4]" role="progressbar" aria-label="XP trong cấp hiện tại" aria-valuemin={0} aria-valuemax={100} aria-valuenow={xpPercent}><div className="h-full rounded-full bg-[#6674E8]" style={{width:`${xpPercent}%`}}/></div>
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#E5EAF2] pt-4"><div className="rounded-xl bg-[#F8FAFC] p-3"><span className="block text-[11px] text-[#7A8AA4]">Tổng XP tích lũy</span><strong className="mt-1 block text-base text-[#14213D]">{user?.totalXp?.toLocaleString('vi-VN') ?? '—'} XP</strong></div><div className="rounded-xl bg-[#FFF7E6] p-3"><span className="block text-[11px] text-[#925500]">Còn để lên cấp</span><strong className="mt-1 block text-base text-[#925500]">{xpToNextLevel.toLocaleString('vi-VN')} XP</strong></div></div>
        </section>

        <section className="rounded-[15px] border border-[#E5EAF2] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#E8FAF6] text-[#087F73]"><Target size={22}/></div><span className="text-xs font-bold tracking-[0.1em] text-[#52627A]">ĐÍCH ĐẾN</span></div>
          <h2 className="mt-5 text-lg font-bold">Mở khóa Cấp {currentLevel + 1}</h2>
          <p className="mt-2 text-sm leading-6 text-[#52627A]">Tích lũy thêm <strong className="text-[#14213D]">{xpToNextLevel.toLocaleString('vi-VN')} XP</strong> để mở khóa cấp độ tiếp theo.</p>
          <div className="mt-4 rounded-xl bg-[#F8FAFC] p-3.5"><div className="mb-2 flex justify-between text-xs font-semibold text-[#52627A]"><span>{user?.totalXp?.toLocaleString('vi-VN') ?? '—'} XP</span><span>{nextLevelXp.toLocaleString('vi-VN')} XP</span></div><div className="h-2 overflow-hidden rounded-full bg-[#E5EAF2]"><div className="h-full rounded-full bg-[#16B8A6]" style={{width:`${Math.min(100, (user?.totalXp || 0)/nextLevelXp*100)}%`}}/></div></div>
          <p className="mt-3 text-xs text-[#7A8AA4]">{pendingTopic ? `Chủ đề tiếp theo: ${pendingName}` : current ? 'Hoàn thành bài học đang chờ để tiếp tục tiến bộ.' : 'Khám phá lộ trình để tìm mục tiêu học tập.'}</p>
          <Link className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#4B57C9] hover:text-[#3643BD]" to="/roadmap">Mở lộ trình <ChevronRight size={17}/></Link>
        </section>

        {!hasLessons && <section className="flex gap-3 rounded-[15px] border border-[#F4B544]/40 bg-[#FFF7E6] p-5 text-sm text-[#925500]" role="status"><CircleAlert className="shrink-0" size={19}/><span>Dữ liệu bài học chưa sẵn sàng. Bạn có thể thử tải lại hoặc mở lộ trình.</span></section>}
        </div>
      </div>
      <aside className="order-2 grid content-start gap-5 lg:order-none">
        <DailyQuestsWidget bossHref={bossLesson ? `/lessons/${bossLesson.id}` : null}/>
      </aside>
    </div>
  </Layout>
}

export function LessonPage() {
  const { request,connected } = useSystemSocket()
  const { id } = useParams()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    if(!connected)return
    let active = true
    setLesson(null)
    setError('')
    // LESSON_THEORY_DATA từ socket -> Promise theo requestId -> state -> render theory.
    request<Lesson>('VIEW_LESSON_THEORY', 'LESSON_THEORY_DATA', { lessonId: Number(id) })
      .then(data => { if (active) setLesson(data) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false } // Không cập nhật bài cũ sau khi chuyển trang/đổi ID.
  }, [id, request,connected])
  async function start(kind: 'PRACTICE' | 'LESSON_BOSS') { if(!lesson) return; setBusy(true); setActionError(''); try { const a=await request<Attempt>('START_ATTEMPT','ATTEMPT_DATA',{kind,lessonId:lesson.id}); navigate(`/attempts/${a.id}`) } catch(e) { setActionError((e as Error).message) } finally { setBusy(false) } }
  return <Layout title="Bài học">{!lesson ? error ? <ErrorState message={error}/> : <Loading/> : <><div className="breadcrumb"><Link to="/roadmap">Lộ trình</Link><ChevronRight size={16}/>{lesson.title}</div><div className="page-heading"><div><span className="section-label">BÀI {lesson.ordinalNo+1} · {(lesson.topicTitle || topicName(lesson.topicSlug)).toUpperCase()} · {difficultyName(lesson.difficulty).toUpperCase()}</span><h1>{lesson.title}</h1><p>{lesson.summary}</p></div><div className="heading-icon"><BookOpen size={36}/></div></div><div className="lesson-page-grid"><article className="card theory-card"><div className="theory-heading"><div className="card-icon purple"><BookOpen size={23}/></div><h2>Kiến thức trọng tâm</h2></div>{lesson.theory?.split('. ').map((paragraph,index) => <p key={index}>{paragraph.trim().replace(/\.$/,'')}.</p>)}<div className="callout"><Zap size={21}/><span>Đọc kỹ cấu trúc, sau đó thử sức với các câu hỏi. Đáp án và giải thích sẽ xuất hiện sau khi bạn nộp từng câu.</span></div></article><aside className="card lesson-next"><span className="section-label">SẴN SÀNG LUYỆN TẬP?</span><h2>Biến kiến thức thành kỹ năng</h2><p>Luyện 10 câu hoặc thử thách boss 5 câu. Boss bài học cần đúng cả 5 câu để hoàn thành trạm.</p><button className="button primary full" disabled={busy || !connected || lesson.status === 'LOCKED'} onClick={() => start('PRACTICE')}>Luyện tập 10 câu <ArrowRight size={18}/></button><button className="button secondary full" disabled={busy || !connected || lesson.status === 'LOCKED'} onClick={() => start('LESSON_BOSS')}>Đánh boss bài học <Trophy size={18}/></button>{lesson.status === 'LOCKED' && <p className="muted">Cần hoàn thành boss bài trước.</p>}{actionError && <div className="error-banner" role="alert">{actionError}</div>}</aside></div></>}</Layout>
}

export function PracticeSelect() {
  const { request,connected } = useSystemSocket()
  const { data, error, reload } = useLessons()
  const [busy, setBusy] = useState<number|null>(null)
  const [actionError, setActionError] = useState('')
  const navigate = useNavigate()
  async function start(id: number) { setBusy(id); setActionError(''); try { const a=await request<Attempt>('START_ATTEMPT','ATTEMPT_DATA',{kind:'PRACTICE',lessonId:id}); navigate(`/attempts/${a.id}`) } catch(e) { setActionError((e as Error).message) } finally { setBusy(null) } }
  return <Layout title="Luyện tập"><div className="page-heading"><div><span className="section-label">PHÒNG LUYỆN TẬP</span><h1>Chọn bài luyện tập</h1><p>Trả lời từng câu, nhận lời giải từ máy chủ và ôn lại câu sai.</p></div><div className="heading-icon"><Target size={36}/></div></div>{!data ? error ? <ErrorState message={error} retry={reload}/> : <Loading/> : <div className="practice-grid">{sortLessons(data).map(l => <article className={`card practice-card ${l.status==='LOCKED'?'dimmed':''}`} key={l.id}><div className="card-icon purple"><BookOpen size={24}/></div><span className="section-label">{(l.topicTitle || topicName(l.topicSlug))} · BÀI {l.ordinalNo+1} · {difficultyName(l.difficulty)}</span><h2>{l.title}</h2><p>{l.summary}</p><div className="practice-footer"><span>10 câu hỏi</span><button className="button primary" disabled={!connected||l.status==='LOCKED'||busy!==null} onClick={() => start(l.id)}>{l.status==='LOCKED'?'Chưa mở khóa':busy===l.id?'Đang tạo...':'Bắt đầu'} <ArrowRight size={17}/></button></div></article>)}</div>}{actionError && <div className="error-banner" role="alert">{actionError}</div>}</Layout>
}
