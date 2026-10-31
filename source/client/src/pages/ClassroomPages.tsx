import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  Flag,
  Hash,
  Hourglass,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Lock,
  MessageCircle,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  School,
  Search,
  Send,
  ShieldCheck,
  Star,
  Target,
  Trash2,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import { Layout } from '../components/Layout'
import { Pagination, PAGE_SIZE } from '../components/Pagination'
import { Loading } from '../components/States'
import { LiveClassExam } from '../components/LiveClassExam'
import { MaterialDeliveryForm } from '../components/MaterialDeliveryForm'
import { LearnerClasswork } from '../components/LearnerClasswork'
import { StudentClassResultsDialog } from '../components/StudentClassResultsDialog'
import { api } from '../services/api'
import { teacherMaterialChanged } from '../services/teacherMaterialEvents'
import type {
  Assignment,
  AssignmentResult,
  ClassMessage,
  Classroom,
  ClassOverview,
  TeacherMaterialSummary,
} from '../types'
import './classroom.css'
import './classroom-polish.css'
import './classroom-teacher.css'
import './classroom-chat.css'
import { useRealtimeRefresh } from '../services/realtimeRefresh'

type View = 'overview' | 'assignments' | 'members' | 'grades' | 'exams' | 'chat'
type DueTone = 'open' | 'urgent' | 'overdue' | 'closed'
function submittedCount(result: AssignmentResult) {
  return (
    result.completedCount ??
    result.history?.filter((item) => item.completedAt).length ??
    (result.status === 'IN_PROGRESS' ? 0 : 1)
  )
}
const localDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
// Thêm `tone` để tô màu thẻ; `label`/`overdue` giữ nguyên ý nghĩa cũ.
const dueState = (a: Assignment): { label: string; tone: DueTone; overdue: boolean } => {
  if (a.status === 'CLOSED') return { label: 'Đã đóng', tone: 'closed', overdue: false }
  const diff = new Date(a.dueAt).getTime() - Date.now()
  if (diff < 0) return { label: 'Quá hạn', tone: 'overdue', overdue: true }
  const hours = Math.ceil(diff / 3600000)
  return hours <= 24
    ? { label: `Sắp hết hạn · còn ${hours} giờ`, tone: 'urgent', overdue: false }
    : { label: 'Đang mở', tone: 'open', overdue: false }
}
const stateIcons: Record<DueTone, LucideIcon> = {
  overdue: AlertCircle,
  urgent: Hourglass,
  open: CheckCircle2,
  closed: Lock,
}
const TABS: { key: View; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { key: 'assignments', label: 'Bài tập', icon: ClipboardList },
  { key: 'members', label: 'Thành viên', icon: UsersRound },
  { key: 'grades', label: 'Bảng điểm', icon: Star },
  { key: 'exams', label: 'Kiểm tra trực tiếp', icon: Radio },
  { key: 'chat', label: 'Chat lớp', icon: MessageCircle },
]
function StatePill({ state }: { state: { label: string; tone: DueTone } }) {
  const Icon = stateIcons[state.tone]
  return (
    <span className={`class-state-pill state-${state.tone}`}>
      <Icon size={13} /> {state.label}
    </span>
  )
}

export function ClassesPage() {
  const { request, subscribe, connected } = useSystemSocket()
  const { user } = useAuth(),
    navigate = useNavigate(),
    [classes, setClasses] = useState<Classroom[] | null>(null),
    [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const teacher = user?.role === 'TEACHER'
  useRealtimeRefresh(reload)
  useEffect(() => {
    if (!connected) return
    let active = true
    const apply = (data: { classes: Classroom[] }) => {
      if (active) setClasses(data.classes)
    }
    const stop = subscribe((message) => {
      if (message.action === 'CLASS_UPDATE') apply(message.payload as { classes: Classroom[] })
      if (message.action === 'CLASS_ERROR')
        setError((message.payload as { message: string }).message)
    })
    void request<{ classes: Classroom[] }>('CLASS_LIST', 'CLASS_SNAPSHOT')
      .then(apply)
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
      stop()
      void request('CLASS_UNWATCH', 'CLASS_DATA').catch(() => {})
    }
  }, [connected, request, subscribe])
  async function reload() {
    try {
      setError('')
      setClasses(await api.classrooms())
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    void reload()
  }, [])
  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (!name.trim()) return
      const created = await api.createClass(name.trim())
      navigate(`/classes/${created.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const joined = await api.joinClass(code.trim().toUpperCase())
      navigate(`/classes/${joined.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const filtered =
    classes?.filter((item) =>
      `${item.name} ${item.teacherName} ${item.joinCode}`
        .toLocaleLowerCase()
        .includes(filter.toLocaleLowerCase()),
    ) || []
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  useEffect(() => {
    setPage(1)
  }, [filter])
  return (
    <Layout title="Lớp học">
      <div className={`class-page${teacher ? ' teacher-classes' : ''}`}>
        <div className="page-heading">
          <div>
            <h1>{teacher ? 'Lớp học của tôi' : 'Lớp học của bạn'}</h1>
            <p>
              {teacher
                ? 'Chọn lớp để xem thống kê, giao bài và theo dõi học viên.'
                : 'Theo dõi các lớp học và bài tập của bạn.'}
            </p>
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button className="button secondary" onClick={() => void reload()}>
              <RefreshCw size={15} />
              Tải lại
            </button>
          </div>
        )}
        {teacher ? (
          <section className="class-create-banner">
            <div>
              <span className="class-eyebrow">
                <School size={16} /> KHÔNG GIAN GIẢNG DẠY
              </span>
              <h2>Tạo lớp học mới</h2>
              <p>Mã tham gia sẽ được tạo tự động.</p>
            </div>
            <form className="class-create-form" onSubmit={create}>
              <label className="class-create-field" htmlFor="new-class-name">
                <span>
                  Tên lớp học <span className="class-required-note">Bắt buộc</span>
                </span>
                <input
                  id="new-class-name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Tiếng Anh 10A · Năm học 2026"
                  aria-describedby="new-class-help"
                />
                <small id="new-class-help">Đặt tên dễ nhận biết để học viên tìm đúng lớp.</small>
              </label>
              <button className="button primary" disabled={busy || !name.trim()}>
                <Plus size={18} />
                {busy ? 'Đang tạo…' : 'Tạo lớp'}
              </button>
            </form>
          </section>
        ) : (
          <section className="class-join-banner">
            <div className="class-join-copy">
              <div className="class-join-icon">
                <KeyRound size={23} />
              </div>
              <div>
                <h2>Nhập mã mời vào lớp</h2>
                <p>Kết nối vào lớp học bằng mã tham gia.</p>
              </div>
            </div>
            <form className="class-join-form" onSubmit={join}>
              <div className="class-input-icon">
                <Hash size={18} />
                <input
                  required
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Nhập mã lớp"
                />
              </div>
              <button className="button primary" disabled={busy}>
                Gia nhập lớp <ArrowRight size={16} />
              </button>
            </form>
          </section>
        )}
        <section className="class-list-section">
          <div className="class-list-heading">
            <div>
              <h2>
                <BookOpen size={22} /> Danh sách lớp học{' '}
                {classes && <span className="class-list-count">({filtered.length})</span>}
              </h2>
              <p>{teacher ? 'Các lớp bạn đang quản lý.' : 'Các lớp bạn đang tham gia.'}</p>
            </div>
            <div className="class-search">
              <Search size={17} />
              <input
                aria-label="Tìm kiếm lớp học"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Tìm kiếm lớp học..."
              />
            </div>
          </div>
          {!classes ? (
            <Loading />
          ) : visible.length ? (
            <>
              <div className="class-card-grid">
                {visible.map((item) => (
                  <Link to={`/classes/${item.id}`} className="class-card" key={item.id}>
                    <div className="class-card-top">
                      <span className="class-sector">LỚP HỌC</span>
                      <span className="class-status">
                        <span />
                        Đang hoạt động
                      </span>
                    </div>
                    <h3>{item.name}</h3>
                    <p className="class-teacher">
                      <School size={16} /> {teacher ? 'Lớp bạn quản lý' : item.teacherName}
                    </p>
                    <div className="class-card-metrics">
                      <span>
                        <UsersRound size={15} /> {item.memberCount ?? 0} học viên
                      </span>
                      <span>
                        <ClipboardList size={15} /> Mã {item.joinCode}
                      </span>
                    </div>
                    <div className="class-card-footer">
                      <span>
                        {item.memberCount === 0 ? 'Chưa có học viên' : 'Đang theo dõi lớp'}
                      </span>
                      <span className="class-view-link">
                        Mở lớp <ArrowRight size={15} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
              <Pagination total={filtered.length} page={currentPage} onPageChange={setPage} />
            </>
          ) : (
            <div className="card empty-state">
              {filter ? 'Không tìm thấy lớp phù hợp.' : 'Bạn chưa có lớp nào.'}
            </div>
          )}
        </section>
      </div>
    </Layout>
  )
}

export function ClassDetailPage() {
  const { id } = useParams(),
    classId = Number(id),
    { user } = useAuth(),
    { request, subscribe, connected } = useSystemSocket(),
    [params, setParams] = useSearchParams()
  const learnerView = user?.role === 'LEARNER'
  const allowedViews: View[] = learnerView
    ? ['assignments', 'grades', 'exams', 'chat']
    : TABS.map((tab) => tab.key)
  const raw = params.get('view')
  const view: View = allowedViews.includes(raw as View)
    ? (raw as View)
    : learnerView
      ? 'assignments'
      : 'overview'
  const [detail, setDetail] = useState<Classroom | null>(null),
    [overview, setOverview] = useState<ClassOverview | null>(null),
    [materials, setMaterials] = useState<TeacherMaterialSummary[]>([]),
    [messages, setMessages] = useState<ClassMessage[]>([]),
    [resultsByAssignment, setResultsByAssignment] = useState<Record<number, AssignmentResult[]>>({})
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [filter, setFilter] = useState(''),
    [selected, setSelected] = useState(Number(params.get('assignmentId')) || 0),
    [className, setClassName] = useState(''),
    [editing, setEditing] = useState<Assignment | null>(null)
  const isOwner = user?.role === 'TEACHER' && detail?.teacherId === user.id
  const [examRevision, setExamRevision] = useState(0)
  const [examComposer, setExamComposer] = useState(false)
  const [materialsError, setMaterialsError] = useState('')
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  useRealtimeRefresh(reload)
  useEffect(() => {
    if (!connected) return
    let active = true
    void request('CLASS_OPEN', 'CLASS_SNAPSHOT', { classId }).catch((e) => {
      if (active) setError(e.message)
    })
    return () => {
      active = false
      void request('CLASS_UNWATCH', 'CLASS_DATA').catch(() => {})
    }
  }, [connected, classId, request])
  async function reload() {
    try {
      setError('')
      const next = await api.classroom(classId)
      setDetail(next)
      setClassName((current) => (current === detail?.name || !detail ? next.name : current))
      if (user?.role === 'TEACHER' && next.teacherId === user.id)
        setOverview(await api.classroomOverview(classId))
      else setOverview(null)
      if (view === 'chat') setMessages(await api.classMessages(classId))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const materialRequest = useRef(0)
  const loadMaterials = useCallback(async () => {
    const request = ++materialRequest.current
    setLoadingMaterials(true)
    setMaterialsError('')
    try {
      const rows = await api.teacherMaterials()
      if (request === materialRequest.current) setMaterials(rows)
    } catch (e) {
      if (request === materialRequest.current) setMaterialsError((e as Error).message)
    } finally {
      if (request === materialRequest.current) setLoadingMaterials(false)
    }
  }, [user?.id])
  useRealtimeRefresh(loadMaterials, !!isOwner && (view === 'assignments' || view === 'exams'))
  useEffect(() => {
    if (user?.role !== 'TEACHER' || (view !== 'assignments' && view !== 'exams')) return
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadMaterials()
    }
    const storage = (event: StorageEvent) => {
      if (event.key === teacherMaterialChanged) refresh()
    }
    void loadMaterials()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener(teacherMaterialChanged, refresh)
    window.addEventListener('storage', storage)
    return () => {
      materialRequest.current++
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener(teacherMaterialChanged, refresh)
      window.removeEventListener('storage', storage)
    }
  }, [classId, view, user?.role, loadMaterials])
  useEffect(() => {
    void reload()
  }, [classId, view, user?.id, user?.role])
  useEffect(
    () =>
      subscribe((message) => {
        if (message.action === 'CLASS_UPDATE') void reload()
        if (message.action === 'CLASS_ERROR')
          setError((message.payload as { message: string }).message)
      }),
    [classId, view, subscribe],
  )
  useEffect(() => {
    if (!isOwner || view !== 'grades' || !detail?.assignments?.length) return
    let active = true
    Promise.all(
      detail.assignments.map(
        async (assignment) =>
          [assignment.id, await api.assignmentResults(classId, assignment.id)] as const,
      ),
    )
      .then((entries) => {
        if (active) setResultsByAssignment(Object.fromEntries(entries))
      })
      .catch((e) => {
        if (active) setError((e as Error).message)
      })
    return () => {
      active = false
    }
  }, [classId, view, isOwner, detail?.assignments])
  const assignments = detail?.assignments || [],
    attention = useMemo(
      () =>
        assignments
          .filter((a) => a.status !== 'CLOSED')
          .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
          .slice(0, 5),
      [assignments],
    )
  const go = (next: View) => setParams(next === 'overview' ? {} : { view: next })
  async function refresh() {
    setRefreshing(true)
    try {
      await Promise.all([
        reload(),
        ...(user?.role === 'TEACHER' && (view === 'assignments' || view === 'exams')
          ? [loadMaterials()]
          : []),
      ])
    } finally {
      setRefreshing(false)
    }
  }
  async function rename(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.renameClass(classId, className)
      setNotice('Đã đổi tên lớp.')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function copyCode() {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(detail.joinCode)
      setNotice('Đã sao chép mã tham gia.')
    } catch {
      setError('Không thể sao chép mã tham gia.')
    }
  }
  async function remove(memberId: number, name: string) {
    if (!window.confirm(`Xóa ${name} khỏi lớp?`)) return
    setBusy(true)
    try {
      await api.removeClassMember(classId, memberId)
      setNotice('Đã xóa học viên khỏi lớp.')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function updateAssignment(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    try {
      await api.updateAssignment(classId, editing.id, {
        title: editing.title,
        instructions: editing.instructions,
        passPercent: editing.passPercent,
        dueAt: new Date(editing.dueAt).toISOString(),
        status: editing.status,
      })
      setEditing(null)
      setNotice('Đã cập nhật bài tập.')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    try {
      const sent = await api.sendClassMessage(classId, message.trim())
      setMessages((current) => [...current, sent])
      setMessage('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function report(messageId: number) {
    const reason = window.prompt('Lý do báo cáo tin nhắn (tối đa 500 ký tự):')
    if (reason?.trim())
      try {
        await api.reportClassMessage(classId, messageId, reason.trim())
        setNotice('Đã gửi báo cáo cho quản trị viên.')
      } catch (e) {
        setError((e as Error).message)
      }
  }
  function exportResults() {
    const rows = [
      ['Bài tập', 'Học viên', 'Số lượt nộp', 'Điểm cao nhất', 'Kết quả'],
      ...assignments.flatMap((assignment) =>
        (resultsByAssignment[assignment.id] || [])
          .filter((item) => submittedCount(item) > 0)
          .map((item) => [
            assignment.title,
            item.displayName,
            submittedCount(item),
            item.status === 'IN_PROGRESS' ? '—' : `${item.correctCount}/${item.totalQuestions}`,
            item.passed ? 'Đạt' : 'Chưa đạt',
          ]),
      ),
    ]
    const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const blob = new Blob(['\ufeff', rows.map((row) => row.map(csv).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `bang-diem-${detail?.name || classId}.csv`
    link.click()
  }
  if (!detail)
    return (
      <Layout title="Lớp học">
        <div className="class-workspace">
          {error ? (
            <div className="error-banner">
              {error}
              <button className="button secondary" onClick={() => void reload()}>
                Tải lại
              </button>
            </div>
          ) : (
            <Loading />
          )}
        </div>
      </Layout>
    )
  const memberTotal = detail.members?.length || 0
  const tabCount: Partial<Record<View, number>> = {
    assignments: assignments.length,
    members: memberTotal,
  }
  const resultsOf = (id: number) => {
    setSelected(id)
    setParams({ view: 'grades', assignmentId: String(id) })
  }
  return (
    <Layout title={detail.name}>
      <div className={`class-workspace${isOwner ? ' teacher-class-workspace' : ''}`}>
        <div className="class-detail-top-row">
          <Link
            to="/classes"
            className="button secondary class-back-link"
            aria-label="Quay lại lớp học"
            title="Quay lại lớp học"
          >
            <ArrowLeft size={16} />
          </Link>
          {/* Hero: quay lại danh sách, tên lớp, metadata, thao tác, tab */}
          <section className="class-hero with-tabs">
            <div className="class-detail-header">
              <div>
                <div className="class-title-row">
                  <h1>{detail.name}</h1>
                  <span
                    className={`class-live-pill ${connected ? 'online' : 'offline'}`}
                    role="status"
                  >
                    <span className="class-live-dot" />{' '}
                    {connected ? 'Đang cập nhật realtime' : 'Đang offline'}
                  </span>
                </div>
                <div className="class-meta-ribbon">
                  <span>
                    <UserRound size={16} /> Giảng viên: <strong>{detail.teacherName}</strong>
                  </span>
                  <span className="sep">•</span>
                  <span>
                    <UsersRound size={16} /> <strong>{memberTotal} học viên</strong>
                  </span>
                  <span className="sep">•</span>
                  <span className="class-code-chip">
                    <Hash size={16} /> Mã lớp: <code>{detail.joinCode}</code>
                  </span>
                </div>
              </div>
              <div className="class-header-actions">
                <button type="button" className="button secondary" onClick={() => void copyCode()}>
                  <Copy size={16} /> Sao chép mã
                </button>
                {isOwner && (
                  <form onSubmit={rename} className="class-rename-form">
                    <label htmlFor="class-rename">Tên lớp học</label>
                    <input
                      id="class-rename"
                      required
                      aria-label="Tên lớp"
                      value={className}
                      maxLength={120}
                      onChange={(e) => setClassName(e.target.value)}
                    />
                    <button
                      className="button secondary"
                      disabled={busy || !className.trim() || className.trim() === detail.name}
                    >
                      <Pencil size={15} /> Đổi tên
                    </button>
                  </form>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={refreshing}
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> Tải lại dữ liệu
                </button>
              </div>
            </div>
            {(isOwner || learnerView) && (
              <nav className="tab-bar class-tabs" aria-label="Công cụ lớp học">
                {TABS.filter((tab) => !learnerView || allowedViews.includes(tab.key)).map((tab) => {
                  const Icon = tab.icon,
                    count = tabCount[tab.key]
                  return (
                    <button
                      type="button"
                      className={view === tab.key ? 'active' : ''}
                      key={tab.key}
                      onClick={() => go(tab.key)}
                    >
                      <Icon size={18} />
                      <span>
                        {learnerView && tab.key === 'grades' ? 'Kết quả của tôi' : tab.label}
                      </span>
                      {count !== undefined && <span className="class-tab-count">{count}</span>}
                    </button>
                  )
                })}
              </nav>
            )}
          </section>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button className="button secondary" onClick={() => void reload()}>
              <RefreshCw size={15} />
              Tải lại
            </button>
          </div>
        )}
        {notice && (
          <div className="success-banner" role="status">
            {notice}
          </div>
        )}
        {isOwner && view === 'overview' && (
          <Overview overview={overview} attention={attention} go={go} results={resultsOf} />
        )}
        {learnerView && (view === 'assignments' || view === 'grades') && (
          <LearnerClasswork
            classId={classId}
            assignments={assignments}
            showResults={view === 'grades'}
          />
        )}
        {isOwner && view === 'assignments' && (
          <Assignments
            assignments={assignments}
            materials={materials}
            materialsError={materialsError}
            loadingMaterials={loadingMaterials}
            retryMaterials={() => void loadMaterials()}
            classId={classId}
            onAssigned={() => {
              void reload()
            }}
            editing={editing}
            setEditing={setEditing}
            update={updateAssignment}
            isOwner={!!isOwner}
            busy={busy}
            results={resultsOf}
            filter={filter}
            setFilter={setFilter}
          />
        )}
        {isOwner && view === 'members' && (
          <Members detail={detail} isOwner={!!isOwner} userId={user?.id} remove={remove} />
        )}
        {isOwner && view === 'grades' && (
          <Grades
            assignments={assignments}
            resultsByAssignment={resultsByAssignment}
            selected={selected}
            setSelected={resultsOf}
            exportResults={exportResults}
          />
        )}
        {view === 'exams' && (
          <div className="class-tab-content">
            {isOwner && (
              <div className="class-exam-heading">
                <div>
                  <h2>Không gian kiểm tra</h2>
                  <p>Tạo đề từ kho câu hỏi và theo dõi kết quả của lớp.</p>
                </div>
                <button
                  type="button"
                  className="button primary"
                  aria-expanded={examComposer}
                  aria-controls="new-class-exam"
                  onClick={() => setExamComposer((value) => !value)}
                >
                  <Plus size={17} />
                  {examComposer ? 'Đóng tạo kiểm tra' : 'Tạo kiểm tra mới'}
                </button>
              </div>
            )}
            {isOwner && examComposer && (
              <section
                id="new-class-exam"
                className="card feature-card class-panel class-material-composer"
              >
                <MaterialDeliveryForm
                  materials={materials}
                  materialsError={materialsError}
                  loadingMaterials={loadingMaterials}
                  onRetryMaterials={() => void loadMaterials()}
                  fixedClassId={classId}
                  kind="exam"
                  onCreated={() => {
                    setExamRevision((value) => value + 1)
                    void reload()
                  }}
                />
              </section>
            )}
            <LiveClassExam
              key={`${classId}:${examRevision}`}
              classId={classId}
              isOwner={!!isOwner}
              allowCreate={false}
            />
          </div>
        )}
        {view === 'chat' && (
          <Chat
            messages={messages}
            message={message}
            setMessage={setMessage}
            send={send}
            report={report}
            busy={busy}
            userId={user?.id}
          />
        )}
      </div>
    </Layout>
  )
}

function Overview({
  overview,
  attention,
  go,
  results,
}: {
  overview: ClassOverview | null
  attention: Assignment[]
  go: (view: View) => void
  results: (id: number) => void
}) {
  const metric = (
    label: string,
    value: string | number | null,
    target: View,
    hint: string,
    Icon: LucideIcon,
    tone: 'indigo' | 'teal' | 'danger',
    unit?: string,
  ) => (
    <button
      type="button"
      className={`class-overview-metric metric-${tone}`}
      onClick={() => go(target)}
    >
      <span className="metric-top">
        <span className="metric-label">{label}</span>
        <span className="metric-icon">
          <Icon size={20} />
        </span>
      </span>
      <span className="metric-value">
        <strong>{value === null ? '—' : value}</strong>
        {unit && <em>{unit}</em>}
      </span>
      <small>{hint}</small>
    </button>
  )
  return (
    <div className="class-overview">
      <div className="class-overview-metrics">
        {metric(
          'Học viên',
          overview?.totalStudents ?? null,
          'members',
          overview?.totalStudents ? 'Số học viên trong lớp' : 'Chưa có học viên',
          UsersRound,
          'indigo',
        )}
        {metric(
          'Bài tập đang mở',
          overview?.activeAssignments ?? null,
          'assignments',
          overview?.activeAssignments ? 'Đang trong thời hạn làm bài' : 'Chưa có bài đang mở',
          ClipboardList,
          'indigo',
        )}
      </div>
      <section className="card feature-card class-panel">
        <div className="class-panel-head">
          <div className="class-panel-title">
            <span className="class-panel-icon">
              <ListChecks size={18} />
            </span>
            <div>
              <span className="section-label">ƯU TIÊN</span>
              <h2>Cần xử lý</h2>
            </div>
          </div>
          <button className="text-link" onClick={() => go('assignments')}>
            Xem tất cả <ArrowRight size={15} />
          </button>
        </div>
        {attention.length ? (
          <div className="class-priority-list">
            {attention.map((item) => {
              const state = dueState(item)
              return (
                <article className={`class-priority-item tone-${state.tone}`} key={item.id}>
                  <div className="class-priority-body">
                    <div className="class-priority-tags">
                      <StatePill state={state} />
                      <code>#{item.id}</code>
                    </div>
                    <h3>{item.title}</h3>
                    <p className="class-priority-meta">
                      <span>
                        <CalendarDays size={15} /> Hạn{' '}
                        {new Date(item.dueAt).toLocaleString('vi-VN')}
                      </span>
                      <span>
                        <Target size={15} /> Cần {item.passPercent}%
                      </span>
                    </p>
                  </div>
                  <button className="button secondary" onClick={() => results(item.id)}>
                    <Eye size={15} /> Xem kết quả
                  </button>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="class-empty-state">
            <CheckCircle2 size={22} />
            <p>Hiện không có việc nào cần xử lý.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function Assignments({
  assignments,
  materials,
  materialsError,
  loadingMaterials,
  retryMaterials,
  classId,
  onAssigned,
  editing,
  setEditing,
  update,
  isOwner,
  busy,
  results,
  filter,
  setFilter,
}: {
  assignments: Assignment[]
  materials: TeacherMaterialSummary[]
  materialsError: string
  loadingMaterials: boolean
  retryMaterials: () => void
  classId: number
  onAssigned: () => void
  editing: Assignment | null
  setEditing: (value: Assignment | null) => void
  update: (event: FormEvent) => void
  isOwner: boolean
  busy: boolean
  results: (id: number) => void
  filter: string
  setFilter: (value: string) => void
}) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [assignmentPage, setAssignmentPage] = useState(1)
  useEffect(() => setAssignmentPage(1), [filter])
  const composer = useRef<HTMLElement>(null)
  useEffect(() => {
    if (composerOpen) {
      composer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      composer.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    }
  }, [composerOpen])
  const filtered = assignments.filter((item) =>
    item.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  )
  const currentAssignmentPage = Math.min(
    assignmentPage,
    Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  )
  return (
    <div className="class-tab-content">
      <section className="card feature-card class-panel">
        <div className="class-panel-head">
          <div>
            <h2>
              <ClipboardList size={24} /> Danh sách bài tập
            </h2>
            <p className="muted">{assignments.length} bài tập trong lớp</p>
          </div>
          {isOwner && (
            <button
              type="button"
              className="button primary"
              aria-expanded={composerOpen}
              aria-controls="new-assignment"
              onClick={() => setComposerOpen((value) => !value)}
            >
              <Plus size={18} /> {composerOpen ? 'Đóng giao bài' : 'Giao bài tập mới'}
            </button>
          )}
        </div>
        <div className="class-tab-toolbar">
          <input
            className="search-input"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Tìm bài tập..."
          />
        </div>
        {filtered.length ? (
          <div className="class-assignment-grid">
            {filtered
              .slice((currentAssignmentPage - 1) * PAGE_SIZE, currentAssignmentPage * PAGE_SIZE)
              .map((item) => {
                const state = dueState(item)
                return (
                  <article className={`class-assignment-card tone-${state.tone}`} key={item.id}>
                    <div className="class-assignment-top">
                      <StatePill state={state} />
                      <code>#{item.id}</code>
                    </div>
                    <h3>{item.title}</h3>
                    {item.instructions && (
                      <p className="class-assignment-desc">{item.instructions}</p>
                    )}
                    <div className="class-assignment-meta">
                      <span>
                        <CalendarDays size={15} /> Hạn{' '}
                        {new Date(item.dueAt).toLocaleString('vi-VN')}
                      </span>
                      <span>
                        <Target size={15} /> Cần {item.passPercent}%
                      </span>
                    </div>
                    {isOwner && (
                      <div className="class-assignment-actions">
                        <button
                          className="button secondary"
                          onClick={() => setEditing({ ...item, dueAt: localDate(item.dueAt) })}
                        >
                          <Pencil size={15} /> Sửa
                        </button>
                        <button className="button secondary" onClick={() => results(item.id)}>
                          <Eye size={15} /> Xem kết quả
                        </button>
                      </div>
                    )}
                  </article>
                )
              })}
          </div>
        ) : (
          <p className="muted">Chưa có bài tập phù hợp.</p>
        )}
        {filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={currentAssignmentPage}
            onPageChange={setAssignmentPage}
          />
        )}
      </section>
      {isOwner && composerOpen && (
        <section
          ref={composer}
          className="card feature-card class-panel class-material-composer"
          id="new-assignment"
        >
          <MaterialDeliveryForm
            materials={materials}
            materialsError={materialsError}
            loadingMaterials={loadingMaterials}
            onRetryMaterials={retryMaterials}
            fixedClassId={classId}
            onCreated={onAssigned}
          />
        </section>
      )}
      {editing && (
        <div className="modal-backdrop">
          <section className="card modal-card" role="dialog" aria-modal="true">
            <h2>Sửa bài tập</h2>
            <form className="form-grid" onSubmit={update}>
              <label className="full-span">
                Tên bài tập
                <input
                  required
                  value={editing.title}
                  onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                />
              </label>
              <label>
                Hạn nộp
                <input
                  required
                  type="datetime-local"
                  value={localDate(editing.dueAt)}
                  onChange={(event) => setEditing({ ...editing, dueAt: event.target.value })}
                />
              </label>
              <label>
                Ngưỡng đạt (%)
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editing.passPercent}
                  onChange={(event) =>
                    setEditing({ ...editing, passPercent: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Trạng thái
                <select
                  value={editing.status}
                  onChange={(event) => setEditing({ ...editing, status: event.target.value })}
                >
                  <option value="PUBLISHED">Đang mở</option>
                  <option value="CLOSED">Đã đóng</option>
                </select>
              </label>
              <label className="full-span">
                Hướng dẫn
                <textarea
                  value={editing.instructions}
                  onChange={(event) => setEditing({ ...editing, instructions: event.target.value })}
                />
              </label>
              <div className="button-row">
                <button type="button" className="button secondary" onClick={() => setEditing(null)}>
                  Hủy
                </button>
                <button className="button primary" disabled={busy}>
                  Lưu
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function Members({
  detail,
  userId,
  isOwner,
  remove,
}: {
  detail: Classroom
  userId?: number
  isOwner: boolean
  remove: (id: number, name: string) => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedStudent, setSelectedStudent] = useState<
    NonNullable<Classroom['members']>[number] | null
  >(null)
  const members = detail.members || []
  const filtered = members.filter((member) =>
    `${member.displayName} ${member.username}`
      .toLocaleLowerCase('vi-VN')
      .includes(query.toLocaleLowerCase('vi-VN')),
  )
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)))
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  useEffect(() => setPage(1), [query])
  return (
    <section className="card feature-card class-panel class-members-panel">
      <div className="class-panel-head">
        <div>
          <h2>
            <UsersRound size={24} /> Danh sách thành viên
          </h2>
          <p className="muted">Quản lý học viên và tài khoản tham gia lớp.</p>
        </div>
        <span className="class-member-total">
          <UsersRound size={16} />
          {members.length} học viên
        </span>
      </div>
      <div className="class-teacher-strip">
        <span className="avatar">{detail.teacherName.slice(0, 1).toUpperCase()}</span>
        <div>
          <small>GIÁO VIÊN PHỤ TRÁCH</small>
          <strong>{detail.teacherName}</strong>
        </div>
        <ShieldCheck size={21} />
      </div>
      <div className="class-members-toolbar">
        <h3>
          Học viên <span>{filtered.length}</span>
        </h3>
        <label className="class-member-search">
          <Search size={17} />
          <input
            aria-label="Tìm thành viên"
            placeholder="Tìm tên hoặc tài khoản…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="class-table-wrap">
        <table className="class-table">
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Tài khoản</th>
              <th>Vai trò</th>
              {isOwner && <th className="right">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => (
              <tr
                key={member.id}
                className={isOwner ? 'class-student-row' : undefined}
                tabIndex={isOwner ? 0 : undefined}
                aria-label={isOwner ? `Xem kết quả của ${member.displayName}` : undefined}
                onClick={isOwner ? () => setSelectedStudent(member) : undefined}
                onKeyDown={
                  isOwner
                    ? (event) => {
                        if (
                          event.target === event.currentTarget &&
                          (event.key === 'Enter' || event.key === ' ')
                        ) {
                          event.preventDefault()
                          setSelectedStudent(member)
                        }
                      }
                    : undefined
                }
              >
                <td>
                  <span className="class-member-cell">
                    <span className="avatar">{member.displayName.slice(0, 1).toUpperCase()}</span>
                    <strong>
                      {member.displayName}
                      {member.id === userId && <small className="class-self-label">Bạn</small>}
                    </strong>
                  </span>
                </td>
                <td className="mono">{member.username}</td>
                <td>
                  <span className="class-role-chip">Học viên</span>
                </td>
                {isOwner && (
                  <td className="right">
                    {member.id !== userId && (
                      <button
                        type="button"
                        className="class-remove-student"
                        aria-label={`Xóa ${member.displayName} khỏi lớp`}
                        title="Xóa khỏi lớp"
                        onClick={(event) => {
                          event.stopPropagation()
                          remove(member.id, member.displayName)
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="class-members-empty">
          <UsersRound size={32} />
          <h3>{query ? 'Không tìm thấy học viên' : 'Chưa có học viên tham gia'}</h3>
          <p>
            {query
              ? 'Thử tìm bằng tên hoặc tài khoản khác.'
              : 'Chia sẻ mã lớp ở đầu trang để học viên tham gia lớp của bạn.'}
          </p>
        </div>
      )}
      <Pagination total={filtered.length} page={current} onPageChange={setPage} />
      {isOwner && selectedStudent && (
        <StudentClassResultsDialog
          classroom={detail}
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </section>
  )
}

function Grades({
  assignments,
  resultsByAssignment,
  selected,
  setSelected,
  exportResults,
}: {
  assignments: Assignment[]
  resultsByAssignment: Record<number, AssignmentResult[]>
  selected: number
  setSelected: (id: number) => void
  exportResults: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'graded'>('all')
  const [resultPage, setResultPage] = useState(1)
  useEffect(() => setResultPage(1), [selected, statusFilter])
  const assignmentStatus = (assignment: Assignment) => {
    const results = resultsByAssignment[assignment.id] || []
    return results.some((item) => submittedCount(item) > 0) ? 'graded' : 'pending'
  }
  const pendingAssignments = assignments.filter((item) => assignmentStatus(item) === 'pending')
  const gradedAssignments = assignments.filter((item) => assignmentStatus(item) === 'graded')
  const visibleAssignments =
    statusFilter === 'pending'
      ? pendingAssignments
      : statusFilter === 'graded'
        ? gradedAssignments
        : assignments
  const activeAssignment = visibleAssignments.find((item) => item.id === selected)
  const selectedResults = (
    activeAssignment ? resultsByAssignment[activeAssignment.id] || [] : []
  ).filter((item) => submittedCount(item) > 0)
  const currentResultPage = Math.min(
    resultPage,
    Math.max(1, Math.ceil(selectedResults.length / PAGE_SIZE)),
  )
  const completed = selectedResults.filter((item) => item.status !== 'IN_PROGRESS'),
    average = completed.length
      ? completed.reduce(
          (sum, item) =>
            sum + (item.totalQuestions ? (item.correctCount / item.totalQuestions) * 100 : 0),
          0,
        ) / completed.length
      : null
  return (
    <section className="card feature-card class-panel">
      <div className="class-panel-head">
        <div>
          <h2>
            <Star size={24} /> Bảng điểm
          </h2>
          <p className="muted">Theo dõi kết quả từng học viên theo bài tập.</p>
        </div>
        <button
          className="button secondary"
          disabled={!Object.keys(resultsByAssignment).length}
          onClick={exportResults}
        >
          Xuất CSV
        </button>
      </div>
      <div className="grades-status-tabs" role="tablist" aria-label="Lọc bài tập theo trạng thái">
        {(
          [
            ['all', 'Tất cả', assignments.length],
            ['graded', 'Đã có điểm', gradedAssignments.length],
            ['pending', 'Chưa có bài nộp', pendingAssignments.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === key}
            className={statusFilter === key ? 'active' : ''}
            onClick={() => setStatusFilter(key)}
            key={key}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>
      <div className="grades-assignment-picker">
        <label htmlFor="grade-assignment">Chọn bài tập</label>
        <select
          id="grade-assignment"
          value={activeAssignment?.id ?? 0}
          disabled={visibleAssignments.length === 0}
          onChange={(event) => setSelected(Number(event.target.value))}
        >
          <option value={0} disabled>
            {visibleAssignments.length
              ? 'Chọn bài tập để xem điểm'
              : 'Không có bài tập thuộc trạng thái này'}
          </option>
          {visibleAssignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {assignment.title}
            </option>
          ))}
        </select>
      </div>
      {activeAssignment ? (
        <>
          <div className="class-grade-detail-heading">
            <div>
              <h3>{activeAssignment.title}</h3>
              <p className="muted">Điểm cao nhất nộp đúng hạn của mỗi học viên.</p>
            </div>
          </div>
          <div className="class-grade-summary">
            <div className="grade-avg">
              <span>Điểm trung bình</span>
              <strong>{average === null ? '—' : `${average.toFixed(1)}%`}</strong>
            </div>
            <span className="grade-stat">{selectedResults.length} học viên</span>
          </div>
          <div className="class-table-wrap table-wrap">
            <table className="class-table">
              <thead>
                <tr>
                  <th>Học viên</th>
                  <th>Số lượt nộp</th>
                  <th>Điểm cao nhất</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {selectedResults
                  .slice((currentResultPage - 1) * PAGE_SIZE, currentResultPage * PAGE_SIZE)
                  .map((item) => (
                    <tr key={item.userId}>
                      <td>
                        <strong>{item.displayName}</strong>
                      </td>
                      <td>{submittedCount(item)} lượt</td>
                      <td className="mono">
                        {item.status === 'IN_PROGRESS'
                          ? '—'
                          : item.totalQuestions
                            ? `${item.correctCount}/${item.totalQuestions}`
                            : '—'}
                      </td>
                      <td>
                        <span className={`class-pass-chip ${item.passed ? 'yes' : 'no'}`}>
                          {item.passed ? 'Đạt' : 'Chưa đạt'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {selectedResults.length > 0 && (
            <Pagination
              total={selectedResults.length}
              page={currentResultPage}
              onPageChange={setResultPage}
            />
          )}
          {!selectedResults.length && (
            <div className="class-empty-state">
              <CheckCircle2 size={22} />
              <p>Bài tập này chưa có bài nộp.</p>
            </div>
          )}
        </>
      ) : (
        <p className="muted">Chọn một bài tập bên trên để xem bảng điểm học viên.</p>
      )}
    </section>
  )
}

function Chat({
  messages,
  message,
  setMessage,
  send,
  report,
  busy,
  userId,
}: {
  messages: ClassMessage[]
  message: string
  setMessage: (value: string) => void
  send: (event: FormEvent) => void
  report: (id: number) => void
  busy: boolean
  userId?: number
}) {
  const { connected } = useSystemSocket()
  const list = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const lastMessage = messages[messages.length - 1]
  useEffect(() => {
    const element = list.current
    if (element && (followLatest.current || lastMessage?.userId === userId)) {
      element.scrollTop = element.scrollHeight
    }
  }, [lastMessage?.id, userId])
  return (
    <section className="card feature-card chat-panel class-panel class-chat">
      <div className="class-panel-head">
        <div className="class-chat-identity">
          <span className="class-chat-group-avatar">
            <UsersRound size={24} />
          </span>
          <div>
            <h2>Trò chuyện lớp học</h2>
            <p className="muted">
              <span className={`class-chat-connection ${connected ? 'online' : ''}`} />
              {connected ? 'Đã kết nối · Trao đổi cùng cả lớp' : 'Đang kết nối lại…'}
            </p>
          </div>
        </div>
        <span className="class-chat-counter">
          <MessageCircle size={15} />
          {messages.length} tin nhắn
        </span>
      </div>
      <div
        ref={list}
        className="chat-list"
        role="log"
        aria-label="Tin nhắn trong lớp"
        aria-relevant="additions"
        aria-live="polite"
        onScroll={() => {
          const element = list.current
          if (element)
            followLatest.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 80
        }}
      >
        {messages.length ? (
          messages.map((item, index) => (
            <div className="class-chat-message-group" key={item.id}>
              {(index === 0 ||
                new Date(messages[index - 1].createdAt).toDateString() !==
                  new Date(item.createdAt).toDateString()) && (
                <div className="class-chat-day">
                  <span>
                    {new Date(item.createdAt).toLocaleDateString('vi-VN', {
                      weekday: 'long',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}
              <div className={`chat-message ${item.userId === userId ? 'mine' : ''}`} key={item.id}>
                {item.userId !== userId && (
                  <span className="avatar" title={item.displayName}>
                    {item.displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="class-chat-message-content">
                  {item.userId !== userId && (
                    <span className="class-chat-sender">{item.displayName}</span>
                  )}
                  <div className="chat-bubble">
                    <p>{item.body}</p>
                  </div>
                  <div className="class-chat-message-meta">
                    <time
                      dateTime={item.createdAt}
                      title={new Date(item.createdAt).toLocaleString('vi-VN')}
                    >
                      {new Date(item.createdAt).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    {item.userId !== userId && (
                      <button
                        type="button"
                        className="class-chat-report"
                        onClick={() => report(item.id)}
                        aria-label={`Báo cáo tin nhắn của ${item.displayName}`}
                        title="Báo cáo tin nhắn"
                      >
                        <Flag size={12} />
                      </button>
                    )}
                    {item.userId === userId && <CheckCircle2 size={12} aria-label="Đã gửi" />}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="class-chat-empty">
            <MessageCircle size={36} />
            <strong>Bắt đầu cuộc trò chuyện</strong>
            <p>Đặt câu hỏi, chia sẻ kiến thức hoặc gửi lời chào tới lớp.</p>
          </div>
        )}
      </div>
      <form className="inline-form" onSubmit={send}>
        <span className="class-chat-compose-icon" aria-hidden="true">
          <MessageCircle size={22} />
        </span>
        <input
          aria-label="Tin nhắn lớp"
          required
          maxLength={1000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Aa · Nhắn tin cho lớp…"
        />
        <button
          className="button primary"
          disabled={busy || !message.trim()}
          aria-label={busy ? 'Đang gửi tin nhắn' : 'Gửi tin nhắn'}
          title="Gửi tin nhắn"
        >
          <Send size={21} />
        </button>
      </form>
    </section>
  )
}
