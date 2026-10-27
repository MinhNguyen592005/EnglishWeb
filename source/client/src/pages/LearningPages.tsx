import { ArrowRight, BookOpen, ChevronRight, Trophy, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import { Layout } from '../components/Layout'
import { DashboardHome } from './DashboardHome'
import { ErrorState, Loading } from '../components/States'
import { difficultyName, topicName } from './RoadmapPage'
import type { Lesson, Attempt } from '../types'

function useLessons() {
  const { user } = useAuth()
  const { request, connected, subscribe } = useSystemSocket()
  const [revision, setRevision] = useState(0)
  useEffect(
    () =>
      subscribe((message) => {
        if (message.action === 'CURRICULUM_CHANGED') setRevision((value) => value + 1)
      }),
    [subscribe],
  )
  const [data, setData] = useState<Lesson[] | null>(null)
  const [error, setError] = useState('')
  const reload = () => {
    setError('')
    request<{ lessons: Lesson[] }[]>('GET_ROADMAP', 'ROADMAP_DATA', { passive: true })
      .then((groups) => setData(groups.flatMap((group) => group.lessons)))
      .catch((e) => setError(e.message))
  }
  useEffect(() => {
    if (connected) reload()
  }, [request, user?.totalXp, connected, revision])
  return { data, error, reload }
}

export function Dashboard() {
  const { data, error, reload } = useLessons()
  if (!data)
    return (
      <Layout title="Tổng quan">
        {error ? <ErrorState message={error} retry={reload} /> : <Loading />}
      </Layout>
    )
  return <DashboardHome lessons={data} />
}

export function LessonPage() {
  const { request, connected } = useSystemSocket()
  const { id } = useParams()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    if (!connected) return
    let active = true
    setLesson(null)
    setError('')
    // LESSON_THEORY_DATA từ socket -> Promise theo requestId -> state -> render theory.
    request<Lesson>('VIEW_LESSON_THEORY', 'LESSON_THEORY_DATA', { lessonId: Number(id) })
      .then((data) => {
        if (active) setLesson(data)
      })
      .catch((error) => {
        if (active) setError(error.message)
      })
    return () => {
      active = false
    } // Không cập nhật bài cũ sau khi chuyển trang/đổi ID.
  }, [id, request, connected])
  async function start(kind: 'PRACTICE' | 'LESSON_BOSS') {
    if (!lesson) return
    setBusy(true)
    setActionError('')
    try {
      const a = await request<Attempt>('START_ATTEMPT', 'ATTEMPT_DATA', {
        kind,
        lessonId: lesson.id,
      })
      navigate(`/attempts/${a.id}`)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Layout title="Bài học">
      {!lesson ? (
        error ? (
          <ErrorState message={error} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <div className="breadcrumb">
            <Link to="/roadmap">Lộ trình</Link>
            <ChevronRight size={16} />
            {lesson.title}
          </div>
          <div className="page-heading">
            <div>
              <span className="section-label">
                BÀI {lesson.ordinalNo + 1} ·{' '}
                {(lesson.topicTitle || topicName(lesson.topicSlug)).toUpperCase()} ·{' '}
                {difficultyName(lesson.difficulty).toUpperCase()}
              </span>
              <h1>{lesson.title}</h1>
              <p>{lesson.summary}</p>
            </div>
            <div className="heading-icon">
              <BookOpen size={36} />
            </div>
          </div>
          <div className="lesson-page-grid">
            <article className="card theory-card">
              <div className="theory-heading">
                <div className="card-icon purple">
                  <BookOpen size={23} />
                </div>
                <h2>Kiến thức trọng tâm</h2>
              </div>
              {lesson.theory?.split('. ').map((paragraph, index) => (
                <p key={index}>{paragraph.trim().replace(/\.$/, '')}.</p>
              ))}
              <div className="callout">
                <Zap size={21} />
                <span>
                  Đọc kỹ cấu trúc, sau đó thử sức với các câu hỏi. Đáp án và giải thích sẽ xuất hiện
                  sau khi bạn nộp từng câu.
                </span>
              </div>
            </article>
            <aside className="card lesson-next">
              <span className="section-label">SẴN SÀNG LUYỆN TẬP?</span>
              <h2>Biến kiến thức thành kỹ năng</h2>
              <p>
                Luyện 10 câu hoặc thử thách boss 5 câu. Boss bài học cần đúng cả 5 câu để hoàn thành
                trạm.
              </p>
              <button
                className="button primary full"
                disabled={busy || !connected || lesson.status === 'LOCKED'}
                onClick={() => start('PRACTICE')}
              >
                Luyện tập 10 câu <ArrowRight size={18} />
              </button>
              <button
                className="button secondary full"
                disabled={busy || !connected || lesson.status === 'LOCKED'}
                onClick={() => start('LESSON_BOSS')}
              >
                Đánh boss bài học <Trophy size={18} />
              </button>
              {lesson.status === 'LOCKED' && (
                <p className="muted">Cần hoàn thành boss bài trước.</p>
              )}
              {actionError && (
                <div className="error-banner" role="alert">
                  {actionError}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </Layout>
  )
}

export { PracticePage as PracticeSelect } from './PracticePage'
