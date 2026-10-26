import { useSystemSocket } from '../app/SystemSocketContext'
import { CheckSquare, ExternalLink, FileText, Globe, PencilLine, Plus, Radio, RotateCcw, Sparkles, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Loading } from '../components/States'
import { TxtQuestionImporter } from '../components/TxtQuestionImporter'
import { api } from '../services/api'
import type { ParsedQuestionDraft } from '../services/questionTxtParser'
import type { Classroom, Lesson, TeacherQuestion } from '../types'
import './TeacherQuestionsPage.css'

const labels = { MCQ: 'Trắc nghiệm', FILL_BLANK: 'Điền từ', ERROR_CORRECTION: 'Sửa lỗi', REWRITE: 'Viết lại câu' }
const blank: Omit<TeacherQuestion, 'id' | 'active'> = {
  lessonId: 0,
  prompt: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctOption: 'A',
  explanation: '',
  questionType: 'MCQ',
  acceptedAnswer: null
}

export function TeacherQuestionsPage() {
  const {subscribe,connected}=useSystemSocket()
  useEffect(()=>{if(connected)void reload().catch(e=>setError(e.message));return subscribe(message=>{if(message.action==='CURRICULUM_CHANGED')void reload().catch(e=>setError(e.message))})},[subscribe,connected])
  const [questions, setQuestions] = useState<TeacherQuestion[] | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [classes, setClasses] = useState<Classroom[]>([])
  const [form, setForm] = useState<Omit<TeacherQuestion, 'id' | 'active'>>({ ...blank })
  const [editing, setEditing] = useState<number | null>(null)
  const [mode, setMode] = useState<'batch' | 'manual'>('batch')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  // Selection & Actions
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [examModalOpen, setExamModalOpen] = useState(false)
  const [examClassId, setExamClassId] = useState<number>(0)
  const [examTitle, setExamTitle] = useState('')
  const [examEndsAt, setExamEndsAt] = useState('')
  const [createdExamInfo, setCreatedExamInfo] = useState<{ examId: number; classId: number; count: number } | null>(null)

  // Filters & Range Selection
  const [filterType, setFilterType] = useState<'ALL' | TeacherQuestion['questionType']>('ALL')
  const [filterLessonId, setFilterLessonId] = useState<number>(0)
  const [filterSearch, setFilterSearch] = useState<string>('')
  const [rangeFrom, setRangeFrom] = useState<number>(1)
  const [rangeTo, setRangeTo] = useState<number>(10)

  async function reload() {
    setQuestions(await api.teacherQuestions())
  }

  useEffect(() => {
    reload().catch(e => setError(e.message))
    api.lessons().then(setLessons).catch(() => {})
    api.classes().then(cls => {
      setClasses(cls)
      if (cls.length > 0) setExamClassId(cls[0].id)
    }).catch(() => {})
  }, [])

  function edit(q: TeacherQuestion) {
    setEditing(q.id)
    setMode('manual')
    setForm({
      lessonId: q.lessonId,
      prompt: q.prompt,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: q.correctOption,
      explanation: q.explanation,
      questionType: q.questionType || 'MCQ',
      acceptedAnswer: q.acceptedAnswer
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (editing) await api.teacherEditQuestion(editing, form)
      else await api.teacherCreateQuestion(form)
      setNotice(editing ? 'Đã cập nhật câu hỏi.' : 'Đã thêm câu hỏi vào kho riêng.')
      setForm({ ...blank })
      setEditing(null)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function active(q: TeacherQuestion) {
    setBusy(true)
    setError('')
    try {
      await api.teacherActivateQuestion(q.id, !q.active)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveBatch(targetLessonId: number, drafts: ParsedQuestionDraft[]) {
    setBusy(true)
    setError('')
    try {
      const items: Omit<TeacherQuestion, 'id' | 'active' | 'lessonId'>[] = drafts.map(d => ({
        prompt: d.prompt,
        optionA: d.optionA,
        optionB: d.optionB,
        optionC: d.optionC,
        optionD: d.optionD,
        correctOption: d.correctOption || 'A',
        explanation: d.explanation,
        questionType: d.questionType,
        acceptedAnswer: d.questionType === 'MCQ' ? null : d.acceptedAnswer
      }))
      const res = await api.teacherCreateQuestionsBatch({ lessonId: targetLessonId, questions: items })
      setNotice(`Đã thêm thành công ${res.createdCount} câu hỏi vào kho riêng của bạn!`)
      await reload()
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setBusy(false)
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredQuestions = (questions || []).filter(q => {
    if (filterType !== 'ALL') {
      const qType = q.questionType || 'MCQ'
      if (qType !== filterType) return false
    }
    if (filterLessonId !== 0 && q.lessonId !== filterLessonId) {
      return false
    }
    if (filterSearch.trim()) {
      const query = filterSearch.toLowerCase().trim()
      const inPrompt = q.prompt.toLowerCase().includes(query)
      const inAccepted = q.acceptedAnswer?.toLowerCase().includes(query) || false
      const inOptions = [q.optionA, q.optionB, q.optionC, q.optionD].some(opt => opt?.toLowerCase().includes(query))
      const inExplanation = q.explanation?.toLowerCase().includes(query) || false
      if (!inPrompt && !inAccepted && !inOptions && !inExplanation) return false
    }
    return true
  })

  const countByType = {
    ALL: (questions || []).length,
    MCQ: (questions || []).filter(q => (!q.questionType || q.questionType === 'MCQ')).length,
    FILL_BLANK: (questions || []).filter(q => q.questionType === 'FILL_BLANK').length,
    ERROR_CORRECTION: (questions || []).filter(q => q.questionType === 'ERROR_CORRECTION').length,
    REWRITE: (questions || []).filter(q => q.questionType === 'REWRITE').length,
  }

  function handleSelectRange(from: number, to: number) {
    if (!filteredQuestions.length) return
    const total = filteredQuestions.length
    const start = Math.max(1, Math.min(from, to))
    const end = Math.min(total, Math.max(from, to))
    if (start > end) return

    setSelectedIds(prev => {
      const next = new Set(prev)
      for (let i = start - 1; i <= end - 1; i++) {
        next.add(filteredQuestions[i].id)
      }
      return next
    })
    setNotice(`Đã chọn từ câu STT #${start} đến STT #${end} (${end - start + 1} câu).`)
  }

  function handleDeselectRange(from: number, to: number) {
    if (!filteredQuestions.length) return
    const total = filteredQuestions.length
    const start = Math.max(1, Math.min(from, to))
    const end = Math.min(total, Math.max(from, to))
    if (start > end) return

    setSelectedIds(prev => {
      const next = new Set(prev)
      for (let i = start - 1; i <= end - 1; i++) {
        next.delete(filteredQuestions[i].id)
      }
      return next
    })
    setNotice(`Đã bỏ chọn từ câu STT #${start} đến STT #${end}.`)
  }

  function applyPresetRange(count: number) {
    if (!filteredQuestions.length) return
    const from = 1
    const to = Math.min(filteredQuestions.length, count)
    setRangeFrom(from)
    setRangeTo(to)
    handleSelectRange(from, to)
  }

  function toggleSelectAllFiltered() {
    if (!filteredQuestions.length) return
    const allFilteredSelected = filteredQuestions.every(q => selectedIds.has(q.id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredQuestions.forEach(q => next.delete(q.id))
      } else {
        filteredQuestions.forEach(q => next.add(q.id))
      }
      return next
    })
  }

  const isAllFilteredSelected = filteredQuestions.length > 0 && filteredQuestions.every(q => selectedIds.has(q.id))

  async function handlePromoteSelected() {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds).filter(id => questions?.some(q => q.id===id && q.active && !q.adminBlocked))
    const selectedQuestions = questions?.filter(q => ids.includes(q.id)) || []
    const mcqQuestions = selectedQuestions.filter(q => !q.questionType || q.questionType === 'MCQ')
    const nonMcqCount = selectedQuestions.length - mcqQuestions.length

    if (mcqQuestions.length === 0) {
      setError('Chỉ có câu hỏi dạng Trắc nghiệm (MCQ) mới có thể đưa vào ngân hàng câu hỏi chung cho Hành tinh chính và PvP. Các dạng khác (Điền từ, Sửa lỗi, Viết lại câu) được dùng cho Bài tập lớp và Kiểm tra trực tiếp.')
      return
    }

    const confirmMsg = nonMcqCount > 0
      ? `Bạn đã chọn ${selectedQuestions.length} câu hỏi, trong đó có ${nonMcqCount} câu tự luận sẽ được bỏ qua. Bạn có chắc muốn sao chép ${mcqQuestions.length} câu hỏi trắc nghiệm vào ngân hàng câu hỏi chung của hệ thống không?`
      : `Bạn có chắc muốn sao chép ${mcqQuestions.length} câu hỏi trắc nghiệm đã chọn vào ngân hàng câu hỏi chung của hệ thống không?`

    if (!window.confirm(confirmMsg)) return
    setBusy(true)
    setError('')
    try {
      const res = await api.teacherPromoteQuestionsToCommon(mcqQuestions.map(q => q.id))
      setNotice(`Đã đưa thành công ${res.promotedCount} câu hỏi trắc nghiệm vào ngân hàng câu hỏi chung của hệ thống!`)
      setSelectedIds(new Set())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handlePromoteSingle(q: TeacherQuestion) {
    if (q.questionType && q.questionType !== 'MCQ') {
      setError('Chỉ có câu hỏi dạng Trắc nghiệm (MCQ) mới có thể đưa vào ngân hàng câu hỏi chung. Các dạng Điền từ, Sửa lỗi, Viết lại câu được dùng cho Bài tập lớp và Kiểm tra trực tiếp.')
      return
    }
    if (!window.confirm(`Bạn có chắc muốn đưa câu hỏi trắc nghiệm "#${q.id}" vào ngân hàng câu hỏi chung của hệ thống?`)) return
    setBusy(true)
    setError('')
    try {
      const res = await api.teacherPromoteQuestionsToCommon([q.id])
      setNotice(`Đã đưa thành công ${res.promotedCount} câu hỏi vào ngân hàng câu hỏi chung!`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openLiveExamModal(overrideIds?: number[]) {
    if (overrideIds && overrideIds.length > 0) {
      setSelectedIds(new Set(overrideIds))
    }
    if (!classes.length) {
      api.classes().then(cls => {
        setClasses(cls)
        if (cls.length > 0 && !examClassId) setExamClassId(cls[0].id)
      }).catch(() => {})
    } else if (!examClassId && classes.length > 0) {
      setExamClassId(classes[0].id)
    }
    const d = new Date(Date.now() + 3600000)
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setExamEndsAt(localIso)
    setExamTitle(`Kiểm tra trực tiếp - ${new Date().toLocaleDateString('vi-VN')}`)
    setExamModalOpen(true)
  }

  async function handleCreateLiveExam(e: FormEvent) {
    e.preventDefault()
    if (!examClassId) {
      setError('Vui lòng chọn lớp học để tạo bài kiểm tra trực tiếp.')
      return
    }
    const ids = Array.from(selectedIds).filter(id => questions?.some(q => q.id===id && q.active && !q.adminBlocked))
    if (ids.length === 0) {
      setError('Vui lòng chọn ít nhất một câu hỏi.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await api.teacherCreateLiveExamFromQuestions({
        classId: examClassId,
        title: examTitle.trim() || 'Bài kiểm tra trực tiếp',
        endsAt: new Date(examEndsAt).toISOString(),
        questionIds: ids
      })
      setNotice(`Đã tạo thành công bài kiểm tra "${examTitle}" (${res.questionsCount} câu) cho lớp!`)
      setCreatedExamInfo({ examId: res.examId, classId: res.classId, count: res.questionsCount })
      setExamModalOpen(false)
      setSelectedIds(new Set())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout title="Soạn câu hỏi">
      <div className="page-heading">
        <div>
          <span className="section-label">GÓC GIÁO VIÊN</span>
          <h1>Kho câu hỏi của tôi</h1>
          <p>Câu hỏi riêng được ưu tiên khi học viên làm nhiệm vụ của lớp bạn, có thể chuyển sang câu hỏi chung hoặc tạo bài kiểm tra trực tiếp.</p>
        </div>
        <div className="heading-icon">
          <PencilLine />
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && (
        <div className="success-banner" role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span>{notice}</span>
          {createdExamInfo && (
            <Link to={`/classes/${createdExamInfo.classId}?view=exams`} className="button primary" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
              <ExternalLink size={14} style={{ marginRight: 6, display: 'inline', verticalAlign: 'text-bottom' }} /> Đến phòng kiểm tra của lớp
            </Link>
          )}
        </div>
      )}

      <div className="tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'batch'}
          className={mode === 'batch' ? 'active' : ''}
          onClick={() => {
            setMode('batch')
            setEditing(null)
          }}
        >
          <Sparkles size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
          Thêm tự động từ file .txt (Nhanh)
        </button>
        <button
          role="tab"
          aria-selected={mode === 'manual'}
          className={mode === 'manual' ? 'active' : ''}
          onClick={() => setMode('manual')}
        >
          <PencilLine size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
          {editing ? 'Đang sửa câu hỏi' : 'Soạn thủ công từng câu'}
        </button>
      </div>

      {mode === 'batch' ? (
        <section className="card feature-card">
          <h2>
            <FileText /> Thêm tự động bộ câu hỏi từ file .txt
          </h2>
          <p className="muted">
            Hỗ trợ kéo-thả file .txt, chọn file từ máy, dán trực tiếp file .txt bằng <strong>Ctrl+V</strong>, hoặc dán nội dung chữ. Hệ thống sẽ tự động bóc tách và điền khuyết các trường còn thiếu.
          </p>
          <TxtQuestionImporter
            lessons={lessons}
            defaultLessonId={form.lessonId}
            defaultQuestionType={form.questionType}
            busy={busy}
            onSaveBatch={handleSaveBatch}
          />
        </section>
      ) : (
        <section className="card feature-card">
          <h2>{editing ? 'Sửa câu hỏi' : 'Soạn câu hỏi mới'}</h2>
          <form className="form-grid" onSubmit={save}>
            <label>
              Bài học
              <select
                required
                value={form.lessonId}
                onChange={e => setForm({ ...form, lessonId: Number(e.target.value) })}
              >
                <option value={0}>Chọn bài học</option>
                {lessons.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dạng câu hỏi
              <select
                value={form.questionType}
                onChange={e =>
                  setForm({ ...form, questionType: e.target.value as TeacherQuestion['questionType'] })
                }
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-span">
              Đề bài
              <textarea
                required
                maxLength={500}
                value={form.prompt}
                onChange={e => setForm({ ...form, prompt: e.target.value })}
                placeholder={
                  form.questionType === 'MCQ'
                    ? 'Nhập câu hỏi'
                    : 'Nêu rõ yêu cầu và ngữ cảnh để chỉ có một đáp án phù hợp'
                }
              />
            </label>
            {form.questionType === 'MCQ' ? (
              <>
                <label>
                  Đáp án đúng
                  <select
                    value={form.correctOption}
                    onChange={e => setForm({ ...form, correctOption: e.target.value })}
                  >
                    {['A', 'B', 'C', 'D'].map(v => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <div />
                {(['optionA', 'optionB', 'optionC', 'optionD'] as const).map((key, i) => (
                  <label key={key}>
                    Phương án {String.fromCharCode(65 + i)}
                    <input
                      required
                      maxLength={255}
                      value={form[key]}
                      onChange={e => setForm({ ...form, [key]: e.target.value })}
                    />
                  </label>
                ))}
              </>
            ) : (
              <label className="full-span">
                Đáp án mẫu để chấm tự động
                <input
                  required
                  maxLength={255}
                  value={form.acceptedAnswer || ''}
                  onChange={e => setForm({ ...form, acceptedAnswer: e.target.value })}
                  placeholder="Máy chủ bỏ qua chữ hoa, khoảng trắng thừa và dấu câu cuối"
                />
              </label>
            )}
            <label className="full-span">
              Giải thích
              <textarea
                required
                value={form.explanation}
                onChange={e => setForm({ ...form, explanation: e.target.value })}
              />
            </label>
            <div className="button-row">
              <button className="button primary" disabled={busy || !form.lessonId}>
                <Plus size={18} />
                {editing ? 'Lưu câu hỏi' : 'Thêm câu hỏi'}
              </button>
              {editing && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setEditing(null)
                    setForm({ ...blank })
                  }}
                >
                  Hủy sửa
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      <section className="card feature-card">
        <div className="panel-heading">
          <div>
            <h2>Danh sách câu hỏi trong kho</h2>
            <p className="muted">
              Lọc dạng câu hỏi, chọn nhanh theo khoảng câu để đưa vào câu hỏi chung hoặc tạo kiểm tra trực tiếp cho lớp.
            </p>
          </div>
          {filteredQuestions.length > 0 && (
            <button
              type="button"
              className="button secondary"
              onClick={toggleSelectAllFiltered}
            >
              {isAllFilteredSelected ? 'Bỏ chọn các câu đang lọc' : `Chọn tất cả (${filteredQuestions.length} câu)`}
            </button>
          )}
        </div>

        {/* Filter Pills for Question Types */}
        <div className="filter-pills" role="tablist" aria-label="Lọc theo dạng câu hỏi">
          <button
            type="button"
            className={`filter-pill ${filterType === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterType('ALL')}
          >
            Tất cả dạng <span className="pill-count">{countByType.ALL}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${filterType === 'MCQ' ? 'active' : ''}`}
            onClick={() => setFilterType('MCQ')}
          >
            Trắc nghiệm (MCQ) <span className="pill-count">{countByType.MCQ}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${filterType === 'FILL_BLANK' ? 'active' : ''}`}
            onClick={() => setFilterType('FILL_BLANK')}
          >
            Điền từ <span className="pill-count">{countByType.FILL_BLANK}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${filterType === 'ERROR_CORRECTION' ? 'active' : ''}`}
            onClick={() => setFilterType('ERROR_CORRECTION')}
          >
            Sửa lỗi <span className="pill-count">{countByType.ERROR_CORRECTION}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${filterType === 'REWRITE' ? 'active' : ''}`}
            onClick={() => setFilterType('REWRITE')}
          >
            Viết lại câu <span className="pill-count">{countByType.REWRITE}</span>
          </button>
        </div>

        {/* Filter inputs bar: Lesson & Search */}
        <div className="bank-filter-bar">
          <div className="bank-filter-group">
            <label>Lọc bài học:</label>
            <select
              value={filterLessonId}
              onChange={e => setFilterLessonId(Number(e.target.value))}
            >
              <option value={0}>Tất cả bài học ({lessons.length} bài)</option>
              {lessons.map(l => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>

          <div className="bank-filter-group">
            <label>Tìm kiếm:</label>
            <input
              type="search"
              placeholder="Tìm theo từ khóa đề bài, đáp án..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
            />
          </div>

          {(filterType !== 'ALL' || filterLessonId !== 0 || filterSearch) && (
            <button
              type="button"
              className="button secondary"
              style={{ padding: '8px 12px', fontSize: '0.84rem' }}
              onClick={() => {
                setFilterType('ALL')
                setFilterLessonId(0)
                setFilterSearch('')
              }}
              title="Khôi phục về tất cả câu hỏi"
            >
              <RotateCcw size={14} style={{ marginRight: 4 }} /> Đặt lại bộ lọc
            </button>
          )}
        </div>

        {/* Range Selector Tool */}
        {filteredQuestions.length > 0 && (
          <div className="range-picker-box">
            <div className="range-picker-left">
              <strong>
                <CheckSquare size={16} /> Chọn khoảng câu:
              </strong>
              <div className="range-inputs">
                <span>Từ câu STT:</span>
                <input
                  type="number"
                  min={1}
                  max={filteredQuestions.length}
                  value={rangeFrom}
                  onChange={e => setRangeFrom(Math.max(1, Number(e.target.value)))}
                />
                <span>đến:</span>
                <input
                  type="number"
                  min={1}
                  max={filteredQuestions.length}
                  value={rangeTo}
                  onChange={e => setRangeTo(Math.max(1, Number(e.target.value)))}
                />
                <button
                  type="button"
                  className="button primary"
                  style={{ padding: '6px 12px', fontSize: '0.84rem' }}
                  onClick={() => handleSelectRange(rangeFrom, rangeTo)}
                >
                  Chọn khoảng này
                </button>
                <button
                  type="button"
                  className="button secondary"
                  style={{ padding: '6px 10px', fontSize: '0.84rem' }}
                  onClick={() => handleDeselectRange(rangeFrom, rangeTo)}
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            <div className="range-presets">
              <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontWeight: 600 }}>Chọn nhanh:</span>
              <button
                type="button"
                className="range-preset-btn"
                onClick={() => applyPresetRange(5)}
                disabled={filteredQuestions.length < 1}
              >
                Top 5
              </button>
              <button
                type="button"
                className="range-preset-btn"
                onClick={() => applyPresetRange(10)}
                disabled={filteredQuestions.length < 1}
              >
                Top 10
              </button>
              <button
                type="button"
                className="range-preset-btn"
                onClick={() => applyPresetRange(15)}
                disabled={filteredQuestions.length < 1}
              >
                Top 15
              </button>
              <button
                type="button"
                className="range-preset-btn"
                onClick={() => applyPresetRange(30)}
                disabled={filteredQuestions.length < 1}
                title="Chọn tối đa 30 câu (vừa đủ 1 đề kiểm tra trực tiếp)"
              >
                Top 30 (1 đề thi)
              </button>
            </div>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="selection-action-bar">
            <div>
              <strong>Đã chọn {selectedIds.size} câu hỏi</strong>
              {selectedIds.size > 30 && (
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  (Lưu ý: Bài kiểm tra trực tiếp tối đa 30 câu hỏi)
                </small>
              )}
            </div>
            <div className="selection-actions">
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={handlePromoteSelected}
                title="Sao chép các câu hỏi trắc nghiệm đã chọn vào ngân hàng câu hỏi chung"
              >
                <Globe size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
                Đưa vào câu hỏi chung ({selectedIds.size})
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() => openLiveExamModal()}
                title="Tạo bài kiểm tra trực tiếp cho lớp học từ các câu hỏi đã chọn"
              >
                <Radio size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
                Tạo kiểm tra trực tiếp cho lớp ({selectedIds.size})
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelectedIds(new Set())}
              >
                Hủy chọn tất cả
              </button>
            </div>
          </div>
        )}

        {questions ? (
          filteredQuestions.length ? (
            filteredQuestions.map((q, idx) => (
              <div className="question-item-row" key={q.id}>
                <input
                  type="checkbox"
                  className="question-checkbox"
                  aria-label={`Chọn câu hỏi STT ${idx + 1}`}
                  checked={selectedIds.has(q.id)}
                  onChange={() => toggleSelect(q.id)}
                />
                <div className="question-item-content">
                  <div>
                    <span className="question-stt-tag">STT #{idx + 1}</span>
                    <strong>
                      ID #{q.id} · {q.prompt}
                    </strong>
                  </div>
                  <div className="question-item-meta" style={{ marginTop: 4 }}>
                    <span className="tag">{labels[q.questionType || 'MCQ']}</span>
                    <span>Bài học #{q.lessonId}</span>
                    <span>·</span>
                    <span>{q.adminBlocked ? 'B\u1ecb admin ch\u1eb7n' : q.active ? 'Đang dùng trong nhiệm vụ' : 'Đã lưu trữ'}</span>
                  </div>
                  {q.questionType === 'MCQ' || !q.questionType ? (
                    <div className="question-options-preview">
                      <div className={`question-option-item ${q.correctOption === 'A' ? 'is-correct' : ''}`}>
                        <strong>A.</strong> {q.optionA}
                      </div>
                      <div className={`question-option-item ${q.correctOption === 'B' ? 'is-correct' : ''}`}>
                        <strong>B.</strong> {q.optionB}
                      </div>
                      <div className={`question-option-item ${q.correctOption === 'C' ? 'is-correct' : ''}`}>
                        <strong>C.</strong> {q.optionC}
                      </div>
                      <div className={`question-option-item ${q.correctOption === 'D' ? 'is-correct' : ''}`}>
                        <strong>D.</strong> {q.optionD}
                      </div>
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: '0.88rem' }}>
                      Đáp án mẫu: <code>{q.acceptedAnswer}</code>
                    </div>
                  )}
                  {q.explanation && (
                    <small style={{ display: 'block', color: 'var(--muted)', marginTop: 4 }}>
                      Giải thích: {q.explanation}
                    </small>
                  )}
                </div>
                <div className="stack-actions">
                  {(!q.questionType || q.questionType === 'MCQ') && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || !q.active || q.adminBlocked}
                      title="Đưa câu hỏi trắc nghiệm này vào ngân hàng câu hỏi chung"
                      onClick={() => handlePromoteSingle(q)}
                    >
                      <Globe size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                      Đưa vào chung
                    </button>
                  )}
                  <button
                    type="button"
                    className="button secondary"
                    title="Tạo bài kiểm tra trực tiếp cho lớp với câu hỏi này"
                    disabled={busy || !q.active || q.adminBlocked}
                    onClick={() => openLiveExamModal([q.id])}
                  >
                    <Radio size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                    Kiểm tra lớp
                  </button>
                  <button type="button" className="button secondary" onClick={() => edit(q)}>
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || q.adminBlocked}
                    onClick={() => active(q)}
                  >
                    {q.adminBlocked ? 'B\u1ecb admin ch\u1eb7n' : q.active ? 'Lưu trữ' : 'Bật lại'}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">
              {questions.length
                ? 'Không tìm thấy câu hỏi nào phù hợp với bộ lọc hiện tại.'
                : 'Bạn chưa soạn câu hỏi nào.'}
            </p>
          )
        ) : (
          <Loading />
        )}
      </section>

      {examModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={e => { if (e.target === e.currentTarget) setExamModalOpen(false) }}>
          <div className="card modal-card" role="dialog" aria-modal="true" aria-label="Tạo kiểm tra trực tiếp cho lớp">
            <div className="panel-heading">
              <h2>
                <Radio size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom' }} />
                Tạo bài kiểm tra trực tiếp cho lớp
              </h2>
              <button
                type="button"
                className="text-button"
                onClick={() => setExamModalOpen(false)}
                aria-label="Đóng modal"
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              Đề thi sẽ được tạo từ <strong>{selectedIds.size} câu hỏi</strong> đã chọn. Khi bắt đầu, học sinh trong lớp sẽ nhận đề và làm bài theo thời gian thực (Realtime WebSocket).
            </p>

            <form className="form-grid" onSubmit={handleCreateLiveExam}>
              <label className="full-span">
                Chọn lớp học nhận bài kiểm tra
                <select
                  required
                  value={examClassId}
                  onChange={e => setExamClassId(Number(e.target.value))}
                >
                  <option value={0}>-- Chọn lớp học --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} · Mã {c.joinCode} ({c.memberCount ?? 0} thành viên)
                    </option>
                  ))}
                </select>
                {classes.length === 0 && (
                  <small style={{ color: 'var(--danger)', marginTop: 4 }}>
                    Bạn chưa có lớp học nào do bạn quản lý. Hãy tạo lớp trước ở trang Quản lý lớp học!
                  </small>
                )}
              </label>

              <label className="full-span">
                Tên bài kiểm tra
                <input
                  required
                  maxLength={160}
                  value={examTitle}
                  onChange={e => setExamTitle(e.target.value)}
                  placeholder="Ví dụ: Kiểm tra 15 phút - Câu điều kiện"
                />
              </label>

              <label className="full-span">
                Hạn làm bài (Hết giờ làm bài)
                <input
                  required
                  type="datetime-local"
                  value={examEndsAt}
                  onChange={e => setExamEndsAt(e.target.value)}
                />
              </label>

              <div className="full-span">
                <span style={{ fontSize: '0.87rem', fontWeight: 700 }}>
                  Danh sách câu hỏi được chọn ({selectedIds.size} câu):
                </span>
                <div className="preview-modal-list">
                  {questions
                    ?.filter(q => selectedIds.has(q.id))
                    .map((q, idx) => (
                      <div key={q.id} className="preview-modal-item">
                        <strong>Câu {idx + 1}:</strong> {q.prompt}
                        <small style={{ display: 'block', color: 'var(--muted)' }}>
                          Đáp án đúng: {q.correctOption} · A: {q.optionA} | B: {q.optionB}
                        </small>
                      </div>
                    ))}
                </div>
                {selectedIds.size > 30 && (
                  <small style={{ color: '#d97706', display: 'block', marginTop: 6 }}>
                    Chú ý: Hệ thống giới hạn tối đa 30 câu hỏi trong một bài kiểm tra trực tiếp. 30 câu hỏi đầu tiên sẽ được đưa vào đề.
                  </small>
                )}
              </div>

              <div className="button-row full-span">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setExamModalOpen(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={busy || !examClassId || selectedIds.size === 0}
                >
                  Tạo bài kiểm tra trực tiếp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
