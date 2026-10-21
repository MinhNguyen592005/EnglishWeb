import { ArrowRight, BookOpen, Check, ChevronRight, LockKeyhole, Sparkles, Star, Target, Trophy } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import type { Attempt, Difficulty, Lesson, Topic } from '../types'

const topicDetails: Record<string, { title: string; description: string; outcome: string }> = {
  'basic-tenses': {
    title: 'Nền tảng các thì',
    description: 'Xác định thời điểm của hành động trước khi ghép câu dài hơn.',
    outcome: 'Dùng đúng thì hiện tại và quá khứ trong tình huống quen thuộc.'
  },
  conditionals: {
    title: 'Câu điều kiện',
    description: 'Từ quy luật có thật đến giả định về hiện tại và quá khứ.',
    outcome: 'Chọn đúng cấu trúc if theo khả năng xảy ra của sự việc.'
  },
  'passive-voice': {
    title: 'Câu bị động',
    description: 'Đổi trọng tâm câu và chọn đúng dạng be theo thì.',
    outcome: 'Viết câu bị động ở hiện tại, quá khứ, tương lai và hiện tại hoàn thành.'
  },
  'relative-clauses': {
    title: 'Mệnh đề quan hệ',
    description: 'Nối thông tin về người, vật, nơi chốn và thời gian.',
    outcome: 'Dùng đúng đại từ quan hệ và dấu phẩy trong câu phức.'
  }
}
const topicOrder = ['basic-tenses', 'conditionals', 'passive-voice', 'relative-clauses']
const difficulties: { value: Difficulty; label: string; note: string }[] = [
  { value: 'BEGINNER', label: 'Cơ bản', note: 'Nhận diện và dùng đúng cấu trúc' },
  { value: 'INTERMEDIATE', label: 'Trung cấp', note: 'Phân biệt các trường hợp gần nhau' },
  { value: 'ADVANCED', label: 'Nâng cao', note: 'Vận dụng trong câu phức và ngữ cảnh' }
]
export const difficultyName = (value: Difficulty) => difficulties.find(item => item.value === value)?.label || 'Cơ bản'
export const topicName = (slug: string) => topicDetails[slug]?.title || slug.replaceAll('-', ' ')
export const sortLessons = (lessons: Lesson[]) => [...lessons].sort((a, b) => {
  const aOrder = topicOrder.indexOf(a.topicSlug), bOrder = topicOrder.indexOf(b.topicSlug)
  return (a.topicSortOrder ?? (aOrder < 0 ? topicOrder.length : aOrder)) - (b.topicSortOrder ?? (bOrder < 0 ? topicOrder.length : bOrder))
    || a.topicSlug.localeCompare(b.topicSlug) || a.ordinalNo - b.ordinalNo
})

export function Roadmap() {
  const {user}=useAuth()
  const { request,connected,subscribe } = useSystemSocket()
  const [lessons, setLessons] = useState<Lesson[] | null>(null)
  const [topics, setTopics] = useState<Topic[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Difficulty | 'ALL'>('ALL')
  const [busyTopic, setBusyTopic] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(()=>subscribe(message=>{if(message.action==='CURRICULUM_CHANGED')reload()}),[subscribe,reload])
  useEffect(() => {
    if(!connected)return
    let active = true
    setError('')
    // ROADMAP_DATA được onmessage trong Context ghép với requestId rồi cập nhật state.
    request<{topic: Topic; lessons: Lesson[]}[]>('GET_ROADMAP', 'ROADMAP_DATA',{passive:true}).then(groups => {
      if (!active) return
      setTopics(groups.map(group => group.topic))
      setLessons(groups.flatMap(group => group.lessons))
    }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [request, revision, user?.totalXp,connected])

  async function startChapter(topic: string, anchorId: number) {
    setBusyTopic(topic); setActionError('')
    try {
      const attempt = await request<Attempt>('START_ATTEMPT','ATTEMPT_DATA',{kind:'CHAPTER_BOSS',lessonId:anchorId})
      navigate(`/attempts/${attempt.id}`)
    } catch (e) { setActionError((e as Error).message) }
    finally { setBusyTopic(null) }
  }

  if (!lessons || !topics) return <Layout title="Lộ trình">{error ? <ErrorState message={error} retry={reload}/> : <Loading/>}</Layout>

  const ordered = topics.flatMap(topic => lessons.filter(lesson => lesson.topicSlug === topic.slug).sort((a,b) => a.ordinalNo-b.ordinalNo))
  const groups = topics.map(topic => ({ slug:topic.slug, topic, lessons:ordered.filter(lesson => lesson.topicSlug === topic.slug) }))
  const selected = groups.find(group => group.slug === search.get('planet') && group.topic.unlocked) || groups.find(group => group.topic.unlocked) || groups[0]
  const completed = ordered.filter(lesson => lesson.status === 'COMPLETED').length
  const finishedChapters = groups.filter(group => group.topic.chapterCompleted).length
  const next = ordered.find(lesson => lesson.status === 'AVAILABLE')
  const pendingBoss = groups.find(group => group.lessons.length > 0 && group.lessons.every(lesson => lesson.status === 'COMPLETED') && !group.topic.chapterCompleted)
  const percent = ordered.length ? Math.round(completed / ordered.length * 100) : 0
  let levelNumber = 0

  return <Layout title="Lộ trình">
    <div className="breadcrumb"><Link to="/dashboard">Tổng quan</Link><ChevronRight size={16}/> Lộ trình</div>
    <div className="page-heading"><div><span className="section-label">HỆ MẶT TRỜI TRI THỨC</span><h1>Du hành qua các hành tinh ngữ pháp</h1><p>Chạm vào hành tinh để khám phá bài học. Vượt boss cuối chủ đề để mở hành tinh tiếp theo.</p></div><div className="heading-icon"><Target size={35}/></div></div>

    <section className="card roadmap-summary" aria-label="Tiến độ lộ trình">
      <div className="roadmap-summary-main"><span className="section-label">TIẾN ĐỘ TOÀN LỘ TRÌNH</span><strong>{completed}<span>/{ordered.length}</span></strong><p>Bài học đã hoàn thành trên {groups.length} hành tinh</p><div className="progress-track"><div style={{width:`${percent}%`}}/></div><small>{percent}% hoàn thành · {finishedChapters}/{groups.length} boss hành tinh đã vượt qua</small></div>
      <div className="roadmap-next"><span className="section-label">BƯỚC TIẾP THEO</span><h2>{next ? next.title : pendingBoss ? `Boss: ${pendingBoss.topic.title}` : 'Bạn đã hoàn thành các cấp hiện có!'}</h2><p>{next ? `${groups.find(g=>g.slug===next.topicSlug)?.topic.title || topicName(next.topicSlug)} · ${difficultyName(next.difficulty)}` : pendingBoss ? 'Vượt thử thách cuối hành tinh để mở chủ đề tiếp theo.' : 'Bạn có thể ôn lại bài học hoặc thử lại boss cuối chủ đề.'}</p><Link className="button primary" to={next ? `/lessons/${next.id}` : pendingBoss ? `/roadmap?planet=${pendingBoss.slug}#${pendingBoss.slug}` : '/practice'}>{next ? 'Tiếp tục học' : pendingBoss ? 'Đến thử thách' : 'Ôn tập'} <ArrowRight size={17}/></Link></div>
    </section>

    <section className="planet-map" aria-label="Bản đồ các hành tinh chủ đề"><div className="planet-map-heading"><span className="section-label">BẢN ĐỒ KHÁM PHÁ</span><h2>Chọn hành tinh để bắt đầu</h2><p>Mỗi hành tinh chứa một chủ đề và các bài học riêng.</p></div><div className="planet-path">{groups.map((group,index) => {const done=group.lessons.filter(lesson=>lesson.status==='COMPLETED').length;return <div className="planet-stop" key={group.slug}><button type="button" className={`planet-button ${group.topic.planetStyle} ${selected?.slug===group.slug?'selected':''} ${group.topic.unlocked?'':'locked'}`} disabled={!group.topic.unlocked} aria-pressed={selected?.slug===group.slug} aria-label={`${group.topic.title}: ${group.topic.unlocked?`${done}/${group.lessons.length} bài đã hoàn thành`:'chưa mở khóa'}`} onClick={()=>{setSearch({planet:group.slug});setFilter('ALL')}}><span className="planet-halo"/><span className="planet-body"><span className="planet-surface"/></span><span className="planet-ring"/>{!group.topic.unlocked&&<span className="planet-lock"><LockKeyhole size={22}/></span>}</button><div className="planet-caption"><span>HÀNH TINH {String(index+1).padStart(2,'0')}</span><strong>{group.topic.title}</strong><small>{group.topic.unlocked?group.topic.chapterCompleted?'Đã chinh phục':`${done}/${group.lessons.length} bài hoàn thành`:'Vượt boss hành tinh trước để mở'}</small></div>{index<groups.length-1&&<span className={`planet-connector ${group.topic.chapterCompleted?'complete':''}`} aria-hidden="true"/>}</div>})}</div></section>

    <div className="roadmap-difficulty-heading"><div><span className="section-label">CHỌN MỨC ĐỘ</span><h2>Học theo năng lực của bạn</h2></div><button className={filter === 'ALL' ? 'roadmap-filter active' : 'roadmap-filter'} onClick={() => setFilter('ALL')}>Xem tất cả</button></div>
    <div className="roadmap-difficulties">{difficulties.map(item => {
      const inLevel = (selected?.lessons || []).filter(lesson => lesson.difficulty === item.value)
      const done = inLevel.filter(lesson => lesson.status === 'COMPLETED').length
      return <button key={item.value} className={`roadmap-difficulty ${item.value.toLowerCase()} ${filter === item.value ? 'active' : ''}`} onClick={() => setFilter(filter === item.value ? 'ALL' : item.value)} aria-pressed={filter === item.value}>
        <span className="roadmap-difficulty-top"><span>{item.label}</span><strong>{done}/{inLevel.length}</strong></span>
        <small>{item.note}</small><span className="roadmap-mini-track"><span style={{width:inLevel.length ? `${done / inLevel.length * 100}%` : '0%'}}/></span>
      </button>
    })}</div>

    {actionError && <div className="error-banner" role="alert">{actionError}</div>}
    <div className="roadmap-chapters">{selected && [selected].map((group) => {
      const index = groups.indexOf(group)
      const all = group.lessons
      const visible = all.filter(lesson => filter === 'ALL' || lesson.difficulty === filter)
      const done = all.filter(lesson => lesson.status === 'COMPLETED').length
      const chapterReady = done === all.length
      const chapterDone = all[0]?.chapterCompleted
      const detail = group.topic
      const firstLevel = groups.slice(0,index).reduce((sum,item)=>sum+item.lessons.length,0)+1
      levelNumber += all.length
      if (!visible.length) return <div className="card feature-card" key={group.slug}>Chưa có bài học ở mức độ này trên {group.topic.title}.</div>
      return <section className="roadmap-chapter" key={group.slug} id={group.slug} aria-labelledby={`chapter-${group.slug}`}>
        <div className="roadmap-chapter-header"><div className="roadmap-chapter-number">{String(index + 1).padStart(2, '0')}</div><div className="roadmap-chapter-copy"><span className="section-label">CHỦ ĐỀ {index + 1} · CẤP {firstLevel}–{levelNumber}</span><h2 id={`chapter-${group.slug}`}>{detail?.title || topicName(group.slug)}</h2><p>{detail?.description || 'Từng bài học mở rộng kỹ năng ngữ pháp của bạn.'}</p><small><Sparkles size={15}/>{detail?.outcome || 'Hoàn thành từng bài để nắm vững chủ đề.'}</small></div><div className="roadmap-chapter-progress"><strong>{done}/{all.length}</strong><span>bài đã hoàn thành</span><div className="progress-track"><div style={{width:`${done / all.length * 100}%`}}/></div></div></div>
        <div className="roadmap-levels">{visible.map(lesson => {
          const previous = all.find(item => item.ordinalNo === lesson.ordinalNo - 1)
          const number = firstLevel + all.findIndex(item => item.id === lesson.id)
          return <article className={`roadmap-level ${lesson.status.toLowerCase()}`} key={lesson.id}>
            <div className="roadmap-level-index">{lesson.status === 'COMPLETED' ? <Check size={20}/> : String(number).padStart(2, '0')}</div>
            <div className="roadmap-level-content"><div className="roadmap-level-kicker"><span>CẤP {String(number).padStart(2, '0')}</span><span className={`difficulty-badge ${lesson.difficulty.toLowerCase()}`}>{difficultyName(lesson.difficulty)}</span><span className={`roadmap-state ${lesson.status.toLowerCase()}`}>{lesson.status === 'COMPLETED' ? 'Đã hoàn thành' : lesson.status === 'AVAILABLE' ? 'Có thể học' : 'Chưa mở khóa'}</span></div><h3>{lesson.title}</h3><p>{lesson.summary}</p><div className="roadmap-level-meta"><span><BookOpen size={15}/> Lý thuyết + 10 câu luyện</span><span><Target size={15}/> Boss 5 câu đúng 5</span><span><Star size={15}/> +50 EXP lần đầu</span></div>{lesson.status === 'LOCKED' && <small className="roadmap-prerequisite"><LockKeyhole size={14}/> Vượt boss {previous?.title || 'cấp trước'} để mở khóa</small>}</div>
            <div className="roadmap-level-action">{lesson.status === 'LOCKED' ? <LockKeyhole size={20}/> : <Link className={`button ${lesson.status === 'COMPLETED' ? 'secondary' : 'primary'}`} to={`/lessons/${lesson.id}`}>{lesson.status === 'COMPLETED' ? 'Ôn lại' : 'Học cấp này'} <ArrowRight size={16}/></Link>}</div>
          </article>
        })}</div>
        {filter === 'ALL' && <div className={`roadmap-capstone ${chapterReady ? 'ready' : 'locked'}`}><div className="roadmap-capstone-icon"><Trophy size={25}/></div><div><span className="section-label">THỬ THÁCH CUỐI CHỦ ĐỀ</span><h3>Boss: {detail?.title || topicName(group.slug)}</h3><p>10 câu tổng hợp · cần đúng ít nhất 8 · +150 EXP lần đầu</p><small>{chapterDone ? 'Đã vượt qua. Bạn có thể chơi lại để ôn tập.' : chapterReady ? 'Đã mở khóa. Hãy thử sức!' : `Hoàn thành ${all.length - done} boss bài học còn lại để mở khóa.`}</small></div>{chapterReady ? <button className={`button ${chapterDone ? 'secondary' : 'primary'}`} disabled={busyTopic !== null} onClick={() => startChapter(group.slug, all.at(-1)!.id)}>{busyTopic === group.slug ? 'Đang tạo...' : chapterDone ? 'Chơi lại' : 'Đánh boss'}</button> : <LockKeyhole size={20}/>}</div>}
      </section>
    })}</div>
  </Layout>
}
