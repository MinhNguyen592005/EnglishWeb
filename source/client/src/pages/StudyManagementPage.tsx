import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BookOpen, Plus, Save, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import { useRealtimeRefresh } from '../services/realtimeRefresh'
import {
  blankLesson,
  newCourseId,
  studyManagement,
  type CourseDraft,
  type CourseLesson,
  type CourseWorkspace,
  type ModuleContent,
  type ModuleVersion,
  type RelatedLesson,
} from '../services/studyManagement'
import './study-management.css'

const labels = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ duyệt',
  RETURNED: 'Cần chỉnh sửa',
  PUBLISHED: 'Đã xuất bản',
  DISCARDED: 'Đã hủy',
}
function move<T>(items: T[], index: number, direction: number) {
  const next = [...items],
    target = index + direction
  if (target >= 0 && target < items.length)
    [next[index], next[target]] = [next[target], next[index]]
  return next
}

export function StudyManagementPage() {
  const { user } = useAuth()
  const { subscribe } = useSystemSocket()
  const admin = user?.role === 'ADMIN'
  const [workspace, setWorkspace] = useState<CourseWorkspace | null>(null)
  const [level, setLevel] = useState(1)
  const [draft, setDraft] = useState<CourseDraft | null>(null)
  const [payload, setPayload] = useState<ModuleContent | null>(null)
  const [selectedLesson, setSelectedLesson] = useState('')
  const [tab, setTab] = useState<'content' | 'questions' | 'preview'>('content')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [changed, setChanged] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [filter, setFilter] = useState('ACTIVE')
  const [preview, setPreview] = useState<ModuleContent | null>(null)
  const [history, setHistory] = useState<ModuleVersion[] | null>(null)
  const pending = useRef(false)
  const dirty = !!draft && !!payload && JSON.stringify(draft.payload) !== JSON.stringify(payload)
  const editable =
    !!draft && draft.authorId === user?.id && ['DRAFT', 'RETURNED'].includes(draft.status)
  const currentLesson = payload?.lessons.find((lesson) => lesson.id === selectedLesson)
  const openRequest = useRef(0)
  const editorState = useRef({ draft, dirty })
  editorState.current = { draft, dirty }

  async function reload() {
    try {
      const next = await studyManagement.workspace()
      setWorkspace(next)
      const current = editorState.current
      const summary = next.drafts.find((item) => item.id === current.draft?.id)
      if (current.draft && !summary) {
        if (current.dirty)
          setError(
            'Đề xuất đã bị xóa ở phiên khác. Hãy sao chép nội dung đang soạn nếu cần giữ lại.',
          )
        else {
          setDraft(null)
          setPayload(null)
          setSelectedLesson('')
        }
      }
      if (current.draft && summary && summary.version > current.draft.version) {
        if (current.dirty) {
          setChanged(true)
          return
        }
        const updated = await studyManagement.draft(current.draft.id)
        const latest = editorState.current
        if (
          !latest.dirty &&
          latest.draft?.id === updated.id &&
          latest.draft.version < updated.version
        ) {
          setDraft(updated)
          setPayload(structuredClone(updated.payload))
          setSelectedLesson((id) =>
            updated.payload.lessons.some((item) => item.id === id)
              ? id
              : (updated.payload.lessons[0]?.id ?? ''),
          )
        }
      }
    } catch (e) {
      setError((e as Error).message)
      throw e
    }
  }
  useEffect(() => {
    void reload().catch(() => {})
  }, [])
  useRealtimeRefresh(reload)
  useEffect(
    () =>
      subscribe((message) => {
        if (message.action === 'CURRICULUM_CHANGED') {
          setChanged(true)
          void reload().catch(() => {})
        }
      }),
    [subscribe],
  )
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (link && !window.confirm('Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', prevent)
    document.addEventListener('click', navigate, true)
    return () => {
      window.removeEventListener('beforeunload', prevent)
      document.removeEventListener('click', navigate, true)
    }
  }, [dirty])

  function canLeave() {
    return !dirty || window.confirm('Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?')
  }
  function accept(next: CourseDraft) {
    setDraft(next)
    setPayload(structuredClone(next.payload))
    setReviewNote('')
    setChanged(false)
    setSelectedLesson(next.payload.lessons[0]?.id ?? '')
  }
  async function work(task: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await task()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  function create(moduleId?: string, restoreVersion?: number) {
    if (!canLeave()) return
    void work(async () => {
      accept(await studyManagement.create(level, moduleId, restoreVersion))
      setTab('content')
      await reload()
    })
  }
  function openDraft(id: number) {
    if (!canLeave()) return
    void work(async () => {
      accept(await studyManagement.draft(id))
      setTab('content')
    })
  }
  async function saved() {
    if (!draft || !payload) throw new Error('Chọn bản nháp trước')
    const next = dirty ? await studyManagement.save(draft, payload) : draft
    setDraft(next)
    setPayload(structuredClone(next.payload))
    return next
  }
  function save() {
    void work(async () => {
      await saved()
      setNotice('Đã lưu bản nháp. Nội dung học sinh chưa thay đổi.')
      await reload()
    })
  }
  function removeDraft() {
    if (
      !draft ||
      !window.confirm(
        'Xóa module chưa xuất bản / đề xuất này cùng nội dung đang soạn? Nội dung đã xuất bản không bị xóa.',
      )
    )
      return
    void work(async () => {
      await studyManagement.remove(draft)
      setDraft(null)
      setPayload(null)
      setSelectedLesson('')
      setReviewNote('')
      setNotice('Đã xóa đề xuất chưa xuất bản.')
      await reload()
    })
  }
  function act(action: string) {
    if (!draft) return
    if (
      action === 'publish' &&
      !window.confirm('Xuất bản nội dung này cho học sinh? Lượt đang làm sẽ giữ bộ câu hỏi cũ.')
    )
      return
    if (
      action === 'discard' &&
      !window.confirm('Hủy bản nháp này? Nội dung đã xuất bản được giữ nguyên.')
    )
      return
    void work(async () => {
      const current = editable && dirty ? await saved() : draft
      const next = await studyManagement.action(current, action, reviewNote)
      setDraft(next)
      setPayload(structuredClone(next.payload))
      setNotice(
        action === 'publish'
          ? 'Đã xuất bản. Học sinh sẽ nhận nội dung mới.'
          : 'Đã cập nhật trạng thái bản nháp.',
      )
      await reload()
    })
  }
  function updateLesson(next: CourseLesson) {
    setPayload(
      (old) =>
        old && { ...old, lessons: old.lessons.map((item) => (item.id === next.id ? next : item)) },
    )
  }
  async function showModule(id: string) {
    const revision = ++openRequest.current
    void work(async () => {
      const [content, versions] = await Promise.all([
        studyManagement.module(id),
        studyManagement.history(id),
      ])
      if (revision === openRequest.current) {
        setPreview(content)
        setHistory(versions)
      }
    })
  }
  const moduleList = workspace?.modules.filter((item) => item.levelId === level) ?? []
  const drafts =
    workspace?.drafts.filter(
      (item) =>
        filter === 'ALL' ||
        (filter === 'ACTIVE' && !['PUBLISHED', 'DISCARDED'].includes(item.status)) ||
        item.status === filter,
    ) ?? []

  return (
    <Layout title="Quản lý hành trình">
      <div className="course-manager">
        <header className="cm-heading">
          <div>
            <h1>Quản lý hành trình</h1>
            <p>
              {admin
                ? 'Quản lý module, duyệt đề xuất và xuất bản nội dung học.'
                : 'Soạn module và bài học, gửi admin duyệt trước khi xuất bản.'}
            </p>
          </div>
          <button className="button secondary" disabled={busy} onClick={() => void work(reload)}>
            Tải lại danh sách
          </button>
        </header>
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
        {changed && draft && (
          <div className="cm-notice" role="status">
            Giáo trình đã có cập nhật. Bản nháp của bạn được giữ nguyên; hệ thống sẽ kiểm tra phiên
            bản khi xuất bản.
          </div>
        )}
        {!workspace ? (
          <p role="status">Đang tải hành trình…</p>
        ) : (
          <div className="cm-workspace">
            <aside className="cm-catalog">
              <section className="card cm-panel">
                <label>
                  Hành trình / Level
                  <select
                    value={level}
                    disabled={busy}
                    onChange={(e) => setLevel(Number(e.target.value))}
                  >
                    {workspace.levels.map((item) => (
                      <option key={item.id} value={item.id}>
                        Level {item.id} · {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="cm-muted">
                  {workspace.levels.find((item) => item.id === level)?.outcome}
                </p>
                <button className="button primary" disabled={busy} onClick={() => create()}>
                  <Plus size={16} /> Thêm module
                </button>
                <ol className="cm-module-list">
                  {moduleList.map((item) => (
                    <li key={item.id}>
                      <strong>
                        {item.ordinalNo}. {item.title}
                      </strong>
                      <small>
                        {item.lessonCount} bài · v{item.version}
                        {item.archived ? ' · Đã lưu trữ' : ''}
                      </small>
                      <div className="cm-actions">
                        <button disabled={busy} onClick={() => create(item.id)}>
                          Soạn thay đổi
                        </button>
                        <button disabled={busy} onClick={() => void showModule(item.id)}>
                          Xem & lịch sử
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                {!moduleList.length && <p>Chưa có module. Hãy tạo bản nháp đầu tiên.</p>}
              </section>
              <section className="card cm-panel">
                <h2>{admin ? 'Bản nháp & đề xuất' : 'Bản nháp của tôi'}</h2>
                <label>
                  Lọc trạng thái
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="ACTIVE">Đang xử lý</option>
                    <option value="SUBMITTED">Chờ duyệt</option>
                    <option value="RETURNED">Cần chỉnh sửa</option>
                    <option value="PUBLISHED">Đã xuất bản</option>
                    <option value="ALL">Tất cả</option>
                  </select>
                </label>
                <ul className="cm-draft-list">
                  {drafts.map((item) => (
                    <li key={item.id}>
                      <button
                        disabled={busy}
                        aria-current={draft?.id === item.id ? 'true' : undefined}
                        onClick={() => openDraft(item.id)}
                      >
                        <strong>{item.title}</strong>
                        <span>
                          {labels[item.status]} · {item.authorName}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {!drafts.length && <p>Không có bản nháp phù hợp.</p>}
              </section>
            </aside>
            <main className="card cm-editor">
              {!draft || !payload ? (
                <div className="cm-empty">
                  <BookOpen size={36} />
                  <h2>Chọn module để bắt đầu</h2>
                  <p>
                    Tạo module mới hoặc soạn thay đổi từ một module đã xuất bản. Học sinh chỉ thấy
                    nội dung sau khi admin xuất bản.
                  </p>
                </div>
              ) : (
                <>
                  <div className="cm-heading">
                    <div>
                      <h2>{payload.title}</h2>
                      <p>
                        #{draft.id} · {labels[draft.status]} · {draft.authorName}
                        {dirty ? ' · Chưa lưu' : ''}
                      </p>
                    </div>
                    {editable && (
                      <button className="button primary" disabled={busy || !dirty} onClick={save}>
                        <Save size={16} /> Lưu nháp
                      </button>
                    )}
                  </div>
                  {draft.note && (
                    <div className="cm-notice">
                      <strong>Ghi chú duyệt:</strong> {draft.note}
                    </div>
                  )}
                  <fieldset disabled={!editable || busy} className="cm-module-fields">
                    <label>
                      Tên module
                      <input
                        maxLength={160}
                        value={payload.title}
                        onChange={(e) => setPayload({ ...payload, title: e.target.value })}
                      />
                    </label>
                    <label>
                      Vị trí trong hành trình
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={payload.ordinalNo}
                        onChange={(e) =>
                          setPayload({ ...payload, ordinalNo: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="cm-check">
                      <input
                        type="checkbox"
                        checked={payload.archived}
                        onChange={(e) => setPayload({ ...payload, archived: e.target.checked })}
                      />{' '}
                      Lưu trữ module (ẩn khỏi lộ trình học sinh)
                    </label>
                  </fieldset>
                  <p className="cm-muted">
                    Sắp xếp module bằng vị trí ở trên. Các bài đã hoàn thành và module đã mở khóa
                    được giữ lại. Mỗi bài cần lý thuyết và câu hỏi; toàn hành trình cần ít nhất 10
                    câu hỏi để kiểm tra level.
                  </p>
                  <div className="cm-lesson-header">
                    <h3>Bài học ({payload.lessons.length})</h3>
                    {editable && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          const lesson = blankLesson()
                          setPayload({ ...payload, lessons: [...payload.lessons, lesson] })
                          setSelectedLesson(lesson.id)
                          setTab('content')
                        }}
                      >
                        <Plus size={16} /> Thêm bài học
                      </button>
                    )}
                  </div>
                  <ol className="cm-lessons">
                    {payload.lessons.map((lesson, index) => (
                      <li
                        key={lesson.id}
                        className={selectedLesson === lesson.id ? 'selected' : ''}
                      >
                        <button
                          className="cm-lesson-select"
                          onClick={() => setSelectedLesson(lesson.id)}
                        >
                          {index + 1}. {lesson.title}
                          {lesson.archived ? ' · Đã lưu trữ' : ''}
                        </button>
                        {editable && (
                          <div className="cm-actions">
                            <button
                              disabled={busy || index === 0}
                              aria-label={`Đưa bài ${index + 1} lên`}
                              onClick={() =>
                                setPayload({
                                  ...payload,
                                  lessons: move(payload.lessons, index, -1),
                                })
                              }
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              disabled={busy || index === payload.lessons.length - 1}
                              aria-label={`Đưa bài ${index + 1} xuống`}
                              onClick={() =>
                                setPayload({ ...payload, lessons: move(payload.lessons, index, 1) })
                              }
                            >
                              <ArrowDown size={15} />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                  {currentLesson && (
                    <>
                      <nav className="cm-tabs" aria-label="Biên tập bài học">
                        {(['content', 'questions', 'preview'] as const).map((key) => (
                          <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
                            {key === 'content'
                              ? 'Nội dung'
                              : key === 'questions'
                                ? `Câu hỏi (${currentLesson.questions.length})`
                                : 'Xem trước học sinh'}
                          </button>
                        ))}
                      </nav>
                      {tab === 'preview' ? (
                        <LessonPreview lesson={currentLesson} />
                      ) : (
                        <fieldset disabled={!editable || busy} className="cm-fields">
                          {tab === 'content' ? (
                            <LessonEditor
                              lesson={currentLesson}
                              onChange={updateLesson}
                              related={[
                                ...(workspace.lessons ?? []).filter(
                                  (item) => !payload.lessons.some((l) => l.id === item.id),
                                ),
                                ...payload.lessons
                                  .filter((item) => !item.archived)
                                  .map((item) => ({
                                    id: item.id,
                                    title: item.title,
                                    moduleTitle: payload.title,
                                  })),
                              ]}
                            />
                          ) : (
                            <QuestionEditor lesson={currentLesson} onChange={updateLesson} />
                          )}
                        </fieldset>
                      )}
                    </>
                  )}
                  <footer className="cm-review">
                    <label>
                      Ghi chú / Lý do yêu cầu chỉnh sửa
                      <textarea
                        value={reviewNote}
                        maxLength={1000}
                        disabled={busy}
                        onChange={(e) => setReviewNote(e.target.value)}
                      />
                    </label>
                    <div className="cm-actions">
                      {(admin || draft.authorId === user?.id) &&
                        ['DRAFT', 'RETURNED', 'SUBMITTED', 'DISCARDED'].includes(draft.status) && (
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={removeDraft}
                          >
                            {draft.baseVersion === 0 ? 'Xóa module chưa xuất bản' : 'Xóa đề xuất'}
                          </button>
                        )}
                      {editable && (
                        <>
                          <button
                            className="button secondary"
                            disabled={busy || dirty}
                            onClick={() => act('discard')}
                          >
                            Hủy bản nháp
                          </button>
                          <button
                            className="button primary"
                            disabled={busy}
                            onClick={() => act('submit')}
                          >
                            Lưu & gửi duyệt
                          </button>
                        </>
                      )}
                      {draft.authorId === user?.id && draft.status === 'SUBMITTED' && (
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => act('withdraw')}
                        >
                          Rút về chỉnh sửa
                        </button>
                      )}
                      {admin && draft.status === 'SUBMITTED' && (
                        <button
                          className="button secondary"
                          disabled={busy || !reviewNote.trim()}
                          onClick={() => act('return')}
                        >
                          Yêu cầu chỉnh sửa
                        </button>
                      )}
                      {admin && (editable || draft.status === 'SUBMITTED') && (
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => act('publish')}
                        >
                          Lưu & xuất bản
                        </button>
                      )}
                    </div>
                  </footer>
                </>
              )}
            </main>
          </div>
        )}
        {preview && (
          <ModuleDialog
            content={preview}
            versions={history ?? []}
            busy={busy}
            onClose={() => {
              setPreview(null)
              setHistory(null)
            }}
            onRestore={(version) => {
              const id = preview.id
              setPreview(null)
              create(id, version)
            }}
          />
        )}
      </div>
    </Layout>
  )
}

function LessonEditor({
  lesson,
  onChange,
  related,
}: {
  lesson: CourseLesson
  onChange: (lesson: CourseLesson) => void
  related: RelatedLesson[]
}) {
  const content = lesson.content
  function setContent(next: Partial<typeof content>) {
    onChange({ ...lesson, content: { ...content, ...next } })
  }
  return (
    <>
      <label>
        Tên bài học
        <input
          maxLength={160}
          value={lesson.title}
          onChange={(e) => onChange({ ...lesson, title: e.target.value })}
        />
      </label>
      <label className="cm-check">
        <input
          type="checkbox"
          checked={lesson.archived}
          onChange={(e) => onChange({ ...lesson, archived: e.target.checked })}
        />{' '}
        Lưu trữ bài học (giữ tiến độ và kết quả cũ)
      </label>
      <label>
        Mục tiêu
        <textarea
          value={content.objective}
          onChange={(e) => setContent({ objective: e.target.value })}
        />
      </label>
      <ContentItems
        title="Phần lý thuyết"
        fields={{ title: 'Tiêu đề', body: 'Nội dung' }}
        items={content.sections}
        onChange={(sections) => setContent({ sections })}
      />
      <ContentItems
        title="Ví dụ"
        fields={{ english: 'Tiếng Anh', vietnamese: 'Tiếng Việt' }}
        items={content.examples}
        onChange={(examples) => setContent({ examples })}
      />
      <ContentItems
        title="Lỗi thường gặp"
        fields={{ wrong: 'Câu sai', right: 'Câu đúng', explanation: 'Giải thích' }}
        items={content.mistakes}
        onChange={(mistakes) => setContent({ mistakes })}
      />
      <section className="cm-content-items">
        <h3>Bài học liên quan</h3>
        {content.prerequisites.map((item, index) => (
          <div className="cm-actions" key={index}>
            <span>{item.title}</span>
            <button
              type="button"
              onClick={() =>
                setContent({ prerequisites: content.prerequisites.filter((_, i) => i !== index) })
              }
            >
              Bỏ liên kết
            </button>
          </div>
        ))}
        <label>
          Thêm bài liên quan
          <select
            value=""
            onChange={(e) => {
              const selected = related.find((item) => item.id === e.target.value)
              if (selected)
                setContent({
                  prerequisites: [
                    ...content.prerequisites,
                    { id: selected.id, title: selected.title },
                  ],
                })
            }}
          >
            <option value="">Chọn bài học</option>
            {related
              .filter(
                (item) =>
                  item.id !== lesson.id && !content.prerequisites.some((p) => p.id === item.id),
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.moduleTitle} · {item.title}
                </option>
              ))}
          </select>
        </label>
      </section>
      <label>
        Vận dụng
        <textarea
          value={content.application}
          onChange={(e) => setContent({ application: e.target.value })}
        />
      </label>
      <label>
        Tóm tắt
        <textarea
          value={content.summary}
          onChange={(e) => setContent({ summary: e.target.value })}
        />
      </label>
    </>
  )
}
function ContentItems<T extends Record<string, string>>({
  title,
  fields,
  items,
  onChange,
}: {
  title: string
  fields: Record<keyof T, string>
  items: T[]
  onChange: (items: T[]) => void
}) {
  return (
    <section className="cm-content-items">
      <h3>{title}</h3>
      {items.map((item, index) => (
        <div className="cm-subcard" key={index}>
          {Object.entries(fields).map(([key, label]) => (
            <label key={key}>
              {label as string}
              <textarea
                value={item[key]}
                onChange={(e) =>
                  onChange(
                    items.map((value, i) =>
                      i === index ? { ...value, [key]: e.target.value } : value,
                    ),
                  )
                }
              />
            </label>
          ))}
          <div className="cm-actions">
            <button
              type="button"
              disabled={index === 0}
              aria-label={`Đưa ${title} ${index + 1} lên`}
              onClick={() => onChange(move(items, index, -1))}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              disabled={index === items.length - 1}
              aria-label={`Đưa ${title} ${index + 1} xuống`}
              onClick={() => onChange(move(items, index, 1))}
            >
              <ArrowDown size={14} />
            </button>
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))}>
              Xóa mục
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...items, Object.fromEntries(Object.keys(fields).map((key) => [key, ''])) as T])
        }
      >
        Thêm {title.toLocaleLowerCase('vi-VN')}
      </button>
    </section>
  )
}
function QuestionEditor({
  lesson,
  onChange,
}: {
  lesson: CourseLesson
  onChange: (lesson: CourseLesson) => void
}) {
  const questions = lesson.questions
  function update(index: number, next: Partial<(typeof questions)[number]>) {
    onChange({
      ...lesson,
      questions: questions.map((q, i) => (i === index ? { ...q, ...next } : q)),
    })
  }
  return (
    <>
      <p className="cm-muted">
        Câu trắc nghiệm gồm bốn lựa chọn, một đáp án đúng và giải thích. Lượt đang làm giữ bộ câu
        hỏi lúc bắt đầu.
      </p>
      {questions.map((q, index) => (
        <section className="cm-subcard" key={q.id}>
          <h3>Câu {index + 1}</h3>
          <label>
            Câu hỏi
            <textarea
              aria-label="Nội dung câu hỏi"
              value={q.prompt}
              onChange={(e) => update(index, { prompt: e.target.value })}
            />
          </label>
          <div className="cm-options">
            {q.options.map((option, i) => (
              <label key={i}>
                Lựa chọn {'ABCD'[i]}
                <input
                  value={option}
                  onChange={(e) =>
                    update(index, {
                      options: q.options.map((value, j) => (i === j ? e.target.value : value)),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            Đáp án đúng
            <select
              value={q.correctOption}
              onChange={(e) => update(index, { correctOption: e.target.value })}
            >
              {'ABCD'.split('').map((letter) => (
                <option key={letter}>{letter}</option>
              ))}
            </select>
          </label>
          <label>
            Giải thích
            <textarea
              value={q.explanation}
              onChange={(e) => update(index, { explanation: e.target.value })}
            />
          </label>
          <div className="cm-actions">
            <button
              disabled={index === 0}
              aria-label={`Đưa câu ${index + 1} lên`}
              onClick={() => onChange({ ...lesson, questions: move(questions, index, -1) })}
            >
              <ArrowUp size={14} />
            </button>
            <button
              disabled={index === questions.length - 1}
              aria-label={`Đưa câu ${index + 1} xuống`}
              onClick={() => onChange({ ...lesson, questions: move(questions, index, 1) })}
            >
              <ArrowDown size={14} />
            </button>
            <button
              onClick={() =>
                onChange({ ...lesson, questions: questions.filter((_, i) => i !== index) })
              }
            >
              Xóa câu hỏi
            </button>
          </div>
        </section>
      ))}
      <button
        onClick={() =>
          onChange({
            ...lesson,
            questions: [
              ...questions,
              {
                id: newCourseId('q'),
                prompt: '',
                options: ['', '', '', ''],
                correctOption: 'A',
                explanation: '',
              },
            ],
          })
        }
      >
        <Plus size={16} /> Thêm câu hỏi
      </button>
    </>
  )
}
function LessonPreview({ lesson }: { lesson: CourseLesson }) {
  const c = lesson.content
  return (
    <article className="cm-preview">
      <h2>{lesson.title}</h2>
      <p>
        <strong>Mục tiêu:</strong> {c.objective}
      </p>
      {c.prerequisites.length > 0 && (
        <p>Bài liên quan: {c.prerequisites.map((item) => item.title).join(' · ')}</p>
      )}
      {c.sections.map((section, i) => (
        <section key={i}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </section>
      ))}
      {c.examples.length > 0 && (
        <section>
          <h3>Ví dụ</h3>
          {c.examples.map((item, i) => (
            <blockquote key={i}>
              <p>{item.english}</p>
              <p>{item.vietnamese}</p>
            </blockquote>
          ))}
        </section>
      )}
      {c.mistakes.length > 0 && (
        <section>
          <h3>Lỗi thường gặp</h3>
          {c.mistakes.map((item, i) => (
            <div key={i}>
              <p>
                Sai: <s>{item.wrong}</s>
              </p>
              <p>Đúng: {item.right}</p>
              <p>{item.explanation}</p>
            </div>
          ))}
        </section>
      )}
      <h3>Vận dụng</h3>
      <p>{c.application}</p>
      <h3>Ghi nhớ</h3>
      <p>{c.summary}</p>
      <h3>Luyện tập</h3>
      {lesson.questions.map((q, i) => (
        <section className="cm-subcard" key={q.id}>
          <h3>
            {i + 1}. {q.prompt}
          </h3>
          <ol type="A">
            {q.options.map((option, j) => (
              <li key={j}>{option}</li>
            ))}
          </ol>
          <details>
            <summary>Xem đáp án & giải thích</summary>
            <p>Đáp án: {q.correctOption}</p>
            <p>{q.explanation}</p>
          </details>
        </section>
      ))}
    </article>
  )
}
function ModuleDialog({
  content,
  versions,
  busy,
  onClose,
  onRestore,
}: {
  content: ModuleContent
  versions: ModuleVersion[]
  busy: boolean
  onClose: () => void
  onRestore: (version: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [lessonId, setLessonId] = useState(content.lessons[0]?.id ?? '')
  const lesson = content.lessons.find((item) => item.id === lessonId)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="cm-dialog"
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="cm-preview-title"
    >
      <header className="cm-heading">
        <h2 id="cm-preview-title">{content.title}</h2>
        <button aria-label="Đóng xem trước" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <label>
        Bài học
        <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
          {content.lessons.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
              {item.archived ? ' (lưu trữ)' : ''}
            </option>
          ))}
        </select>
      </label>
      {lesson ? <LessonPreview lesson={lesson} /> : <p>Chưa có bài học.</p>}
      <section>
        <h3>Lịch sử xuất bản</h3>
        <p>Khôi phục tạo một bản nháp mới để kiểm tra và duyệt lại.</p>
        {versions.map((item) => (
          <div className="cm-version" key={item.version}>
            <span>
              v{item.version} · {item.authorName} ·{' '}
              {new Date(item.createdAt).toLocaleString('vi-VN')}
            </span>
            <button disabled={busy} onClick={() => onRestore(item.version)}>
              Khôi phục vào nháp
            </button>
          </div>
        ))}
        {!versions.length && <p>Chưa có thay đổi được xuất bản.</p>}
      </section>
    </dialog>
  )
}
