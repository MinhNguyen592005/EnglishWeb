import { BookOpen, Globe2, Plus, Save, Sparkles } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import { TxtQuestionImporter } from '../components/TxtQuestionImporter'
import { api } from '../services/api'
import type { ParsedQuestionDraft } from '../services/questionTxtParser'
import type { AdminLesson, AdminQuestion, CurriculumTopic, TeacherCurriculum } from '../types'

type TopicDraft = Omit<CurriculumTopic, 'published'>
type LessonDraft = Omit<AdminLesson, 'id' | 'published'>
type QuestionDraft = Omit<AdminQuestion, 'id' | 'published'>
const blankTopic: TopicDraft = {
  slug: '',
  title: '',
  description: '',
  outcome: '',
  sortOrder: 1,
  planetStyle: 'aqua',
}
const blankLesson: LessonDraft = {
  topicSlug: '',
  ordinalNo: 0,
  title: '',
  summary: '',
  theory: '',
  difficulty: 'BEGINNER',
}
const blankQuestion: QuestionDraft = {
  lessonId: 0,
  prompt: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctOption: 'A',
  explanation: '',
  questionType: 'MCQ',
  acceptedAnswer: '',
}
const styles = [
  ['aqua', 'Đại dương'],
  ['violet', 'Tím thiên hà'],
  ['coral', 'San hô'],
  ['gold', 'Vàng sao'],
  ['mint', 'Xanh ngọc'],
]

export function TeacherCurriculumPage() {
  const [data, setData] = useState<TeacherCurriculum | null>(null)
  const [search, setSearch] = useSearchParams()
  const tab = (
    ['topics', 'lessons', 'questions'].includes(search.get('tab') || '')
      ? search.get('tab')
      : 'topics'
  ) as 'topics' | 'lessons' | 'questions'
  const setTab = (value: string) => setSearch({ tab: value })
  const [topic, setTopic] = useState<TopicDraft>(blankTopic)
  const [topicEdit, setTopicEdit] = useState<string | null>(null)
  const [lesson, setLesson] = useState<LessonDraft>(blankLesson)
  const [lessonEdit, setLessonEdit] = useState<number | null>(null)
  const [question, setQuestion] = useState<QuestionDraft>(blankQuestion)
  const [questionEdit, setQuestionEdit] = useState<number | null>(null)
  const [questionMode, setQuestionMode] = useState<'batch' | 'manual'>('batch')
  const [questionLesson, setQuestionLesson] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () =>
    api
      .teacherCurriculum()
      .then(setData)
      .catch((e) => setError(e.message))
  useRealtimeRefresh(reload)
  useEffect(() => {
    void reload()
  }, [])
  useEffect(() => {
    if (data && !topicEdit && !topic.slug) {
      setTopic((current) => ({
        ...current,
        sortOrder: Math.max(0, ...data.topics.map((t) => t.sortOrder)) + 1,
      }))
    }
  }, [data, topicEdit, topic.slug])

  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
      await api.teacherCurriculum().then(setData)
      setNotice(message)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function saveTopic(e: FormEvent) {
    e.preventDefault()
    void act(async () => {
      if (topicEdit) await api.teacherEditTopic(topicEdit, topic)
      else await api.teacherCreateTopic(topic)
      setTopic(blankTopic)
      setTopicEdit(null)
    }, 'Đã lưu hành tinh.')
  }

  function saveLesson(e: FormEvent) {
    e.preventDefault()
    void act(async () => {
      if (lessonEdit) await api.teacherEditLesson(lessonEdit, lesson)
      else await api.teacherCreateLesson(lesson)
      setLesson(blankLesson)
      setLessonEdit(null)
    }, 'Đã lưu bài học.')
  }

  function saveQuestion(e: FormEvent) {
    e.preventDefault()
    const payload: QuestionDraft = {
      ...question,
      questionType: 'MCQ',
      acceptedAnswer: '',
    }
    void act(async () => {
      if (questionEdit) await api.teacherEditCommonQuestion(questionEdit, payload)
      else await api.teacherCreateCommonQuestion(payload)
      setQuestion(blankQuestion)
      setQuestionEdit(null)
    }, 'Đã lưu câu hỏi.')
  }

  async function handleSaveCommonBatch(targetLessonId: number, drafts: ParsedQuestionDraft[]) {
    const items: Omit<AdminQuestion, 'id' | 'published' | 'lessonId'>[] = drafts.map((d) => ({
      prompt: d.prompt,
      optionA: d.optionA,
      optionB: d.optionB,
      optionC: d.optionC,
      optionD: d.optionD,
      correctOption: d.correctOption || 'A',
      explanation: d.explanation,
      questionType: 'MCQ',
      acceptedAnswer: null,
    }))
    await act(async () => {
      const res = await api.teacherCreateCommonQuestionsBatch({
        lessonId: targetLessonId,
        questions: items,
      })
      return res
    }, `Đã thêm thành công ${items.length} câu hỏi trắc nghiệm chung vào bài học.`)
  }

  const lessonQuestions = (data?.questions || []).filter(
    (q) => questionLesson === 0 || q.lessonId === questionLesson,
  )

  return (
    <Layout title="Biên tập lộ trình">
      <div className="page-heading">
        <div>
          <h1>Biên tập lộ trình</h1>
          <p>Tạo chủ đề, viết kiến thức và chuẩn bị câu hỏi trước khi mở cho học viên.</p>
        </div>
        <div className="heading-icon">
          <Globe2 size={36} />
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}

      {!data ? (
        error ? (
          <ErrorState message={error} retry={reload} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <div className="tab-bar" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'topics'}
              className={tab === 'topics' ? 'active' : ''}
              onClick={() => setTab('topics')}
            >
              Hành tinh
            </button>
            <button
              role="tab"
              aria-selected={tab === 'lessons'}
              className={tab === 'lessons' ? 'active' : ''}
              onClick={() => setTab('lessons')}
            >
              Bài học
            </button>
            <button
              role="tab"
              aria-selected={tab === 'questions'}
              className={tab === 'questions' ? 'active' : ''}
              onClick={() => setTab('questions')}
            >
              Câu hỏi chung
            </button>
          </div>

          {tab === 'topics' && (
            <div className="curriculum-grid">
              <section className="card feature-card">
                <h2>
                  <Globe2 /> Các hành tinh
                </h2>
                <p className="muted">
                  Thứ tự hành tinh quyết định thứ tự mở khóa. Học viên cần vượt boss cuối hành tinh
                  trước.
                </p>
                {data.topics.map((t) => (
                  <div className="assignment-row" key={t.slug}>
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        #{t.sortOrder} · {t.slug} · {t.published ? 'Đang xuất bản' : 'Bản nháp'} ·{' '}
                        {data.lessons.filter((l) => l.topicSlug === t.slug).length} bài
                      </small>
                    </div>
                    <div className="stack-actions">
                      <button
                        className="button secondary"
                        onClick={() => {
                          setTopicEdit(t.slug)
                          setTopic({
                            slug: t.slug,
                            title: t.title,
                            description: t.description,
                            outcome: t.outcome,
                            sortOrder: t.sortOrder,
                            planetStyle: t.planetStyle,
                          })
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () => api.teacherPublishTopic(t.slug, !t.published),
                            'Đã cập nhật hành tinh.',
                          )
                        }
                      >
                        {t.published ? 'Ẩn' : 'Xuất bản'}
                      </button>
                    </div>
                  </div>
                ))}
              </section>

              <section className="card feature-card">
                <h2>
                  <Plus /> {topicEdit ? 'Sửa hành tinh' : 'Thêm hành tinh'}
                </h2>
                <form className="form-grid" onSubmit={saveTopic}>
                  <label>
                    Mã chủ đề
                    <input
                      required
                      pattern="[a-z0-9-]+"
                      maxLength={80}
                      disabled={!!topicEdit}
                      value={topic.slug}
                      onChange={(e) => setTopic({ ...topic, slug: e.target.value })}
                      placeholder="vi-du-menh-de"
                    />
                  </label>
                  <label>
                    Thứ tự
                    <input
                      required
                      type="number"
                      min={1}
                      value={topic.sortOrder}
                      onChange={(e) => setTopic({ ...topic, sortOrder: Number(e.target.value) })}
                    />
                  </label>
                  <label className="full-span">
                    Tên hành tinh
                    <input
                      required
                      maxLength={160}
                      value={topic.title}
                      onChange={(e) => setTopic({ ...topic, title: e.target.value })}
                    />
                  </label>
                  <label className="full-span">
                    Giới thiệu
                    <textarea
                      required
                      maxLength={255}
                      value={topic.description}
                      onChange={(e) => setTopic({ ...topic, description: e.target.value })}
                    />
                  </label>
                  <label className="full-span">
                    Kết quả học tập
                    <textarea
                      required
                      maxLength={255}
                      value={topic.outcome}
                      onChange={(e) => setTopic({ ...topic, outcome: e.target.value })}
                    />
                  </label>
                  <label>
                    Màu hành tinh
                    <select
                      value={topic.planetStyle}
                      onChange={(e) => setTopic({ ...topic, planetStyle: e.target.value })}
                    >
                      {styles.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="button-row full-span">
                    <button className="button primary" disabled={busy}>
                      <Save size={17} /> Lưu hành tinh
                    </button>
                    {topicEdit && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          setTopic(blankTopic)
                          setTopicEdit(null)
                        }}
                      >
                        Hủy sửa
                      </button>
                    )}
                  </div>
                </form>
              </section>
            </div>
          )}

          {tab === 'lessons' && (
            <div className="curriculum-grid">
              <section className="card feature-card">
                <h2>
                  <BookOpen /> Bài học
                </h2>
                <p className="muted">
                  Mỗi bài cần 10 câu hỏi chung đã xuất bản trước khi mở cho học viên.
                </p>
                {data.topics.map((t) => (
                  <div key={t.slug}>
                    <h3 className="section-heading">{t.title}</h3>
                    {data.lessons
                      .filter((l) => l.topicSlug === t.slug)
                      .map((l) => (
                        <div className="assignment-row" key={l.id}>
                          <div>
                            <strong>{l.title}</strong>
                            <small>
                              Bài {l.ordinalNo + 1} · {l.difficulty} ·{' '}
                              {l.published ? 'Đang xuất bản' : 'Bản nháp'} ·{' '}
                              {
                                data.questions.filter((q) => q.lessonId === l.id && q.published)
                                  .length
                              }
                              /10 câu đã mở
                            </small>
                          </div>
                          <div className="stack-actions">
                            <button
                              className="button secondary"
                              onClick={() => {
                                setLessonEdit(l.id)
                                setLesson({
                                  topicSlug: l.topicSlug,
                                  ordinalNo: l.ordinalNo,
                                  title: l.title,
                                  summary: l.summary,
                                  theory: l.theory,
                                  difficulty: l.difficulty,
                                })
                              }}
                            >
                              Sửa
                            </button>
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() =>
                                void act(
                                  () => api.teacherPublishLesson(l.id, !l.published),
                                  'Đã cập nhật bài học.',
                                )
                              }
                            >
                              {l.published ? 'Ẩn' : 'Xuất bản'}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </section>

              <section className="card feature-card">
                <h2>
                  <Plus /> {lessonEdit ? 'Sửa bài học' : 'Thêm bài học'}
                </h2>
                <form className="form-grid" onSubmit={saveLesson}>
                  <label>
                    Hành tinh
                    <select
                      required
                      value={lesson.topicSlug}
                      onChange={(e) => setLesson({ ...lesson, topicSlug: e.target.value })}
                    >
                      <option value="">Chọn hành tinh</option>
                      {data.topics.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Thứ tự bài
                    <input
                      required
                      type="number"
                      min={0}
                      value={lesson.ordinalNo}
                      onChange={(e) => setLesson({ ...lesson, ordinalNo: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Mức độ
                    <select
                      value={lesson.difficulty}
                      onChange={(e) =>
                        setLesson({
                          ...lesson,
                          difficulty: e.target.value as LessonDraft['difficulty'],
                        })
                      }
                    >
                      <option value="BEGINNER">Cơ bản</option>
                      <option value="INTERMEDIATE">Trung cấp</option>
                      <option value="ADVANCED">Nâng cao</option>
                    </select>
                  </label>
                  <label className="full-span">
                    Tên bài
                    <input
                      required
                      maxLength={160}
                      value={lesson.title}
                      onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
                    />
                  </label>
                  <label className="full-span">
                    Tóm tắt
                    <input
                      required
                      maxLength={255}
                      value={lesson.summary}
                      onChange={(e) => setLesson({ ...lesson, summary: e.target.value })}
                    />
                  </label>
                  <label className="full-span">
                    Kiến thức trọng tâm
                    <textarea
                      required
                      rows={9}
                      value={lesson.theory}
                      onChange={(e) => setLesson({ ...lesson, theory: e.target.value })}
                    />
                  </label>
                  <div className="button-row full-span">
                    <button className="button primary" disabled={busy}>
                      <Save size={17} /> Lưu bài học
                    </button>
                    {lessonEdit && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          setLesson(blankLesson)
                          setLessonEdit(null)
                        }}
                      >
                        Hủy sửa
                      </button>
                    )}
                  </div>
                </form>
              </section>
            </div>
          )}

          {tab === 'questions' && (
            <div>
              <div className="tab-bar" style={{ marginBottom: 20 }}>
                <button
                  type="button"
                  className={questionMode === 'batch' ? 'active' : ''}
                  onClick={() => {
                    setQuestionMode('batch')
                    setQuestionEdit(null)
                  }}
                >
                  <Sparkles
                    size={16}
                    style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }}
                  />
                  Thêm tự động câu hỏi từ file .txt
                </button>
                <button
                  type="button"
                  className={questionMode === 'manual' ? 'active' : ''}
                  onClick={() => setQuestionMode('manual')}
                >
                  <BookOpen
                    size={16}
                    style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }}
                  />
                  {questionEdit ? 'Đang sửa câu hỏi' : 'Danh sách & Soạn thủ công'}
                </button>
              </div>

              {questionMode === 'batch' ? (
                <section className="card feature-card">
                  <h2>
                    <Sparkles /> Tự động thêm bộ câu hỏi chung từ file .txt
                  </h2>
                  <p className="muted">
                    Hỗ trợ kéo-thả file .txt, chọn file từ máy, dán trực tiếp file .txt bằng{' '}
                    <strong>Ctrl+V</strong>, hoặc dán nội dung chữ. Ngân hàng câu hỏi chung phục vụ
                    cho Hành tinh chính và Đấu trường PvP nên yêu cầu chuẩn hóa dạng Trắc nghiệm 4
                    phương án A/B/C/D.
                  </p>
                  <TxtQuestionImporter
                    lessons={data.lessons.map((l) => ({ id: l.id, title: l.title }))}
                    defaultLessonId={questionLesson || undefined}
                    busy={busy}
                    commonCurriculumMode={true}
                    onSaveBatch={handleSaveCommonBatch}
                  />
                </section>
              ) : (
                <div className="curriculum-grid">
                  <section className="card feature-card">
                    <div className="panel-heading">
                      <h2>
                        <Sparkles /> Câu hỏi chung ({lessonQuestions.length})
                      </h2>
                      <select
                        aria-label="Lọc theo bài học"
                        value={questionLesson}
                        onChange={(e) => setQuestionLesson(Number(e.target.value))}
                      >
                        <option value={0}>Tất cả bài học</option>
                        {data.lessons.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    {lessonQuestions.map((q) => (
                      <div className="assignment-row" key={q.id}>
                        <div>
                          <strong>
                            #{q.id} · {q.prompt}
                          </strong>
                          <small>
                            {data.lessons.find((l) => l.id === q.lessonId)?.title} ·{' '}
                            {q.published ? 'Đang xuất bản' : 'Bản nháp'} · Đáp án đúng:{' '}
                            <strong>{q.correctOption}</strong>
                          </small>
                        </div>
                        <div className="stack-actions">
                          <button
                            className="button secondary"
                            onClick={() => {
                              setQuestionEdit(q.id)
                              setQuestionMode('manual')
                              setQuestion({
                                lessonId: q.lessonId,
                                prompt: q.prompt,
                                optionA: q.optionA || '',
                                optionB: q.optionB || '',
                                optionC: q.optionC || '',
                                optionD: q.optionD || '',
                                correctOption: q.correctOption || 'A',
                                explanation: q.explanation || '',
                                questionType: 'MCQ',
                                acceptedAnswer: '',
                              })
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () => api.teacherPublishCommonQuestion(q.id, !q.published),
                                'Đã cập nhật câu hỏi.',
                              )
                            }
                          >
                            {q.published ? 'Ẩn' : 'Xuất bản'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="card feature-card">
                    <h2>
                      <Plus />{' '}
                      {questionEdit ? 'Sửa câu hỏi trắc nghiệm' : 'Thêm câu hỏi trắc nghiệm'}
                    </h2>
                    <form className="form-grid" onSubmit={saveQuestion}>
                      <label className="full-span">
                        Bài học
                        <select
                          required
                          value={question.lessonId}
                          onChange={(e) =>
                            setQuestion({ ...question, lessonId: Number(e.target.value) })
                          }
                        >
                          <option value={0}>Chọn bài học</option>
                          {data.lessons.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="full-span">
                        Đề bài
                        <textarea
                          required
                          maxLength={500}
                          value={question.prompt}
                          onChange={(e) => setQuestion({ ...question, prompt: e.target.value })}
                          placeholder="Nhập câu hỏi trắc nghiệm..."
                        />
                      </label>
                      {(['optionA', 'optionB', 'optionC', 'optionD'] as const).map((key, index) => (
                        <label key={key}>
                          Đáp án {String.fromCharCode(65 + index)}
                          <input
                            required
                            maxLength={255}
                            value={question[key]}
                            onChange={(e) => setQuestion({ ...question, [key]: e.target.value })}
                          />
                        </label>
                      ))}
                      <label>
                        Đáp án đúng
                        <select
                          value={question.correctOption}
                          onChange={(e) =>
                            setQuestion({ ...question, correctOption: e.target.value })
                          }
                        >
                          {['A', 'B', 'C', 'D'].map((letter) => (
                            <option key={letter}>{letter}</option>
                          ))}
                        </select>
                      </label>
                      <label className="full-span">
                        Giải thích
                        <textarea
                          required
                          value={question.explanation}
                          onChange={(e) =>
                            setQuestion({ ...question, explanation: e.target.value })
                          }
                        />
                      </label>
                      <div className="button-row full-span">
                        <button className="button primary" disabled={busy || !question.lessonId}>
                          <Save size={17} /> Lưu câu hỏi
                        </button>
                        {questionEdit && (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => {
                              setQuestion(blankQuestion)
                              setQuestionEdit(null)
                            }}
                          >
                            Hủy sửa
                          </button>
                        )}
                      </div>
                    </form>
                  </section>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
import { useRealtimeRefresh } from '../services/realtimeRefresh'
