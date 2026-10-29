import type {
  AdminContent,
  AdminLesson,
  AdminQuestion,
  AdminUser,
  Attempt,
  Assignment,
  AssignmentResult,
  MyAssignmentResult,
  ClassOverview,
  ClassMessage,
  Classroom,
  CurriculumTopic,
  DailyQuestOverview,
  MilestoneClaimResponse,
  QuestClaimResponse,
  UserStreak,
  Lesson,
  Profile,
  TeacherCurriculum,
  TeacherOverview,
  TeacherQuestion,
  TeacherMaterial,
  TeacherMaterialSummary,
  TeacherMaterialDraft,
  PvpCosmeticsResponse,
  PvpLeaderboardResponse,
} from '../types'

type ApiError = { code?: string; message?: string; fields?: Record<string, string> }
export class ApiRequestError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}
let csrfToken: string | null = null
const id = () => crypto.randomUUID()
const offlineMessage =
  'Không kết nối được máy chủ Grammar Quest. Hãy chạy Spring Boot ở cổng 8080 và kiểm tra MySQL.'

async function fetchFromServer(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init)
  } catch {
    throw new Error(offlineMessage)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method || 'GET'
  if (method !== 'GET' && !csrfToken) await refreshCsrf()
  const response = await fetchFromServer(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': id(),
      ...(csrfToken && method !== 'GET' ? { 'X-XSRF-TOKEN': csrfToken } : {}),
      ...init.headers,
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError
    if (response.status === 401 && path !== '/auth/login')
      window.dispatchEvent(new Event('grammarquest:unauthenticated'))
    throw new ApiRequestError(
      body.message ||
        (response.status >= 500 ? offlineMessage : `Máy chủ trả lỗi ${response.status}`),
      response.status,
      body.code,
    )
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
export async function refreshCsrf() {
  const response = await fetchFromServer('/api/v1/auth/csrf', { credentials: 'include' })
  if (!response.ok)
    throw new Error(
      response.status >= 500
        ? offlineMessage
        : `Máy chủ từ chối thiết lập bảo mật phiên (HTTP ${response.status}).`,
    )
  try {
    csrfToken = ((await response.json()) as { token: string }).token
  } catch {
    throw new Error('Phản hồi bảo mật phiên từ máy chủ không hợp lệ.')
  }
  if (!csrfToken) throw new Error('Máy chủ chưa cấp mã bảo mật phiên.')
}
export const api = {
  teacherMaterials: () =>
    request<TeacherMaterialSummary[]>('/teacher/materials').catch((error) => {
      if (error instanceof ApiRequestError && error.status === 404 && error.code === 'NOT_FOUND') {
        throw new ApiRequestError(
          'Kho học liệu chưa sẵn sàng trên máy chủ. Vui lòng thử lại sau.',
          error.status,
          error.code,
        )
      }
      throw error
    }),
  teacherMaterial: (id: number) => request<TeacherMaterial>(`/teacher/materials/${id}`),
  createTeacherMaterial: (data: TeacherMaterialDraft) =>
    request<TeacherMaterial>('/teacher/materials', { method: 'POST', body: JSON.stringify(data) }),
  updateTeacherMaterial: (id: number, data: TeacherMaterialDraft) =>
    request<TeacherMaterial>(`/teacher/materials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  archiveTeacherMaterial: (id: number, archived: boolean) =>
    request<TeacherMaterial>(`/teacher/materials/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archived }),
    }),
  createMaterialExam: (id: number, data: { classId: number; title: string; endsAt: string }) =>
    request<{ examId: number; classId: number; questionsCount: number }>(
      `/teacher/materials/${id}/live-exams`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  adminBusiness: () =>
    request<{
      days: { date: string; registrations: number; classes: number; matches: number }[]
      finishedMatches: number
    }>('/admin/business'),
  adminDeleteLesson: (id: number) => request(`/admin/lessons/${id}`, { method: 'DELETE' }),
  adminDeleteQuestion: (id: number) => request(`/admin/questions/${id}`, { method: 'DELETE' }),
  me: () => request<Profile>('/auth/me'),
  login: (username: string, password: string) =>
    request<Profile>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, displayName: string, password: string) =>
    request<Profile>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password }),
    }),
  logout: async () => {
    await request<void>('/auth/logout', { method: 'POST' })
    csrfToken = null
  },
  lessons: () => request<Lesson[]>('/lessons'),
  teacherOverview: () => request<TeacherOverview>('/teacher/overview'),
  history: () => request<Attempt[]>('/attempts'),
  teacherQuestions: () => request<TeacherQuestion[]>('/teacher/questions'),
  teacherPromoteQuestionsToCommon: (questionIds: number[]) =>
    request<{ promotedCount: number }>('/teacher/questions/promote-common', {
      method: 'POST',
      body: JSON.stringify({ questionIds }),
    }),
  teacherCreateLiveExamFromQuestions: (data: {
    classId: number
    title: string
    endsAt: string
    questionIds: number[]
  }) =>
    request<{ examId: number; questionsCount: number; classId: number }>(
      '/teacher/questions/to-live-exam',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  classes: () => request<Classroom[]>('/classes'),
  teacherCurriculum: () => request<TeacherCurriculum>('/teacher/curriculum'),
  teacherCreateTopic: (data: Omit<CurriculumTopic, 'published'>) =>
    request<{ slug: string }>('/teacher/curriculum/topics', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  teacherEditTopic: (slug: string, data: Omit<CurriculumTopic, 'published'>) =>
    request<{ slug: string }>(`/teacher/curriculum/topics/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  teacherPublishTopic: (slug: string, published: boolean) =>
    request<{ slug: string }>(`/teacher/curriculum/topics/${slug}/publication`, {
      method: 'PATCH',
      body: JSON.stringify({ published }),
    }),
  teacherCreateLesson: (data: Omit<AdminLesson, 'id' | 'published'>) =>
    request<{ id: number }>('/teacher/curriculum/lessons', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  teacherEditLesson: (id: number, data: Omit<AdminLesson, 'id' | 'published'>) =>
    request<{ id: number }>(`/teacher/curriculum/lessons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  teacherPublishLesson: (id: number, published: boolean) =>
    request<{ id: number }>(`/teacher/curriculum/lessons/${id}/publication`, {
      method: 'PATCH',
      body: JSON.stringify({ published }),
    }),
  teacherCreateCommonQuestion: (data: Omit<AdminQuestion, 'id' | 'published'>) =>
    request<{ id: number }>('/teacher/curriculum/questions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  teacherCreateCommonQuestionsBatch: (data: {
    lessonId: number
    questions: Omit<AdminQuestion, 'id' | 'published' | 'lessonId'>[]
  }) =>
    request<{ createdCount: number }>('/teacher/curriculum/questions/batch', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  teacherEditCommonQuestion: (id: number, data: Omit<AdminQuestion, 'id' | 'published'>) =>
    request<{ id: number }>(`/teacher/curriculum/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  teacherPublishCommonQuestion: (id: number, published: boolean) =>
    request<{ id: number }>(`/teacher/curriculum/questions/${id}/publication`, {
      method: 'PATCH',
      body: JSON.stringify({ published }),
    }),
  teacherCreateQuestion: (data: Omit<TeacherQuestion, 'id' | 'active'>) =>
    request<TeacherQuestion>('/teacher/questions', {
      method: 'POST',
      body: JSON.stringify({ ...data }),
    }),
  teacherCreateQuestionsBatch: (data: {
    lessonId: number
    questions: Omit<TeacherQuestion, 'id' | 'active' | 'lessonId'>[]
  }) =>
    request<{ createdCount: number }>('/teacher/questions/batch', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  teacherEditQuestion: (id: number, data: Omit<TeacherQuestion, 'id' | 'active'>) =>
    request<TeacherQuestion>(`/teacher/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  teacherActivateQuestion: (id: number, active: boolean) =>
    request<TeacherQuestion>(`/teacher/questions/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
  classrooms: () => request<Classroom[]>('/classes'),
  classroom: (id: number) => request<Classroom>(`/classes/${id}`),
  classroomOverview: (id: number) => request<ClassOverview>(`/classes/${id}/overview`),
  createClass: (name: string) =>
    request<Classroom>('/classes', { method: 'POST', body: JSON.stringify({ name }) }),
  joinClass: (code: string) =>
    request<Classroom>('/classes/join', { method: 'POST', body: JSON.stringify({ code }) }),
  renameClass: (id: number, name: string) =>
    request<Classroom>(`/classes/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  removeClassMember: (classId: number, memberId: number) =>
    request<{ removed: boolean }>(`/classes/${classId}/members/${memberId}`, { method: 'DELETE' }),
  createAssignment: (
    classId: number,
    data: {
      title: string
      lessonId?: number
      materialId?: number
      instructions: string
      passPercent: number
      dueAt: string
      questionIds?: number[]
    },
  ) =>
    request<Assignment>(`/classes/${classId}/assignments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAssignment: (
    classId: number,
    assignmentId: number,
    data: {
      title: string
      instructions: string
      passPercent: number
      dueAt: string
      status: string
    },
  ) =>
    request<Assignment>(`/classes/${classId}/assignments/${assignmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  assignmentResults: (classId: number, assignmentId: number) =>
    request<AssignmentResult[]>(`/classes/${classId}/assignments/${assignmentId}/results`),
  myClassResults: (classId: number) =>
    request<MyAssignmentResult[]>(`/classes/${classId}/my-results`),
  startClassAssignment: (classId: number, assignmentId: number) =>
    request<Attempt>(`/classes/${classId}/assignments/${assignmentId}/start`, { method: 'POST' }),
  classMessages: (classId: number) => request<ClassMessage[]>(`/classes/${classId}/messages`),
  sendClassMessage: (classId: number, body: string) =>
    request<ClassMessage>(`/classes/${classId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  reportClassMessage: (classId: number, messageId: number, reason: string) =>
    request<{ id: number }>(`/classes/${classId}/messages/${messageId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  adminUsers: () => request<AdminUser[]>('/admin/users'),
  adminRole: (id: number, role: string) =>
    request<{ id: number; role: string }>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  adminLock: (id: number, locked: boolean) =>
    request<{ id: number; locked: boolean }>(`/admin/users/${id}/lock`, {
      method: 'PATCH',
      body: JSON.stringify({ locked }),
    }),
  adminContent: () => request<AdminContent>('/admin/content'),
  adminPublishLesson: (id: number, published: boolean) =>
    request<{ id: number }>(`/admin/lessons/${id}/publication`, {
      method: 'PATCH',
      body: JSON.stringify({ published }),
    }),
  adminPublishQuestion: (id: number, published: boolean) =>
    request<{ id: number }>(`/admin/questions/${id}/publication`, {
      method: 'PATCH',
      body: JSON.stringify({ published }),
    }),
  adminAudit: () =>
    request<
      {
        id: number
        actor: string
        action: string
        targetType: string
        targetId: number
        detail: string
        createdAt: string
      }[]
    >('/admin/audit'),
  dailyQuests: () => request<DailyQuestOverview>('/daily-quests'),
  replaceDailyQuest: (id: number) =>
    request<DailyQuestOverview>(`/daily-quests/${id}/replace`, { method: 'POST' }),
  claimDailyQuest: (id: number) =>
    request<QuestClaimResponse>(`/daily-quests/${id}/claim`, { method: 'POST' }),
  claimDailyMilestone: () =>
    request<MilestoneClaimResponse>('/daily-quests/claim-milestone', { method: 'POST' }),
  dailyStreak: () => request<UserStreak>('/daily-quests/streak'),
  arenaLeaderboard: () => request<PvpLeaderboardResponse>('/arena/leaderboard'),
  arenaCosmetics: () => request<PvpCosmeticsResponse>('/arena/cosmetics'),
  arenaEquipCosmetic: (code: string) =>
    request<PvpCosmeticsResponse>('/arena/cosmetics/equip', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
}
