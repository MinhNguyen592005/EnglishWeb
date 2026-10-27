import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSystemSocket } from '../app/SystemSocketContext'
import { api } from '../services/api'
import type { TeacherQuestion } from '../types'
import './LiveClassExam.css'
import { CalendarDays, ChevronRight, Radio } from 'lucide-react'
import { Pagination, PAGE_SIZE } from './Pagination'

export type LiveExamQuestionType = 'MCQ' | 'FILL_BLANK' | 'ERROR_CORRECTION' | 'REWRITE'

type Question = {
  id: string
  prompt: string
  questionType?: LiveExamQuestionType
  options: string[]
  correct?: number
  acceptedAnswer?: string
}

type Rank = {
  userId: number
  username: string
  displayName: string
  correctCount: number
  answeredCount: number
  status: string
}

type Exam = {
  id: number
  classId: number
  title: string
  version: number
  revision: number
  endsAt: string
  closed: boolean
  owner: boolean
  questions: Question[]
  ranking?: Rank[]
  answers?: Record<string, number | string>
  submitted?: boolean
  correctCount?: number
}

type Listing = {
  id: number
  title: string
  endsAt: string
  closed: boolean
}

type Draft = {
  id?: number
  version?: number
  title: string
  endsAt: string
  closed: boolean
  questions: Question[]
}

const isTextType = (t?: string): boolean =>
  t === 'FILL_BLANK' || t === 'ERROR_CORRECTION' || t === 'REWRITE'

const typeLabel = (t?: string): string => {
  switch (t) {
    case 'FILL_BLANK': return 'Điền từ'
    case 'ERROR_CORRECTION': return 'Sửa lỗi'
    case 'REWRITE': return 'Viết lại câu'
    case 'MCQ':
    default: return 'Trắc nghiệm'
  }
}

const typeBadgeClass = (t?: string): string => {
  switch (t) {
    case 'FILL_BLANK': return 'exam-q-badge fill_blank'
    case 'ERROR_CORRECTION': return 'exam-q-badge error_correction'
    case 'REWRITE': return 'exam-q-badge rewrite'
    case 'MCQ':
    default: return 'exam-q-badge mcq'
  }
}

const question = (): Question => ({
  id: crypto.randomUUID(),
  prompt: '',
  questionType: 'MCQ',
  options: ['', '', '', ''],
  correct: 0,
  acceptedAnswer: ''
})

const localDate = (value: string) => {
  const d = new Date(value)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const status = (s: string) =>
  ({ NOT_STARTED: 'Chưa bắt đầu', WORKING: 'Đang làm', SUBMITTED: 'Đã nộp', EXPIRED: 'Hết giờ' }[s] || s)

export function LiveClassExam({ classId, isOwner, allowCreate = true }: { classId: number; isOwner: boolean; allowCreate?: boolean }) {
  const { request, subscribe, connected } = useSystemSocket()
  const [list, setList] = useState<Listing[]>([])
  const [listPage,setListPage]=useState(1)
  const [exam, setExam] = useState<Exam | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [bankOpen, setBankOpen] = useState(false)
  const [bankQuestions, setBankQuestions] = useState<TeacherQuestion[]>([])
  const [bankSelected, setBankSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({})

  const current = useRef<Exam | null>(null)
  const mounted = useRef(true)
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const apply = useCallback((next: Exam) => {
    if (!mounted.current || next.classId !== classId) return
    const old = current.current
    if (old?.id === next.id && (old.revision > next.revision || (old.revision === next.revision && old.closed && !next.closed))) return
    if (old?.id === next.id && next.version > old.version && !next.owner) {
      setNotice('Giáo viên vừa cập nhật đề. Nội dung mới đã được áp dụng; hãy kiểm tra lại các câu trả lời của bạn.')
    }
    current.current = next
    setExam(next)
  }, [classId])

  useEffect(() => {
    if (exam?.answers) {
      setTextAnswers(prev => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(exam.answers || {})) {
          if (typeof v === 'string' && next[k] === undefined) {
            next[k] = v
          }
        }
        return next
      })
    }
  }, [exam?.answers])

  const load = useCallback(() =>
    request<Listing[]>('EXAM_LIST', 'EXAM_DATA', { classId }).then(data => {
      if (mounted.current) setList(data)
    }), [classId, request])

  useEffect(() => {
    mounted.current = true
    const off = subscribe(message => {
      if (message.action === 'EXAM_UPDATE') {
        const next = message.payload as Exam
        if (next.id === current.current?.id) apply(next)
      }
      if (message.action === 'EXAM_ERROR') {
        setError((message.payload as { message: string }).message)
        current.current = null
        setExam(null)
      }
    })
    return () => {
      mounted.current = false
      off()
      current.current = null
      request('EXAM_UNWATCH', 'EXAM_DATA').catch(() => {})
    }
  }, [request, subscribe, apply])

  useEffect(() => {
    if (!connected) return
    const sync = () => {
      load().catch(e => { if (mounted.current) setError(e.message) })
      const id = current.current?.id
      if (id) {
        request<Exam>('EXAM_SYNC', 'EXAM_DATA', { examId: id })
          .then(next => { if (current.current?.id === id) apply(next) })
          .catch(e => { if (mounted.current) setError(e.message) })
      }
    }
    sync()
    const timer = setInterval(sync, 5000)
    return () => clearInterval(timer)
  }, [connected, load, request, apply])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function open(id: number) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next = await request<Exam>('EXAM_OPEN', 'EXAM_DATA', { examId: id })
      apply(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      const sanitizedQuestions = draft.questions.map(q => {
        const rawType = (q.questionType || '').toString().toUpperCase()
        const accepted = (q.acceptedAnswer || '').trim()
        const isText = isTextType(rawType) || (q.options?.length !== 4 && !!accepted)
        const qType = isText ? ((rawType && isTextType(rawType) ? rawType : 'FILL_BLANK') as LiveExamQuestionType) : 'MCQ'
        if (isText) {
          return {
            id: q.id,
            prompt: q.prompt.trim(),
            questionType: qType,
            acceptedAnswer: accepted,
            options: []
          }
        }
        return {
          id: q.id,
          prompt: q.prompt.trim(),
          questionType: 'MCQ' as const,
          options: (q.options || ['', '', '', '']).map(o => o.trim()),
          correct: q.correct ?? 0
        }
      })

      const payload = {
        ...draft,
        classId,
        examId: draft.id,
        endsAt: new Date(draft.endsAt).toISOString(),
        questions: sanitizedQuestions
      }
      const next = await request<Exam>(draft.id ? 'EXAM_EDIT' : 'EXAM_CREATE', 'EXAM_DATA', payload)
      apply(next)
      setDraft(null)
      await load()
      setNotice('Đã lưu đề và đồng bộ đến học sinh. Điểm được tính theo đáp án mới nhất.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function answer(questionId: string, val: number | string) {
    const active = current.current
    if (!active || saving) return
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        examId: active.id,
        version: active.version,
        questionId
      }
      if (typeof val === 'number') {
        payload.option = val
      } else {
        payload.option = 0
        payload.answer = val
        payload.textAnswer = val
      }
      const next = await request<Exam>('EXAM_ANSWER', 'EXAM_DATA', payload)
      if (current.current?.id === active.id) apply(next)
    } catch (e) {
      setError((e as Error).message)
      request<Exam>('EXAM_SYNC', 'EXAM_DATA', { examId: active.id })
        .then(next => { if (current.current?.id === active.id) apply(next) })
        .catch(() => {})
    } finally {
      setSaving(false)
    }
  }

  const handleTextChange = (questionId: string, val: string) => {
    setTextAnswers(prev => ({ ...prev, [questionId]: val }))
    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId])
    }
    debounceTimers.current[questionId] = setTimeout(() => {
      delete debounceTimers.current[questionId]
      answer(questionId, val.trim())
    }, 600)
  }

  const handleTextBlur = (questionId: string) => {
    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId])
      delete debounceTimers.current[questionId]
    }
    const currentVal = (textAnswers[questionId] ?? (exam?.answers?.[questionId] as string ?? '')).trim()
    const serverVal = (exam?.answers?.[questionId] as string ?? '').trim()
    if (currentVal !== serverVal) {
      answer(questionId, currentVal)
    }
  }

  const flushTextTimers = () => {
    for (const [qId, timer] of Object.entries(debounceTimers.current)) {
      clearTimeout(timer)
      const currentVal = (textAnswers[qId] ?? '').trim()
      answer(qId, currentVal)
    }
    debounceTimers.current = {}
  }

  async function submit() {
    if (!exam) return
    flushTextTimers()
    if (!window.confirm('Nộp bài? Sau khi nộp bạn không thể đổi đáp án.')) return
    setSaving(true)
    setError('')
    try {
      apply(await request<Exam>('EXAM_SUBMIT', 'EXAM_DATA', { examId: exam.id, version: exam.version }))
      setNotice('Đã nộp bài. Giáo viên đã nhận được kết quả.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function edit() {
    if (!exam) return
    setDraft({
      id: exam.id,
      version: exam.version,
      title: exam.title,
      endsAt: localDate(exam.endsAt),
      closed: exam.closed,
      questions: structuredClone(exam.questions).map(q => ({
        ...q,
        questionType: q.questionType || 'MCQ',
        options: q.options || (isTextType(q.questionType) ? [] : ['', '', '', '']),
        acceptedAnswer: q.acceptedAnswer || '',
        correct: q.correct ?? 0
      }))
    })
  }

  function changeQuestion(index: number, patch: Partial<Question>) {
    if (!draft) return
    setDraft({
      ...draft,
      questions: draft.questions.map((q, i) => {
        if (i !== index) return q
        const updated = { ...q, ...patch }
        if (patch.questionType) {
          if (isTextType(patch.questionType)) {
            updated.options = []
            if (!updated.acceptedAnswer) updated.acceptedAnswer = ''
          } else {
            if (!updated.options || updated.options.length !== 4) {
              updated.options = ['', '', '', '']
            }
            if (updated.correct === undefined) updated.correct = 0
          }
        }
        return updated
      })
    })
  }

  async function openBank() {
    setBusy(true)
    setError('')
    try {
      const data = await api.teacherQuestions()
      setBankQuestions(data)
      setBankSelected(new Set())
      setBankOpen(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function importFromBank() {
    if (!draft || !bankSelected.size) return
    const selected = bankQuestions.filter(q => bankSelected.has(q.id))
    const imported: Question[] = selected.map(q => {
      const rawType = (q.questionType || (q as unknown as Record<string, unknown>).question_type || '').toString().toUpperCase()
      const accepted = (q.acceptedAnswer || (q as unknown as Record<string, unknown>).accepted_answer || '').toString().trim()
      const isText = isTextType(rawType) || (!rawType && !!accepted)
      const qType = (isText ? (rawType && isTextType(rawType) ? rawType : 'FILL_BLANK') : 'MCQ') as LiveExamQuestionType
      if (isText) {
        return {
          id: crypto.randomUUID(),
          prompt: q.prompt,
          questionType: qType,
          options: [],
          acceptedAnswer: accepted
        }
      }
      return {
        id: crypto.randomUUID(),
        prompt: q.prompt,
        questionType: 'MCQ',
        options: [q.optionA || '', q.optionB || '', q.optionC || '', q.optionD || ''],
        correct: Math.max(0, 'ABCD'.indexOf(q.correctOption?.toUpperCase() || 'A'))
      }
    })
    let base = draft.questions
    if (base.length === 1 && !base[0].prompt.trim()) base = []
    const nextList = [...base, ...imported].slice(0, 30)
    setDraft({ ...draft, questions: nextList })
    setBankOpen(false)
    setNotice(`Đã lấy ${imported.length} câu từ kho câu hỏi vào đề kiểm tra.`)
  }

  const remaining = exam ? Math.max(0, Math.ceil((new Date(exam.endsAt).getTime() - now) / 1000)) : 0
  const readonly = !!exam && (exam.closed || exam.submitted || remaining === 0)
  const currentListPage=Math.min(listPage,Math.max(1,Math.ceil(list.length/PAGE_SIZE)))
  const visibleExams=list.slice((currentListPage-1)*PAGE_SIZE,currentListPage*PAGE_SIZE)

  return (
    <section className="card feature-card live-exam">
      <div className="panel-heading">
        <div>
          <span className="section-label">KIỂM TRA TRỰC TIẾP</span>
          <h2>Kiểm tra của lớp <span className="exam-list-count">{list.length}</span></h2>
          <p className="muted">
            {isOwner
              ? 'Chọn bài kiểm tra để xem đề, quản lý và theo dõi kết quả.'
              : 'Câu trả lời được tự động lưu qua WebSocket. Không cần tải lại trang.'}
          </p>
        </div>
        <span className={`tag ${connected ? '' : 'muted'}`}>{connected ? '● Đã kết nối' : 'Đang kết nối lại…'}</span>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="success-banner" role="status">{notice}</div>}

      <div className="live-exam-list">
        {visibleExams.map(item => (
          <button
            className={`exam-list-card ${exam?.id === item.id ? 'is-selected' : ''}`}
            disabled={busy || !connected}
            key={item.id}
            onClick={() => open(item.id)}
          >
            <span className="exam-list-icon"><Radio size={20}/></span><span className="exam-list-info"><strong>{item.title}</strong><small><CalendarDays size={14}/>Hạn {new Date(item.endsAt).toLocaleString('vi-VN')}</small></span><span className={`exam-list-state ${item.closed || new Date(item.endsAt).getTime() <= now?'closed':'open'}`}>{item.closed || new Date(item.endsAt).getTime() <= now ? 'Đã đóng' : 'Đang mở'}</span><ChevronRight size={18}/>
          </button>
        ))}
        {!list.length && <div className="exam-list-empty"><Radio size={30}/><h3>Chưa có bài kiểm tra trực tiếp</h3><p>{isOwner?'Bấm “Tạo kiểm tra mới” để chọn bộ câu hỏi đã lưu và mở kiểm tra cho lớp.':'Bài kiểm tra sẽ xuất hiện tại đây khi giáo viên tạo đề.'}</p></div>}
        {isOwner && allowCreate && (
          <button
            className="button secondary"
            onClick={() =>
              setDraft({
                title: '',
                endsAt: localDate(new Date(Date.now() + 3600000).toISOString()),
                closed: false,
                questions: [question()]
              })
            }
          >
            + Tạo kiểm tra
          </button>
        )}
      </div>
      {list.length>0&&<Pagination total={list.length} page={currentListPage} onPageChange={setListPage}/>}

      {exam && (
        <div className="live-exam-body">
          <div className="panel-heading">
            <div>
              <h3>{exam.title}</h3>
              <p className="muted">
                Phiên bản {exam.version} ·{' '}
                {exam.closed
                  ? 'Đã đóng'
                  : `Còn ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}{' '}
                · {exam.questions.length} câu
              </p>
            </div>
            <div className="button-row">
              {exam.owner && <button className="button secondary" onClick={edit}>Sửa đề / Đáp án</button>}
              <button
                className="button secondary"
                onClick={() => {
                  current.current = null
                  setExam(null)
                  setDraft(null)
                  request('EXAM_UNWATCH', 'EXAM_DATA').catch(() => {})
                }}
              >
                Đóng màn hình
              </button>
            </div>
          </div>

          {exam.owner ? (
            <>
              <p className="muted">
                Bảng xếp hạng cập nhật thời gian thực. Điểm /10 được server tự động chấm lại khi sửa đề/đáp án, kể cả các bài đã nộp.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hạng</th>
                      <th>Học sinh</th>
                      <th>Đã làm</th>
                      <th>Đúng</th>
                      <th>Điểm /10</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exam.ranking?.map((r, i) => (
                      <tr key={r.userId}>
                        <td>{i + 1}</td>
                        <td>
                          <strong>{r.displayName}</strong>
                          <small>#{r.userId} · {r.username}</small>
                        </td>
                        <td>{r.answeredCount}/{exam.questions.length}</td>
                        <td>{r.correctCount}</td>
                        <td><strong>{(10 * r.correctCount / exam.questions.length).toFixed(2)}</strong></td>
                        <td>{status(r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                {exam.submitted
                  ? 'Bạn đã nộp bài.'
                  : saving
                  ? 'Đang lưu đáp án…'
                  : `Đã làm ${Object.keys(exam.answers || {}).length}/${exam.questions.length} câu.`}{' '}
                {exam.closed && `Kết quả: ${exam.correctCount ?? 0}/${exam.questions.length} câu đúng.`}
              </p>

              {exam.questions.map((q, i) => (
                <fieldset className="live-exam-question" key={q.id} disabled={readonly || saving || !connected}>
                  <legend>
                    <span className={typeBadgeClass(q.questionType)}>{typeLabel(q.questionType)}</span>
                    {i + 1}. {q.prompt}
                  </legend>

                  {isTextType(q.questionType) ? (
                    <div className="live-exam-text-answer">
                      <label>
                        <span>
                          {q.questionType === 'FILL_BLANK' && 'Câu trả lời (từ hoặc cụm từ điền vào chỗ trống):'}
                          {q.questionType === 'ERROR_CORRECTION' && 'Câu trả lời (từ hoặc cụm từ sau khi sửa đúng):'}
                          {q.questionType === 'REWRITE' && 'Câu trả lời (câu viết lại hoàn chỉnh):'}
                        </span>
                        <input
                          type="text"
                          maxLength={255}
                          disabled={readonly || !connected}
                          placeholder="Nhập câu trả lời của bạn..."
                          value={textAnswers[q.id] ?? (exam.answers?.[q.id] != null ? String(exam.answers[q.id]) : '')}
                          onChange={e => handleTextChange(q.id, e.target.value)}
                          onBlur={() => handleTextBlur(q.id)}
                        />
                      </label>
                    </div>
                  ) : (
                    (q.options || []).map((option, index) => (
                      <label
                        className={`live-exam-option ${exam.answers?.[q.id] === index ? 'selected' : ''}`}
                        key={index}
                      >
                        <input
                          type="radio"
                          name={`exam-${exam.id}-${q.id}`}
                          checked={exam.answers?.[q.id] === index}
                          onChange={() => answer(q.id, index)}
                        />
                        <span>{String.fromCharCode(65 + index)}. {option}</span>
                      </label>
                    ))
                  )}
                </fieldset>
              ))}

              {!readonly && (
                <button className="button primary" disabled={saving || !connected} onClick={submit}>
                  Nộp bài kiểm tra
                </button>
              )}
            </>
          )}
        </div>
      )}

      {draft && (
        <form className="live-exam-editor" onSubmit={save}>
          <h3>{draft.id ? 'Chỉnh sửa đề kiểm tra trực tiếp' : 'Tạo bài kiểm tra trực tiếp'}</h3>
          <p className="muted">
            Hỗ trợ 4 dạng câu: Trắc nghiệm (MCQ), Điền từ (FILL_BLANK), Sửa lỗi (ERROR_CORRECTION), Viết lại câu (REWRITE).
            Lưu đề sẽ tự động chấm lại toàn bộ bài làm của học sinh theo đáp án mới.
          </p>

          <div className="form-grid">
            <label>
              Tên kiểm tra
              <input
                required
                maxLength={160}
                value={draft.title}
                onChange={e => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Hạn làm bài
              <input
                required
                type="datetime-local"
                value={draft.endsAt}
                onChange={e => setDraft({ ...draft, endsAt: e.target.value })}
              />
            </label>
            <label>
              Trạng thái
              <select
                value={String(draft.closed)}
                onChange={e => setDraft({ ...draft, closed: e.target.value === 'true' })}
              >
                <option value="false">Đang mở</option>
                <option value="true">Đóng kiểm tra</option>
              </select>
            </label>
          </div>

          {draft.questions.map((q, i) => (
            <div className="live-exam-question" key={q.id}>
              <div className="editor-q-header">
                <strong>Câu {i + 1}</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem' }}>
                  Dạng câu:
                  <select
                    className="editor-q-type-select"
                    value={q.questionType || 'MCQ'}
                    onChange={e => changeQuestion(i, { questionType: e.target.value as LiveExamQuestionType })}
                  >
                    <option value="MCQ">Trắc nghiệm (MCQ)</option>
                    <option value="FILL_BLANK">Điền từ (FILL_BLANK)</option>
                    <option value="ERROR_CORRECTION">Sửa lỗi (ERROR_CORRECTION)</option>
                    <option value="REWRITE">Viết lại câu (REWRITE)</option>
                  </select>
                </label>
              </div>

              <label>
                Nội dung câu hỏi
                <textarea
                  aria-label={`Câu ${i + 1}`}
                  required
                  maxLength={500}
                  value={q.prompt}
                  onChange={e => changeQuestion(i, { prompt: e.target.value })}
                />
              </label>

              {isTextType(q.questionType) ? (
                <div style={{ marginTop: '8px' }}>
                  <label>
                    Đáp án mẫu để chấm tự động
                    <input
                      required
                      maxLength={255}
                      placeholder={
                        q.questionType === 'FILL_BLANK'
                          ? 'Nhập từ/cụm từ mẫu cần điền...'
                          : q.questionType === 'ERROR_CORRECTION'
                          ? 'Nhập từ/cụm từ đã sửa đúng...'
                          : 'Nhập câu viết lại hoàn chỉnh...'
                      }
                      value={q.acceptedAnswer || ''}
                      onChange={e => changeQuestion(i, { acceptedAnswer: e.target.value })}
                    />
                  </label>
                  <small style={{ color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                    * Hệ thống tự động bỏ qua viết hoa/thường, khoảng trắng thừa và dấu câu cuối câu (. ! ?) khi chấm bài.
                  </small>
                </div>
              ) : (
                <div className="form-grid">
                  {(q.options && q.options.length === 4 ? q.options : ['', '', '', '']).map((option, index) => (
                    <label key={index}>
                      Lựa chọn {String.fromCharCode(65 + index)}
                      <input
                        required
                        maxLength={160}
                        value={option}
                        onChange={e =>
                          changeQuestion(i, {
                            options: (q.options && q.options.length === 4 ? q.options : ['', '', '', '']).map((o, j) =>
                              j === index ? e.target.value : o
                            )
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Đáp án đúng
                    <select
                      aria-label="Đáp án đúng"
                      value={q.correct ?? 0}
                      onChange={e => changeQuestion(i, { correct: Number(e.target.value) })}
                    >
                      {[0, 1, 2, 3].map(index => (
                        <option value={index} key={index}>
                          {String.fromCharCode(65 + index)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div style={{ marginTop: '12px', textAlign: 'right' }}>
                <button
                  type="button"
                  className="text-button"
                  disabled={draft.questions.length === 1}
                  onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}
                >
                  Xóa câu {i + 1}
                </button>
              </div>
            </div>
          ))}

          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              disabled={draft.questions.length >= 30}
              onClick={() => setDraft({ ...draft, questions: [...draft.questions, question()] })}
            >
              + Thêm câu
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={draft.questions.length >= 30 || busy}
              onClick={openBank}
            >
              + Lấy từ kho câu hỏi
            </button>
            <button type="button" className="button secondary" onClick={() => setDraft(null)}>
              Hủy
            </button>
            <button className="button primary" disabled={busy || !connected}>
              Lưu và đồng bộ
            </button>
          </div>
        </form>
      )}

      {bankOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={e => { if (e.target === e.currentTarget) setBankOpen(false) }}
        >
          <div className="card modal-card" role="dialog" aria-modal="true" aria-label="Lấy câu hỏi từ kho">
            <div className="panel-heading">
              <h2>Lấy từ kho câu hỏi của tôi</h2>
              <button type="button" className="text-button" onClick={() => setBankOpen(false)}>
                Đóng
              </button>
            </div>
            <p className="muted">
              Chọn câu hỏi bạn đã soạn trong kho riêng (hỗ trợ cả trắc nghiệm và câu tự luận) để đưa vào đề kiểm tra trực tiếp (tối đa 30 câu trong đề).
            </p>
            <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'grid', gap: '8px', marginBottom: '16px' }}>
              {bankQuestions.map(q => (
                <label
                  key={q.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px',
                    background: '#f8fafc',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={bankSelected.has(q.id)}
                    onChange={() => {
                      const next = new Set(bankSelected)
                      if (next.has(q.id)) next.delete(q.id)
                      else next.add(q.id)
                      setBankSelected(next)
                    }}
                  />
                  <div>
                    <strong>
                      #{q.id} · <span className={typeBadgeClass(q.questionType)}>{typeLabel(q.questionType)}</span> {q.prompt}
                    </strong>
                    <small style={{ display: 'block', color: 'var(--muted)', marginTop: '2px' }}>
                      {isTextType(q.questionType)
                        ? `Đáp án mẫu: ${q.acceptedAnswer || 'Chưa thiết lập'}`
                        : `Đáp án ${q.correctOption} · A: ${q.optionA || '—'} | B: ${q.optionB || '—'}`}
                    </small>
                  </div>
                </label>
              ))}
              {!bankQuestions.length && (
                <p className="muted">Kho câu hỏi của bạn đang trống. Hãy soạn câu hỏi ở mục "Soạn câu hỏi".</p>
              )}
            </div>
            <div className="button-row">
              <button type="button" className="button secondary" onClick={() => setBankOpen(false)}>
                Hủy
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!bankSelected.size}
                onClick={importFromBank}
              >
                Nhập {bankSelected.size} câu vào đề
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
