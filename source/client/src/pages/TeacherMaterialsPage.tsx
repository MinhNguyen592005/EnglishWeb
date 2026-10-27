import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  FileText,
  LoaderCircle,
  PencilLine,
  Plus,
  Search,
  Upload,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TxtQuestionImporter } from '../components/TxtQuestionImporter'
import { Layout } from '../components/Layout'
import { Pagination, PAGE_SIZE } from '../components/Pagination'
import { api } from '../services/api'
import { notifyTeacherMaterialChanged } from '../services/teacherMaterialEvents'
import type { TeacherMaterial, TeacherMaterialDraft, TeacherMaterialSummary } from '../types'
import type { ParsedQuestionDraft } from '../services/questionTxtParser'
import './teacher-materials.css'

export function TeacherMaterialsPage() {
  const [params, setParams] = useSearchParams()
  const [materials, setMaterials] = useState<TeacherMaterialSummary[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [showArchived, setShowArchived] = useState(false)
  const [editor, setEditor] = useState<TeacherMaterial | 'new' | null>(
    params.get('create') ? 'new' : null,
  )
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<TeacherMaterial | null>(null)
  const saving = useRef(false)

  async function reload() {
    setLoading(true)
    setLoadError('')
    try {
      setMaterials(await api.teacherMaterials())
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void reload()
  }, [])
  useEffect(() => {
    if (params.get('create')) {
      setEditor('new')
      setName('')
      setDescription('')
    }
  }, [params])

  function create() {
    setEditor('new')
    setName('')
    setDescription('')
    setError('')
    setNotice('')
  }
  function closeEditor() {
    setEditor(null)
    if (params.has('create')) setParams({}, { replace: true })
  }
  async function edit(id: number) {
    setBusy(true)
    setError('')
    try {
      const material = await api.teacherMaterial(id)
      setEditor(material)
      setName(material.name)
      setDescription(material.description)
      setNotice('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function save(_lessonId: number, drafts: ParsedQuestionDraft[]) {
    if (saving.current) return
    if (!name.trim()) {
      setError('Đặt tên bộ bài trước khi lưu.')
      return
    }
    if (drafts.length > 30) {
      setError('Mỗi bộ bài hỗ trợ tối đa 30 câu. Hãy tách thành các bộ nhỏ để giao.')
      throw new Error('Bộ bài vượt quá 30 câu')
    }
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const data: TeacherMaterialDraft = {
        name: name.trim(),
        description: description.trim(),
        questions: drafts.map((draft) => ({
          prompt: draft.prompt,
          questionType: draft.questionType,
          explanation: draft.explanation,
          optionA: draft.optionA,
          optionB: draft.optionB,
          optionC: draft.optionC,
          optionD: draft.optionD,
          correctOption: draft.correctOption || 'A',
          acceptedAnswer: draft.questionType === 'MCQ' ? null : draft.acceptedAnswer,
        })),
      }
      if (editor && editor !== 'new') await api.updateTeacherMaterial(editor.id, data)
      else await api.createTeacherMaterial(data)
      notifyTeacherMaterialChanged()
      await reload()
      closeEditor()
      setNotice(`Đã lưu “${data.name}”. Bạn có thể giao bộ bài này cho nhiều lớp.`)
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  async function archive(material: TeacherMaterialSummary) {
    setBusy(true)
    setError('')
    try {
      await api.archiveTeacherMaterial(material.id, !material.archived)
      notifyTeacherMaterialChanged()
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function openPreview(id: number) {
    setBusy(true)
    setError('')
    try {
      setPreview(await api.teacherMaterial(id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const active = (materials ?? []).filter((item) => !item.archived)
  const visible = (materials ?? []).filter(
    (item) =>
      (showArchived || !item.archived) &&
      `${item.name} ${item.description}`
        .toLocaleLowerCase('vi-VN')
        .includes(query.toLocaleLowerCase('vi-VN')),
  )
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / PAGE_SIZE)))
  const pageMaterials = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  useEffect(() => {
    setPage(1)
  }, [query, showArchived])
  const initialQuestions: ParsedQuestionDraft[] =
    editor && editor !== 'new'
      ? editor.questions.map((question) => ({
          ...question,
          acceptedAnswer: question.acceptedAnswer ?? '',
          correctOption: question.correctOption as ParsedQuestionDraft['correctOption'],
          autoCompletedFields: [],
          errors: [],
        }))
      : []

  return (
    <Layout title="Kho bộ câu hỏi">
      <div className="tm-page">
        <header className="tm-header">
          <div>
            <span className="tm-eyebrow">KHO HỌC LIỆU CÁ NHÂN</span>
            <h1>Kho bộ câu hỏi</h1>
            <p>Quản lý câu hỏi tại đây. Vào lớp học để giao bài tập hoặc tạo kiểm tra.</p>
          </div>
          {!editor && (
            <button
              className="button primary"
              onClick={create}
              disabled={busy || loading || !materials}
            >
              <Plus size={17} /> Tạo bộ bài mới
            </button>
          )}
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button
              className="text-button"
              onClick={() => {
                setError('')
                void reload().catch((e) => setError(e.message))
              }}
            >
              Tải lại
            </button>
          </div>
        )}
        {notice && (
          <div className="success-banner tm-success" role="status">
            <span>
              <CheckCircle2 size={17} /> {notice}
            </span>
          </div>
        )}

        {editor ? (
          <section className="tm-editor">
            <button className="tm-back" disabled={busy} onClick={closeEditor}>
              <ArrowLeft size={15} /> Quay về kho
            </button>
            <div className="tm-editor-title">
              <span className="tm-icon">
                <FilePlus2 size={24} />
              </span>
              <div>
                <h2>{editor === 'new' ? 'Tạo bộ bài từ file .txt' : 'Chỉnh sửa bộ bài'}</h2>
                <p>Đặt tên, nhập câu hỏi, kiểm tra đáp án và lưu vào kho riêng của bạn.</p>
              </div>
            </div>
            <div className="tm-editor-meta">
              <label>
                Tên bộ bài <span>*</span>
                <input
                  id="teacher-material-name"
                  required
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Ôn tập Unit 1 — Thì hiện tại đơn"
                  disabled={busy}
                />
              </label>
              <label>
                Mô tả <span>(không bắt buộc)</span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mục tiêu, nội dung hoặc lưu ý của bộ bài…"
                  disabled={busy}
                />
              </label>
            </div>
            <div className="tm-import-heading">
              <Upload size={17} />
              <strong>Nội dung câu hỏi</strong>
              <span>1–30 câu / bộ · 4 dạng câu hỏi</span>
            </div>
            <TxtQuestionImporter
              key={editor === 'new' ? 'new' : editor.id}
              lessons={[]}
              materialMode
              initialQuestions={initialQuestions}
              saveDisabled={!name.trim()}
              saveDisabledReason="Chưa có tên bộ bài. Vui lòng nhập tên ở phía trên để lưu."
              onCompleteSaveDetails={() =>
                document.getElementById('teacher-material-name')?.focus()
              }
              busy={busy}
              onSaveBatch={save}
            />
          </section>
        ) : (
          <>
            <div className="tm-summary">
              <span>
                <BookOpen size={17} />
                <strong>{materials ? active.length : '—'}</strong> bộ bài sẵn sàng
              </span>
              <span>
                <FileText size={17} />
                <strong>
                  {materials ? active.reduce((sum, item) => sum + item.questionCount, 0) : '—'}
                </strong>{' '}
                câu hỏi trong kho
              </span>
              <span>
                <UsersRound size={17} /> Dùng lại cho nhiều lớp
              </span>
            </div>
            {materials && loadError && (
              <div className="error-banner" role="alert">
                {loadError}
                <button className="text-button" disabled={loading} onClick={() => void reload()}>
                  Thử lại
                </button>
              </div>
            )}
            <div className="tm-toolbar">
              <div className="tm-search">
                <Search size={17} />
                <input
                  aria-label="Tìm bộ bài"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm tên bộ bài, mô tả…"
                />
              </div>
              <label>
                <input
                  type="checkbox"
                  title="B? ?? l?u tr? ???c ?n khi giao b?i m?i. B?n c? th? xem l?i v? kh?i ph?c."
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />{' '}
                Hiện bộ đã lưu trữ
              </label>
            </div>
            {!materials ? (
              <div className="tm-empty" role={loadError ? 'alert' : 'status'}>
                {loadError ? (
                  <AlertCircle size={32} />
                ) : (
                  <LoaderCircle className="material-spin" size={30} />
                )}
                <h2>{loadError ? 'Chưa tải được kho nội dung' : 'Đang tải kho của bạn…'}</h2>
                {loadError && (
                  <>
                    <p>{loadError}</p>
                    <button
                      className="button primary"
                      disabled={loading}
                      onClick={() => void reload()}
                    >
                      Thử lại
                    </button>
                  </>
                )}
              </div>
            ) : !visible.length ? (
              <div className="tm-empty">
                <span className="tm-empty-icon">
                  <BookOpen size={37} />
                </span>
                <h2>
                  {materials.length
                    ? 'Không có bộ bài phù hợp'
                    : 'Chưa có nội dung để giao bài tập/kiểm tra'}
                </h2>
                <p>
                  {materials.length
                    ? 'Thử đổi từ khóa hoặc hiển thị các bộ đã lưu trữ.'
                    : 'Tải file .txt của bạn lên, đặt tên và lưu bộ câu hỏi. Sau đó chọn lớp để giao bài tập hoặc tạo bài kiểm tra.'}
                </p>
                <button
                  className="button primary"
                  onClick={
                    materials.length
                      ? () => {
                          setQuery('')
                          setShowArchived(true)
                        }
                      : create
                  }
                >
                  {materials.length ? 'Xem tất cả bộ bài' : 'Tạo bộ bài đầu tiên'}
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div className="tm-grid">
                {pageMaterials.map((material) => (
                  <article
                    className={`tm-card ${material.archived ? 'archived' : ''}`}
                    key={material.id}
                  >
                    <span className="tm-icon">
                      <FileText size={21} />
                    </span>
                    <div className="tm-card-content">
                      <div className="tm-card-title">
                        <h2>{material.name}</h2>
                        <span className="tm-state">
                          {material.archived ? 'Đã lưu trữ' : 'Sẵn sàng'}
                        </span>
                      </div>
                      {material.description && (
                        <p title={material.description}>{material.description}</p>
                      )}
                      <div className="tm-card-meta">
                        <span>
                          <ClipboardList size={13} />
                          {material.questionCount} câu hỏi
                        </span>
                        <span>
                          Cập nhật {new Date(material.updatedAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                    <div className="tm-card-tools">
                      <button onClick={() => void openPreview(material.id)} disabled={busy}>
                        <BookOpen size={14} /> Xem câu hỏi
                      </button>
                      <button onClick={() => void edit(material.id)} disabled={busy}>
                        <PencilLine size={14} /> Chỉnh sửa
                      </button>
                      <button
                        onClick={() => void archive(material)}
                        disabled={busy}
                        aria-label={`${material.archived ? 'Khôi phục' : 'Lưu trữ'} ${material.name}`}
                      >
                        <Archive size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {materials && visible.length > 0 && (
              <Pagination total={visible.length} page={currentPage} onPageChange={setPage} />
            )}
          </>
        )}

        {preview && (
          <MaterialDialog title={preview.name} onClose={() => setPreview(null)}>
            <p className="tm-preview-count">
              {preview.questionCount} câu hỏi · {preview.description}
            </p>
            <ol className="tm-preview-list">
              {preview.questions.map((question) => (
                <li key={question.id}>
                  <strong>{question.prompt}</strong>
                  <p>
                    Đáp án:{' '}
                    {question.questionType === 'MCQ'
                      ? `${question.correctOption}. ${question[`option${question.correctOption}` as 'optionA']}`
                      : question.acceptedAnswer}
                  </p>
                  <small>{question.explanation}</small>
                </li>
              ))}
            </ol>
          </MaterialDialog>
        )}
      </div>
    </Layout>
  )
}

function MaterialDialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="tm-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="Đóng cửa sổ" onClick={onClose}>
          <X size={21} />
        </button>
      </header>
      {children}
    </dialog>
  )
}
