import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Shuffle,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSystemSocket } from '../app/SystemSocketContext'
import { useDailyQuests } from '../app/DailyQuestsContext'
import { Layout } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import { StudyQuiz } from './roadmap/StudyQuiz'
import type { StudyAttempt, StudyCourse, StudyKind } from './roadmap/types'
import './roadmap/study.css'
import './practice-page.css'
import './practice-refresh.css'

export function PracticePage() {
  const { request, subscribe, connected } = useSystemSocket()
  const { refresh: refreshQuests } = useDailyQuests()
  const [params, setParams] = useSearchParams()
  const [course, setCourse] = useState<StudyCourse | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null)
  const [attemptError, setAttemptError] = useState('')
  const [revision, setRevision] = useState(0)
  const starting = useRef(false)
  const keys = useRef(new Map<string, string>())
  const attemptId = Number(params.get('attempt')) || 0
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useRealtimeRefresh(reload, connected)

  useEffect(
    () =>
      subscribe((message) => {
        if (
          message.action === 'ROADMAP_PROGRESS_CHANGED' ||
          message.action === 'CURRICULUM_CHANGED'
        )
          reload()
      }),
    [subscribe, reload],
  )
  useEffect(() => {
    if (!connected) return
    let active = true
    setError('')
    request<StudyCourse>('ROADMAP_OPEN', 'ROADMAP_COURSE_DATA')
      .then((data) => {
        if (active) setCourse(data)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [connected, request, revision])
  useEffect(() => {
    setAttempt(null)
    setAttemptError('')
    if (!attemptId || !connected) return
    let active = true
    request<StudyAttempt>('ROADMAP_ATTEMPT', 'ROADMAP_COURSE_DATA', { attemptId })
      .then((data) => {
        if (!active) return
        if (data.kind !== 'MODULE_REVIEW' && data.kind !== 'LEVEL_REVIEW')
          throw new Error(
            'Lượt này không thuộc phần luyện tập. Mở lộ trình để tiếp tục bài học hoặc kiểm tra.',
          )
        setAttempt(data)
      })
      .catch((e) => {
        if (active) setAttemptError(e.message)
      })
    return () => {
      active = false
    }
  }, [attemptId, connected, request, revision])

  const level =
    course?.levels.find((item) => item.id === Number(params.get('level')) && item.unlocked) ??
    course?.levels.find((item) => item.unlocked && !item.passed) ??
    course?.levels.find((item) => item.unlocked)
  const available = level?.modules.filter((module) => module.unlocked) ?? []
  const back = () => {
    setParams(level ? { level: String(level.id) } : {})
    setActionError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function start(kind: StudyKind, referenceId: string) {
    if (starting.current || !connected) return
    starting.current = true
    setBusy(`${kind}:${referenceId}`)
    setActionError('')
    const key = `${kind}:${referenceId}`
    if (!keys.current.has(key)) keys.current.set(key, crypto.randomUUID())
    try {
      const data = await request<StudyAttempt>('ROADMAP_START', 'ROADMAP_COURSE_DATA', {
        kind,
        referenceId,
        requestKey: keys.current.get(key),
      })
      keys.current.delete(key)
      setParams({ level: String(data.levelId), attempt: String(data.id) })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      starting.current = false
      setBusy(null)
    }
  }
  function updateAttempt(data: StudyAttempt) {
    if (data.id !== attemptId)
      setParams({ level: String(data.levelId), attempt: String(data.id) }, { replace: true })
    setAttempt(data)
    if (data.status !== 'IN_PROGRESS') void refreshQuests()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <Layout title="Luyện tập">
      <div className="practice-home study-course">
        {attemptId ? (
          <>
            <button type="button" className="practice-back" onClick={back}>
              <ArrowLeft size={15} />
              Chọn nội dung luyện tập
            </button>
            {attemptError ? (
              <ErrorState message={attemptError} retry={reload} />
            ) : !attempt ? (
              <Loading />
            ) : (
              <>
                <div className="practice-attempt-note">
                  LEVEL {attempt.levelId} ·{' '}
                  {attempt.kind === 'LEVEL_REVIEW'
                    ? 'Ôn tổng hợp các module đã mở'
                    : 'Ôn tập module'}
                  <span>Kết quả luyện tập không thay thế bài kiểm tra mở khóa.</span>
                </div>
                <StudyQuiz
                  key={`${attempt.id}:${attempt.status}`}
                  attempt={attempt}
                  onAttempt={updateAttempt}
                  onBack={back}
                  backLabel="Chọn nội dung khác"
                />
              </>
            )}
          </>
        ) : (
          <>
            <header className="practice-heading">
              <div>
                <h1>Luyện một chút, vững hơn mỗi ngày.</h1>
                <p>Chọn nội dung đã mở, luyện câu hỏi ngẫu nhiên và xem lại lời giải.</p>
              </div>
              <Link to="/roadmap">
                Mở lộ trình
                <ArrowRight size={15} />
              </Link>
            </header>
            {!course ? (
              error ? (
                <ErrorState message={error} retry={reload} />
              ) : (
                <Loading />
              )
            ) : (
              <>
                {error && (
                  <div className="error-banner" role="alert">
                    {error}
                    <button type="button" onClick={reload}>
                      Tải lại
                    </button>
                  </div>
                )}
                <div className="practice-levels" role="group" aria-label="Chọn level luyện tập">
                  {course.levels.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      disabled={!item.unlocked || busy !== null}
                      aria-pressed={item.id === level?.id}
                      title={item.unlocked ? item.title : 'Vượt kiểm tra level trước để mở khóa'}
                      onClick={() => {
                        setParams({ level: String(item.id) })
                        setActionError('')
                      }}
                    >
                      <span className="practice-level-number">{String(item.id).padStart(2, '0')}</span>
                      <span>Level {item.id}</span>
                      {!item.unlocked ? (
                        <LockKeyhole size={13} />
                      ) : item.passed ? (
                        <CheckCircle2 size={13} />
                      ) : null}
                    </button>
                  ))}
                </div>
                {!level ? (
                  <div className="practice-empty">
                    <BookOpen size={26} />
                    <h2>Chưa có nội dung luyện tập</h2>
                    <p>Hoàn thành kiểm tra đầu vào và mở lộ trình để bắt đầu.</p>
                    <Link to="/roadmap">
                      Xem lộ trình
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                ) : (
                  <>
                    <section className="practice-mixed">
                      <div>
                        <span className="practice-eyebrow">ÔN TỔNG HỢP · LEVEL {level.id}</span>
                        <h2>{level.title}</h2>
                        <p>
                          Trộn câu hỏi từ {available.length} module đã mở trong level này. Các
                          module còn khóa không xuất hiện trong đề.
                        </p>
                        <div className="practice-mixed-meta">
                          <span>
                            <Shuffle size={14} />
                            Tối đa 10 câu ngẫu nhiên
                          </span>
                          <span>
                            <Layers3 size={14} />
                            {available.length}/{level.modules.length} module đã mở
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="practice-primary practice-start-mixed"
                        disabled={busy !== null || !connected || available.length === 0}
                        onClick={() => void start('LEVEL_REVIEW', String(level.id))}
                      >
                        {busy === `LEVEL_REVIEW:${level.id}` ? (
                          <LoaderCircle size={16} className="practice-spin" />
                        ) : (
                          <Shuffle size={16} />
                        )}
                        Luyện tổng hợp
                        <ArrowRight size={15} />
                      </button>
                    </section>
                    {actionError && (
                      <div className="error-banner" role="alert">
                        {actionError}
                      </div>
                    )}
                    <div className="practice-module-heading">
                      <div>
                        <h2>Hoặc ôn riêng từng module</h2>
                        <p>Tập trung vào phần kiến thức bạn muốn luyện thêm.</p>
                      </div>
                      <span>{level.modules.length} module</span>
                    </div>
                    <div className="practice-modules">
                      {level.modules.map((module) => (
                        <article
                          key={module.id}
                          className={`practice-module ${module.unlocked ? '' : 'is-locked'}`}
                        >
                          <span className="practice-module-index">
                            {module.unlocked ? (
                              String(module.ordinalNo).padStart(2, '0')
                            ) : (
                              <LockKeyhole size={16} />
                            )}
                          </span>
                          <div>
                            <span className="practice-eyebrow">MODULE {module.ordinalNo}</span>
                            <h3>{module.title}</h3>
                            <p>
                              {module.unlocked
                                ? `${module.lessonCount} bài học · ${module.completedCount} bài đã hoàn thành`
                                : module.lockReason || 'Tiếp tục lộ trình để mở module này.'}
                            </p>
                            <div
                              className="practice-module-progress"
                              role="progressbar"
                              aria-label={`Tiến độ học ${module.title}`}
                              aria-valuemin={0}
                              aria-valuemax={module.lessonCount || 1}
                              aria-valuenow={module.completedCount}
                            >
                              <span style={{ width: `${module.lessonCount ? Math.min(100, module.completedCount / module.lessonCount * 100) : 0}%` }} />
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={!module.unlocked || busy !== null || !connected}
                            aria-label={`Luyện module ${module.title}`}
                            onClick={() => void start('MODULE_REVIEW', module.id)}
                          >
                            {busy === `MODULE_REVIEW:${module.id}` ? (
                              <LoaderCircle size={15} className="practice-spin" />
                            ) : module.unlocked ? (
                              <>
                                Luyện module
                                <ArrowRight size={15} />
                              </>
                            ) : (
                              'Chưa mở khóa'
                            )}
                          </button>
                        </article>
                      ))}
                    </div>
                    <details className="practice-explainer">
                      <summary>
                        Luyện tập khác bài kiểm tra thế nào?
                        <ChevronDown size={15} />
                      </summary>
                      <p>
                        Câu hỏi được chọn ngẫu nhiên từ ngân hàng của module hoặc level đã mở. Nếu
                        ngân hàng chưa đủ 10 câu, lượt luyện dùng số câu hiện có. Bạn có thể sửa đáp
                        án trước khi nộp và xem lời giải sau khi nộp. Kết quả giúp ôn kiến thức, cập
                        nhật nhiệm vụ ngày và không tự mở khóa nội dung tiếp theo.
                      </p>
                    </details>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
import { useRealtimeRefresh } from '../services/realtimeRefresh'
