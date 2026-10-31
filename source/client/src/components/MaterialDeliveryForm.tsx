import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Radio,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import type { Classroom, TeacherMaterial, TeacherMaterialSummary } from '../types'
import './MaterialDeliveryForm.css'

type Props = {
  materials: TeacherMaterialSummary[]
  initialMaterialId?: number
  fixedClassId?: number
  classes?: Classroom[]
  kind?: 'assignment' | 'exam'
  onBusyChange?: (busy: boolean) => void
  loadingMaterials?: boolean
  materialsError?: string
  onRetryMaterials?: () => void
  onCreated: (classId: number, kind: 'assignment' | 'exam') => void
}

export function MaterialDeliveryForm({
  materials,
  initialMaterialId = 0,
  fixedClassId,
  classes = [],
  kind = 'assignment',
  onCreated,
  onBusyChange,
  loadingMaterials = false,
  materialsError = '',
  onRetryMaterials,
}: Props) {
  const [materialId, setMaterialId] = useState(initialMaterialId)
  const [query, setQuery] = useState('')
  const pickerId = useId()
  const [material, setMaterial] = useState<TeacherMaterial | null>(null)
  const [classId, setClassId] = useState(fixedClassId ?? classes[0]?.id ?? 0)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [deadline, setDeadline] = useState('')
  const [passPercent, setPassPercent] = useState(80)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)
  const titleEdited = useRef(false)
  const [sourceChanged, setSourceChanged] = useState(false)
  const assignment = kind === 'assignment'
  const targetClassId = fixedClassId ?? classId
  const options = materials.filter((item) => !item.archived)
  const selectedSummary = options.find((item) => item.id === materialId)
  const materialRevision = selectedSummary
    ? `${selectedSummary.updatedAt}:${selectedSummary.questionCount}`
    : ''
  const visibleOptions = options.filter((item) =>
    `${item.name} ${item.description}`
      .toLocaleLowerCase('vi-VN')
      .includes(query.toLocaleLowerCase('vi-VN')),
  )

  useEffect(() => {
    let active = true
    setMaterial(null)
    if (!materialId || !materialRevision) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    api
      .teacherMaterial(materialId)
      .then((result) => {
        if (active) {
          setMaterial(result)
          if (!titleEdited.current) setTitle(result.name)
          else setSourceChanged(true)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [materialId, materialRevision])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const end = new Date(deadline)
    if (!material || material.archived || !targetClassId || !title.trim()) {
      setError('Chọn bộ bài, lớp nhận và nhập tên bài giao.')
      return
    }
    if (!material.questions.length || material.questions.length > 30) {
      setError('Bộ bài cần từ 1 đến 30 câu hỏi.')
      return
    }
    if (!Number.isFinite(end.getTime()) || end.getTime() <= Date.now()) {
      setError('Hạn làm bài phải ở tương lai.')
      return
    }
    submitting.current = true
    setBusy(true)
    onBusyChange?.(true)
    setError('')
    setSuccess('')
    try {
      if (assignment)
        await api.createAssignment(targetClassId, {
          materialId,
          title: title.trim(),
          instructions: instructions.trim(),
          passPercent,
          dueAt: end.toISOString(),
        })
      else
        await api.createMaterialExam(materialId, {
          classId: targetClassId,
          title: title.trim(),
          endsAt: end.toISOString(),
        })
      onCreated(targetClassId, kind)
      setSuccess(
        assignment
          ? 'Đã giao bài tập cho lớp thành công.'
          : 'Đã tạo bài kiểm tra cho lớp thành công.',
      )
      setMaterialId(0)
      setSourceChanged(false)
      setMaterial(null)
      setTitle('')
      setInstructions('')
      setDeadline('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      submitting.current = false
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  return (
    <form className="material-delivery-form" onSubmit={submit}>
      {sourceChanged && (
        <div className="notice" role="status">
          Học liệu nguồn đã cập nhật. Tên bài đang soạn được giữ nguyên.
        </div>
      )}
      {success && (
        <div className="success-banner" role="status">
          {success}
        </div>
      )}
      <div className="material-delivery-intro">
        <span>{assignment ? <ClipboardList size={22} /> : <Radio size={22} />}</span>
        <div>
          <h3>{assignment ? 'Giao bài từ kho của bạn' : 'Tạo kiểm tra từ bộ bài'}</h3>
          <p>Chọn bộ đã lưu, thiết lập hạn làm và gửi đến lớp.</p>
        </div>
      </div>
      {loadingMaterials ? (
        <div className="material-delivery-empty" role="status">
          <LoaderCircle size={25} className="material-spin" />
          <strong>Đang tải nội dung từ kho của bạn…</strong>
        </div>
      ) : materialsError ? (
        <div className="material-delivery-empty" role="alert">
          <BookOpen size={26} />
          <strong>Chưa tải được nội dung để giao bài</strong>
          <p>{materialsError}</p>
          <button type="button" className="button secondary" onClick={onRetryMaterials}>
            Thử tải lại kho
          </button>
        </div>
      ) : !options.length ? (
        <div className="material-delivery-empty">
          <BookOpen size={26} />
          <strong>Chưa có nội dung để giao bài tập/kiểm tra</strong>
          <p>Nhập file .txt, đặt tên và lưu bộ câu hỏi trước khi giao.</p>
          <Link to="/teacher/questions?create=1">
            Tạo bộ bài đầu tiên <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <>
          <fieldset className="md-material-picker" disabled={busy}>
            <legend>
              Chọn bộ câu hỏi từ kho <span>{options.length} bộ sẵn sàng</span>
            </legend>
            <div className="md-picker-toolbar">
              <div>
                <Search size={15} />
                <input
                  aria-label="Tìm bộ câu hỏi để giao"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm tên bộ câu hỏi…"
                />
              </div>
              {onRetryMaterials && (
                <button
                  type="button"
                  aria-label="Làm mới danh sách bộ câu hỏi"
                  onClick={onRetryMaterials}
                >
                  <RefreshCw size={15} />
                  <span>Làm mới kho</span>
                </button>
              )}
            </div>
            <div className="md-material-options">
              {visibleOptions.map((item) => (
                <label
                  className={`md-material-option ${materialId === item.id ? 'is-selected' : ''}`}
                  key={item.id}
                >
                  <input
                    type="radio"
                    name={pickerId}
                    value={item.id}
                    checked={materialId === item.id}
                    onChange={() => {
                      titleEdited.current = false
                      setSourceChanged(false)
                      setMaterialId(item.id)
                      setTitle('')
                      setError('')
                      setSuccess('')
                    }}
                  />
                  <BookOpen size={19} />
                  <span>
                    <strong>{item.name}</strong>
                    {item.description && <small>{item.description}</small>}
                  </span>
                  <span className="md-question-count">{item.questionCount} câu</span>
                  {materialId === item.id && <CheckCircle2 size={17} />}
                </label>
              ))}
              {!visibleOptions.length && (
                <p className="material-delivery-note">
                  Không tìm thấy bộ câu hỏi phù hợp với từ khóa.
                </p>
              )}
            </div>
          </fieldset>
          {!materialId && (
            <p className="md-select-hint">
              Chọn một bộ câu hỏi ở trên để thiết lập bài giao cho lớp.
            </p>
          )}
          {materialId > 0 && (
            <>
              <div className="material-delivery-fields">
                {!fixedClassId && (
                  <label className="md-full">
                    Lớp nhận bài
                    <select
                      required
                      value={classId || ''}
                      onChange={(e) => setClassId(Number(e.target.value))}
                      disabled={busy}
                    >
                      <option value="">Chọn lớp học</option>
                      {classes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {!classes.length && (
                      <small>
                        Chưa có lớp học. <Link to="/classes">Tạo lớp</Link> để giao bài.
                      </small>
                    )}
                  </label>
                )}
                <label className="md-full">
                  {assignment ? 'Tên bài tập hiển thị trong lớp' : 'Tên bài kiểm tra'}
                  <input
                    required
                    maxLength={160}
                    value={title}
                    onChange={(e) => {
                      titleEdited.current = true
                      setTitle(e.target.value)
                    }}
                    placeholder="Tên bài được điền từ bộ bạn chọn"
                    disabled={busy}
                  />
                </label>
                <label>
                  Hạn {assignment ? 'nộp' : 'làm'} bài
                  <input
                    required
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    disabled={busy}
                  />
                </label>
                {assignment && (
                  <label>
                    Tỷ lệ đạt (%)
                    <input
                      type="number"
                      required
                      min={1}
                      max={100}
                      value={passPercent}
                      onChange={(e) => setPassPercent(Number(e.target.value))}
                      disabled={busy}
                    />
                  </label>
                )}
                {assignment && (
                  <label className="md-full">
                    Hướng dẫn <span>(không bắt buộc)</span>
                    <textarea
                      maxLength={1000}
                      rows={3}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Lưu ý hoặc yêu cầu dành cho học sinh…"
                      disabled={busy}
                    />
                  </label>
                )}
              </div>
              {loading && (
                <p className="material-delivery-note" role="status">
                  <LoaderCircle size={15} className="material-spin" /> Đang tải bộ câu hỏi…
                </p>
              )}
              {material && (
                <details className="material-delivery-preview">
                  <summary>
                    <BookOpen size={15} /> Xem {material.questionCount} câu trong bộ bài
                  </summary>
                  <ol>
                    {material.questions.map((question) => (
                      <li key={question.id}>{question.prompt}</li>
                    ))}
                  </ol>
                </details>
              )}
              <p className="material-delivery-note">
                <Check size={15} />
                {assignment
                  ? 'Giữ nguyên nội dung lúc giao. Mỗi lượt làm có 15 phút và phải nộp trước hạn.'
                  : 'Bài kiểm tra mở ngay sau khi tạo, kết thúc theo hạn bạn thiết lập.'}
              </p>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              <div className="material-delivery-footer">
                <span>
                  <BookOpen size={14} /> Bộ gốc có thể dùng lại cho nhiều lớp
                </span>
                <button
                  className="button primary"
                  disabled={busy || loading || !material || !targetClassId || material.archived}
                >
                  {busy ? (
                    <LoaderCircle size={16} className="material-spin" />
                  ) : assignment ? (
                    <ClipboardList size={16} />
                  ) : (
                    <Radio size={16} />
                  )}{' '}
                  {busy ? 'Đang gửi…' : assignment ? 'Giao bài cho lớp' : 'Tạo bài kiểm tra'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </form>
  )
}
