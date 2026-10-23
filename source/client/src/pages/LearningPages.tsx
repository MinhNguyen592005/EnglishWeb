import { ArrowRight, BookOpen, ChevronRight, Rocket, Star, Target, Trophy, Zap } from 'lucide-react'
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
  const ordered=sortLessons(data), current = ordered.find(l => l.status === 'AVAILABLE')
  const pendingTopic=[...new Set(ordered.map(l=>l.topicSlug))].find(slug=>{const chapter=ordered.filter(l=>l.topicSlug===slug);return chapter.every(l=>l.status==='COMPLETED')&&!chapter[0].chapterCompleted})
  const pendingName=ordered.find(l=>l.topicSlug===pendingTopic)?.topicTitle || (pendingTopic ? topicName(pendingTopic) : '')
  return <Layout title="Tổng quan"><div className="page-heading"><div><span className="section-label">TRẠM CHỈ HUY</span><h1>Chào {user?.displayName}! <span className="wave">✦</span></h1><p>Một bài học nhỏ hôm nay sẽ đưa bạn đến hành tinh lớn hơn.</p></div><div className="heading-icon"><Rocket size={38}/></div></div>
    <div className="dashboard-grid"><div className="primary-column"><section className="hero-card"><div><span className="hero-kicker">HÀNH TRÌNH HIỆN TẠI</span><h2>Chinh phục ngữ pháp</h2><p>Nhiều chủ đề và cấp độ từ cơ bản đến nâng cao.</p><div className="hero-progress"><span>{progress(data)}/{data.length} cấp độ hoàn thành</span><strong>{data.length?Math.round(progress(data)/data.length*100):0}%</strong></div><div className="progress-track"><div style={{width:`${data.length?progress(data)/data.length*100:0}%`}}/></div><Link className="button white" to="/roadmap">Xem lộ trình <ArrowRight size={18}/></Link></div><div className="hero-planet"><span>✦</span><div className="planet"/></div></section>
      <DailyQuestsWidget/>
      <section className="card current-card"><div className="card-title-row"><div className="card-icon purple"><BookOpen size={22}/></div><span className="tag">{current?'BÀI HỌC TIẾP THEO':pendingTopic?'THỬ THÁCH TIẾP THEO':'LỘ TRÌNH CỦA BẠN'}</span></div><h3>{current?.title || (pendingTopic ? `Boss: ${pendingName}` : 'Đã hoàn thành các bài hiện có')}</h3><p>{current?.summary || (pendingTopic ? 'Vượt boss cuối hành tinh để mở chủ đề tiếp theo.' : 'Bạn có thể ôn lại bài học và luyện tập thêm.')}</p><Link className="button primary" to={current ? `/lessons/${current.id}` : pendingTopic ? `/roadmap?planet=${pendingTopic}#${pendingTopic}` : '/roadmap'}>{current?'Tiếp tục học':pendingTopic?'Đến thử thách':'Xem lộ trình'} <ArrowRight size={18}/></Link></section>
    </div><aside className="secondary-column"><section className="card stat-card"><div className="card-title-row"><div className="card-icon amber"><Star size={22}/></div><span>TIẾN ĐỘ CỦA BẠN</span></div><h3>Cấp {user?.level}</h3><p>{user?.xpInLevel} / 1.000 EXP để lên cấp</p><div className="progress-track xp"><div style={{width:`${(user?.xpInLevel||0)/10}%`}}/></div><div className="stat-split"><span>Tổng EXP</span><strong>{user?.totalXp}</strong></div></section><section className="card goal-card"><div className="card-title-row"><div className="card-icon mint"><Target size={22}/></div><span>ĐÍCH ĐẾN</span></div><h3>Boss cuối chủ đề</h3><p>Vượt boss của từng cấp để mở cấp tiếp theo, rồi hoàn thành thử thách tổng hợp để nhận 150 EXP.</p><Link to="/roadmap">Xem điều kiện <ChevronRight size={17}/></Link></section></aside></div>
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

