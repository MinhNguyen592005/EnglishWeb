import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  LockKeyhole,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSystemSocket } from '../../app/SystemSocketContext'
import { Layout } from '../../components/Layout'
import { ErrorState, Loading } from '../../components/States'
import { StudyQuiz } from './StudyQuiz'
import type { StudyAttempt, StudyCourse, StudyKind, StudyLessonDetail } from './types'
import './study.css'
import './roadmap-refresh.css'

export function StudyRoadmap() {
  const { request, connected, subscribe } = useSystemSocket()
  const [search, setSearch] = useSearchParams()
  const [course, setCourse] = useState<StudyCourse | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((n) => n + 1), [])
  useRealtimeRefresh(reload, connected)
  const startKeys = useRef(new Map<string, string>())
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
  }, [request, connected, revision])
  const open = (params: Record<string, string>, scrollToTop = true) => {
    setError('')
    setSearch(params, { preventScrollReset: !scrollToTop })
    if (scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  if (!course)
    return (
      <Layout title="Lộ trình">
        {error ? <ErrorState message={error} retry={reload} /> : <Loading />}
      </Layout>
    )
  const levels = course.levels
  const selected =
    levels.find((l) => `level-${l.id}` === search.get('planet') && l.unlocked) ||
    levels.find((l) => l.unlocked && !l.passed) ||
    levels[0]
  const requestedModule = selected?.modules.find((m) => m.id === search.get('module'))
  const module = requestedModule?.unlocked ? requestedModule : undefined
  const lessonId = search.get('lesson'),
    attemptId = search.get('attempt')
  const backToModule = (levelId?: number, moduleId?: string) =>
    open({
      planet: `level-${levelId ?? selected.id}`,
      ...(moduleId ? { module: moduleId } : module ? { module: module.id } : {}),
    })
  if (lessonId)
    return (
      <LessonScreen
        key={lessonId}
        id={lessonId}
        onBack={backToModule}
        openLesson={(id, levelId, moduleId) =>
          open({ planet: `level-${levelId}`, module: moduleId, lesson: id })
        }
      />
    )
  if (attemptId)
    return <AttemptScreen key={attemptId} id={Number(attemptId)} onBack={backToModule} />
  const total = levels.reduce((n, l) => n + l.lessonCount, 0),
    done = levels.reduce((n, l) => n + l.completedCount, 0)
  const nextLevel = levels.find((l) => l.unlocked && !l.passed) || levels.at(-1)
  const nextModule = nextLevel?.modules.find((m) => m.unlocked && m.completedCount < m.lessonCount)
  const nextLesson = nextModule?.lessons.find((l) => l.status !== 'COMPLETED')
  async function start(kind: StudyKind, referenceId: string) {
    setBusy(true)
    setError('')
    const key = `${kind}:${referenceId}`
    if (!startKeys.current.has(key)) startKeys.current.set(key, crypto.randomUUID())
    try {
      const a = await request<StudyAttempt>('ROADMAP_START', 'ROADMAP_COURSE_DATA', {
        kind,
        referenceId,
        requestKey: startKeys.current.get(key),
      })
      startKeys.current.delete(key)
      open({
        planet: `level-${a.levelId}`,
        ...(kind.startsWith('MODULE_') ? { module: referenceId } : {}),
        attempt: String(a.id),
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Layout title="Lộ trình">
      <div className="study-course roadmap-explorer">
        <div className="page-heading roadmap-hero">
          <div>
            <h1>Từng bước nhỏ, vươn xa hơn.</h1>
            <p>
              Mỗi hành tinh là một level. Hoàn thành bài học, đạt 8/10 câu kiểm tra để mở hành tinh
              tiếp theo.
            </p>
          </div>
          <div className="heading-icon">
            <Target size={35} />
          </div>
        </div>
        <div className="roadmap-overview" aria-label="Tổng quan hành trình">
          <span>
            <BookOpen size={17} />
            <strong>{total}</strong> bài học
          </span>
          <span>
            <Trophy size={17} />
            <strong>
              {levels.filter((level) => level.passed).length}/{levels.length}
            </strong>{' '}
            hành tinh đã vượt qua
          </span>
          <span>
            <Target size={17} />
            <strong>{total ? Math.round((done / total) * 100) : 0}%</strong> hoàn thành
          </span>
        </div>
        <section className="card roadmap-summary">
          <div className="roadmap-summary-main">
            <span className="section-label">TIẾN ĐỘ TOÀN LỘ TRÌNH</span>
            <strong>
              {done}
              <span>/{total}</span>
            </strong>
            <p>
              Bài học đã hoàn thành · {levels.filter((l) => l.passed).length}/5 level đã vượt qua
            </p>
            <div className="progress-track">
              <div style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <small>5 level nội bộ của khóa ngữ pháp</small>
          </div>
          <div className="roadmap-next">
            <span className="section-label">BƯỚC TIẾP THEO</span>
            <h2>
              {nextLesson?.title ||
                (!nextLevel?.passed ? 'Kiểm tra cuối level' : 'Đã chinh phục 5 hành tinh!')}
            </h2>
            <p>{nextModule?.title || nextLevel?.title}</p>
            <button
              className="button primary"
              onClick={() =>
                nextLesson && nextLevel && nextModule
                  ? open({
                      planet: `level-${nextLevel.id}`,
                      module: nextModule.id,
                      lesson: nextLesson.id,
                    })
                  : nextLevel && open({ planet: `level-${nextLevel.id}` })
              }
            >
              {nextLesson ? 'Tiếp tục học' : 'Xem level'}
              <ArrowRight size={17} />
            </button>
          </div>
        </section>
        <section className="planet-map" aria-label="Bản đồ 5 level">
          <div className="planet-map-heading">
            <span className="section-label">BẢN ĐỒ KHÁM PHÁ</span>
            <h2>Chọn hành tinh của bạn</h2>
            <p>Từ nền tảng câu và từ đến các cấu trúc ngữ pháp chuyên sâu.</p>
          </div>
          <div className="planet-path">
            {levels.map((level, index) => (
              <div className="planet-stop" key={level.id}>
                <button
                  type="button"
                  className={`planet-button ${level.planetStyle} ${selected?.id === level.id ? 'selected' : ''} ${level.unlocked ? '' : 'locked'}`}
                  disabled={!level.unlocked}
                  aria-pressed={selected?.id === level.id}
                  aria-label={`Level ${level.id}: ${level.title}${level.unlocked ? '' : '. Chưa mở khóa'}`}
                  onClick={() => open({ planet: `level-${level.id}` })}
                >
                  <span className="planet-halo" />
                  <span className="planet-body">
                    <span className="planet-surface" />
                  </span>
                  <span className="planet-ring" />
                  {!level.unlocked && (
                    <span className="planet-lock">
                      <LockKeyhole size={22} />
                    </span>
                  )}
                </button>
                <div className="planet-caption">
                  <span>LEVEL {level.id}</span>
                  <strong>{level.title}</strong>
                  <small>
                    {level.placementPassed
                      ? 'Vượt qua theo đầu vào · Ôn tập'
                      : level.passed
                        ? 'Đã vượt qua'
                        : level.unlocked
                          ? `${level.completedCount}/${level.lessonCount} bài hoàn thành`
                          : `Đạt 8/10 kiểm tra level ${level.id - 1} để mở`}
                  </small>
                </div>
                {index < levels.length - 1 && (
                  <span
                    className={`planet-connector ${level.passed ? 'complete' : ''}`}
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {selected && (
          <section className="roadmap-chapter">
            <div className="roadmap-chapter-header">
              <div className="roadmap-chapter-number">0{selected.id}</div>
              <div className="roadmap-chapter-copy">
                <span className="section-label">
                  LEVEL {selected.id} · {selected.modules.length} MODULE
                </span>
                <h2>{selected.title}</h2>
                <p>{selected.outcome}</p>
                <small>
                  <Sparkles size={15} /> Học kiến thức → Luyện tập → Nộp bài → Ôn tập → Kiểm tra
                  level
                </small>
              </div>
              <div className="roadmap-chapter-progress">
                <strong>
                  {selected.completedCount}/{selected.lessonCount}
                </strong>
                <span>bài đã hoàn thành</span>
                <div className="progress-track">
                  <div
                    style={{ width: `${(selected.completedCount / selected.lessonCount) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="study-module-tabs" aria-label="Các module">
              {selected.modules.map((m) => (
                <button
                  key={m.id}
                  className={`study-module-tab ${module?.id === m.id ? 'active' : ''} ${m.unlocked ? '' : 'locked'}`}
                  aria-pressed={module?.id === m.id}
                  disabled={!m.unlocked}
                  onClick={() => open({ planet: `level-${selected.id}`, module: m.id }, false)}
                >
                  <div className="module-card-top">
                    <span className="module-card-number">
                      {String(m.ordinalNo).padStart(2, '0')}
                    </span>
                    <span className="module-card-status">
                      {!m.unlocked ? (
                        <LockKeyhole size={15} />
                      ) : m.lessonCount > 0 && m.completedCount === m.lessonCount ? (
                        <Check size={15} />
                      ) : (
                        <BookOpen size={15} />
                      )}
                    </span>
                  </div>
                  <span>MODULE {m.ordinalNo}</span>
                  <strong>{m.title}</strong>
                  <small>
                    {m.unlocked
                      ? `${m.completedCount}/${m.lessonCount} bài hoàn thành`
                      : m.lockReason}
                  </small>
                  <div className="progress-track">
                    <div
                      style={{
                        width: `${m.lessonCount ? (m.completedCount / m.lessonCount) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="module-card-footer">
                    <span>
                      {module?.id === m.id
                        ? 'Đang xem'
                        : m.unlocked
                          ? 'Xem bài học'
                          : 'Chưa mở khóa'}
                    </span>
                    {m.unlocked && <ArrowRight size={16} />}
                  </div>
                </button>
              ))}
            </div>
            {requestedModule && !requestedModule.unlocked && (
              <div className="study-module-locked" role="status">
                <LockKeyhole size={18} />
                {requestedModule.lockReason}
              </div>
            )}
            {module && (
              <div className="study-module-detail">
                <div className="study-module-heading">
                  <div>
                    <span className="section-label">MODULE {module.ordinalNo}</span>
                    <h2>{module.title}</h2>
                    <p>Hiểu cấu trúc, luyện tập theo từng bài và ôn lại kiến thức trong module.</p>
                  </div>
                  <span className="tag">
                    {module.completedCount}/{module.lessonCount} bài
                  </span>
                </div>
                <div className="roadmap-levels">
                  {module.lessons.map((lesson, i) => (
                    <article
                      className={`roadmap-level ${lesson.status === 'COMPLETED' ? 'completed' : 'available'}`}
                      key={lesson.id}
                    >
                      <div className="roadmap-level-index">
                        {lesson.status === 'COMPLETED' ? <Check size={20} /> : i + 1}
                      </div>
                      <div className="roadmap-level-content">
                        <div className="roadmap-level-kicker">
                          <span>BÀI {lesson.id}</span>
                          <span className="roadmap-state">
                            {
                              {
                                NOT_STARTED: 'Chưa học',
                                IN_PROGRESS: 'Đang học',
                                COMPLETED: 'Đã hoàn thành',
                              }[lesson.status]
                            }
                          </span>
                        </div>
                        <h3>{lesson.title}</h3>
                        <div className="roadmap-level-meta">
                          <span>
                            <BookOpen size={15} />
                            Lý thuyết và ví dụ
                          </span>
                          <span>
                            <Target size={15} />3 câu luyện cố định · Nộp đủ để hoàn thành
                          </span>
                        </div>
                      </div>
                      <div className="roadmap-level-action">
                        <button
                          className={`button ${lesson.status === 'COMPLETED' ? 'secondary' : 'primary'}`}
                          onClick={() =>
                            open({
                              planet: `level-${selected.id}`,
                              module: module.id,
                              lesson: lesson.id,
                            })
                          }
                        >
                          {lesson.status === 'COMPLETED'
                            ? 'Ôn lại'
                            : lesson.status === 'IN_PROGRESS'
                              ? 'Tiếp tục'
                              : 'Bắt đầu'}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="study-module-actions">
                  <button
                    className="button secondary"
                    disabled={busy || !connected}
                    onClick={() => start('MODULE_REVIEW', module.id)}
                  >
                    Ôn tập module
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy || !connected || module.completedCount !== module.lessonCount}
                    onClick={() => start('MODULE_TEST', module.id)}
                  >
                    Kiểm tra module
                  </button>
                  <small>
                    Hoàn thành các bài trong module để mở kiểm tra module. Điểm giúp xác định nội
                    dung cần ôn.
                  </small>
                </div>
              </div>
            )}
            <div className={`roadmap-capstone ${selected.examReady ? 'ready' : 'locked'}`}>
              <div className="roadmap-capstone-icon">
                <Trophy size={25} />
              </div>
              <div>
                <span className="section-label">KIỂM TRA CUỐI LEVEL {selected.id}</span>
                <h3>Tổng hợp: {selected.title}</h3>
                <p>10 câu từ các module · Đạt ít nhất 8/10 để vượt level</p>
                <small>
                  {selected.placementPassed
                    ? 'Đã vượt qua theo kiểm tra đầu vào. Các bài học vẫn giữ tiến độ thực tế.'
                    : selected.passed
                      ? 'Đã vượt qua. Bạn có thể ôn tập hoặc kiểm tra lại.'
                      : selected.examReady
                        ? 'Đã mở bài kiểm tra. Sẵn sàng đến hành tinh mới!'
                        : `Hoàn thành ${selected.lessonCount - selected.completedCount} bài còn lại để mở kiểm tra.`}
                </small>
                <small className="study-review-note">
                  Ôn tập level chỉ lấy nội dung từ các module đã mở.
                </small>
              </div>
              <div className="study-exam-actions">
                <button
                  className="button secondary"
                  disabled={busy || !connected}
                  onClick={() => start('LEVEL_REVIEW', String(selected.id))}
                >
                  Ôn tập level
                </button>
                <button
                  className="button primary"
                  disabled={busy || !connected || !selected.examReady}
                  onClick={() => start('LEVEL_TEST', String(selected.id))}
                >
                  {busy ? 'Đang tạo…' : selected.passed ? 'Kiểm tra lại' : 'Kiểm tra lên level'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </Layout>
  )
}

function LessonScreen({
  id,
  onBack,
  openLesson,
}: {
  id: string
  onBack: (levelId?: number, moduleId?: string) => void
  openLesson: (id: string, levelId: number, moduleId: string) => void
}) {
  const { request, connected, subscribe } = useSystemSocket()
  const [lesson, setLesson] = useState<StudyLessonDetail | null>(null)
  const [changed, setChanged] = useState(false)
  const lessonRef = useRef(lesson)
  lessonRef.current = lesson
  const onRemoteChange = async () => {
    if (!lesson) return
    const next = await request<StudyLessonDetail>('ROADMAP_LESSON', 'ROADMAP_COURSE_DATA', {
      lessonId: id,
    })
    if (lessonRef.current !== lesson || JSON.stringify(next) === JSON.stringify(lesson)) return
    if (lesson.attempt?.status === 'IN_PROGRESS') setChanged(true)
    else setLesson(next)
  }
  useRealtimeRefresh(onRemoteChange, connected)
  const remoteChange = useRef(onRemoteChange)
  remoteChange.current = onRemoteChange
  useEffect(
    () =>
      subscribe((message) => {
        if (
          message.action === 'ROADMAP_PROGRESS_CHANGED' ||
          message.action === 'CURRICULUM_CHANGED'
        )
          void remoteChange.current().catch((e) => setError(e.message))
      }),
    [subscribe],
  )
  useEffect(() => {
    setChanged(false)
  }, [id])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!connected) return
    let active = true
    setError('')
    request<StudyLessonDetail>('ROADMAP_LESSON', 'ROADMAP_COURSE_DATA', { lessonId: id })
      .then((data) => {
        if (active) setLesson(data)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [id, request, connected, revision])
  async function updateAttempt(attempt: StudyAttempt) {
    setLesson(
      (old) =>
        old && { ...old, attempt, completed: old.completed || attempt.status !== 'IN_PROGRESS' },
    )
    if (attempt.status === 'IN_PROGRESS')
      setTimeout(
        () => document.querySelector('.study-quiz')?.scrollIntoView({ behavior: 'smooth' }),
        0,
      )
    else
      try {
        setLesson(
          await request<StudyLessonDetail>('ROADMAP_LESSON', 'ROADMAP_COURSE_DATA', {
            lessonId: id,
          }),
        )
      } catch (e) {
        setError((e as Error).message)
      }
  }
  return (
    <Layout title="Bài học lộ trình">
      {lesson && error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {changed && (
        <div className="notice" role="status">
          Bài học có cập nhật. Tải lại sẽ bỏ câu trả lời chưa gửi.
          <button
            type="button"
            onClick={() => {
              setChanged(false)
              setRevision((n) => n + 1)
            }}
          >
            Tải lại bài học
          </button>
        </div>
      )}
      <div className="study-course lesson-reading">
        <button className="text-button study-back" onClick={() => onBack()}>
          <ArrowLeft size={16} />
          Quay lại module
        </button>
        {!lesson ? (
          error ? (
            <ErrorState message={error} retry={() => setRevision((n) => n + 1)} />
          ) : (
            <Loading />
          )
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="section-label">
                  LEVEL {lesson.levelId} · {lesson.moduleTitle} · BÀI {lesson.id}
                </span>
                <h1>{lesson.title}</h1>
                <p>
                  {lesson.completed
                    ? 'Đã hoàn thành · Bạn có thể ôn lại và luyện tập thêm.'
                    : 'Đọc kiến thức và nộp đủ phần luyện tập để hoàn thành bài.'}
                </p>
              </div>
              <div className="heading-icon">
                <BookOpen size={35} />
              </div>
            </div>
            <article className="card study-theory" key={lesson.id}>
              <header className="study-theory-intro">
                <div className="study-theory-title">
                  <h2>Kiến thức bài học</h2>
                  <a href="#lesson-practice" className="text-button">
                    Đến luyện tập <ArrowRight size={14} />
                  </a>
                </div>
                <p className="lesson-objective">
                  <strong>Mục tiêu bài học</strong>
                  {lesson.content.objective}
                </p>
                {lesson.content.prerequisites.length > 0 && (
                  <div className="study-prerequisites">
                    <span>Cần biết:</span>
                    {lesson.content.prerequisites.map((p) => (
                      <button
                        key={p.id}
                        className="text-button"
                        onClick={() => openLesson(p.id, lesson.levelId, lesson.moduleId)}
                      >
                        {p.title}
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
              </header>
              <div className="study-theory-core">
                {lesson.content.sections.map((section, i) => (
                  <section
                    key={i}
                    className={
                      /công thức|cấu trúc|ghi nhớ|quy tắc|lưu ý/i.test(section.title)
                        ? 'lesson-key-concept'
                        : ''
                    }
                  >
                    <h2>{section.title}</h2>
                    <p className="study-multiline">{section.body}</p>
                  </section>
                ))}
              </div>
              {lesson.content.examples.length > 0 && (
                <details className="study-theory-detail">
                  <summary>
                    Ví dụ minh họa <span>{lesson.content.examples.length} ví dụ</span>
                    <ChevronRight size={16} />
                  </summary>
                  <div className="study-examples-grid">
                    {lesson.content.examples.map((example, i) => (
                      <div className="study-example" key={i}>
                        <strong>{example.english}</strong>
                        <p>{example.vietnamese}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {lesson.content.mistakes.length > 0 && (
                <details className="study-theory-detail">
                  <summary>
                    Lỗi thường gặp <span>{lesson.content.mistakes.length} lưu ý</span>
                    <ChevronRight size={16} />
                  </summary>
                  {lesson.content.mistakes.map((mistake, i) => (
                    <div className="study-mistake" key={i}>
                      <p>
                        <span>Sai:</span> <span className="lesson-incorrect">{mistake.wrong}</span>
                      </p>
                      <p>
                        <strong>Đúng:</strong>{' '}
                        <strong className="lesson-correction">{mistake.right}</strong>
                      </p>
                      <p>{mistake.explanation}</p>
                    </div>
                  ))}
                </details>
              )}
              <details className="study-theory-detail">
                <summary>
                  Vận dụng & ghi chú <ChevronRight size={16} />
                </summary>
                <p>{lesson.content.application}</p>
                <label className="text-answer-label">
                  Ghi chú luyện viết của bạn
                  <textarea
                    key={lesson.id}
                    maxLength={3000}
                    placeholder="Tự đặt câu hoặc viết đoạn văn ngắn. Bạn tự đối chiếu với kiến thức và ví dụ trong bài."
                    defaultValue={sessionStorage.getItem(`study-writing-${id}`) || ''}
                    onChange={(e) => sessionStorage.setItem(`study-writing-${id}`, e.target.value)}
                  />
                </label>
              </details>
              <details className="study-theory-detail">
                <summary>
                  Tổng kết <ChevronRight size={16} />
                </summary>
                <p className="lesson-takeaway">{lesson.content.summary}</p>
              </details>
            </article>
            <div id="lesson-practice" className="study-practice-anchor">
              <StudyQuiz
                key={`${lesson.attempt.id}-${lesson.attempt.status}-${revision}`}
                attempt={lesson.attempt}
                onAttempt={updateAttempt}
                onBack={() => onBack(lesson.levelId, lesson.moduleId)}
                onNext={
                  lesson.attempt.status !== 'IN_PROGRESS' && lesson.nextLessonId
                    ? () => openLesson(lesson.nextLessonId!, lesson.levelId, lesson.moduleId)
                    : undefined
                }
              />
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

function AttemptScreen({ id, onBack }: { id: number; onBack: () => void }) {
  const { request, connected, subscribe } = useSystemSocket()
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null)
  const [changed, setChanged] = useState(false)
  const checkAttempt = async () => {
    if (!attempt) return
    const next = await request<StudyAttempt>('ROADMAP_ATTEMPT', 'ROADMAP_COURSE_DATA', {
      attemptId: id,
    })
    if (JSON.stringify(next) !== JSON.stringify(attempt)) setChanged(true)
  }
  useRealtimeRefresh(checkAttempt, connected)
  const checkRef = useRef(checkAttempt)
  checkRef.current = checkAttempt
  useEffect(
    () =>
      subscribe((message) => {
        if (message.action === 'ROADMAP_PROGRESS_CHANGED')
          void checkRef.current().catch((e) => setError(e.message))
      }),
    [subscribe],
  )
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [, setSearch] = useSearchParams()
  useEffect(() => {
    if (!connected) return
    let active = true
    setError('')
    request<StudyAttempt>('ROADMAP_ATTEMPT', 'ROADMAP_COURSE_DATA', { attemptId: id })
      .then((data) => {
        if (active) setAttempt(data)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [id, request, connected, revision])
  return (
    <Layout title="Ôn tập và kiểm tra lộ trình">
      {attempt && error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {changed && (
        <div className="notice" role="status">
          Có cập nhật mới. Tải lại sẽ bỏ câu trả lời chưa gửi.
          <button
            type="button"
            onClick={() => {
              setChanged(false)
              setRevision((n) => n + 1)
            }}
          >
            Tải lại lượt làm bài
          </button>
        </div>
      )}
      <div className="study-course">
        <button className="text-button study-back" onClick={() => onBack()}>
          <ArrowLeft size={16} />
          Quay lại lộ trình
        </button>
        {!attempt ? (
          error ? (
            <ErrorState message={error} retry={() => setRevision((n) => n + 1)} />
          ) : (
            <Loading />
          )
        ) : (
          <StudyQuiz
            key={`${attempt.id}-${attempt.status}-${revision}`}
            attempt={attempt}
            onAttempt={(a) => {
              setAttempt(a)
              if (a.id !== id)
                setSearch(
                  {
                    planet: `level-${a.levelId}`,
                    ...(a.kind.startsWith('MODULE_') ? { module: a.referenceId } : {}),
                    attempt: String(a.id),
                  },
                  { replace: true },
                )
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onBack={onBack}
          />
        )}
      </div>
    </Layout>
  )
}
import { useRealtimeRefresh } from '../../services/realtimeRefresh'
