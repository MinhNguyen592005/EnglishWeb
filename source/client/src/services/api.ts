import type { AdminContent, AdminLesson, AdminQuestion, AdminUser, Attempt, Classroom, CurriculumTopic, Lesson, Profile, TeacherCurriculum, TeacherQuestion } from '../types'

type ApiError = { code?: string; message?: string; fields?: Record<string, string> }
let csrfToken: string | null = null
const id = () => crypto.randomUUID()
const offlineMessage = 'Không kết nối được máy chủ Grammar Quest. Hãy chạy Spring Boot ở cổng 8080 và kiểm tra MySQL.'

async function fetchFromServer(path: string, init: RequestInit): Promise<Response> {
  try { return await fetch(path, init) }
  catch { throw new Error(offlineMessage) }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method || 'GET'
  if (method !== 'GET' && !csrfToken) await refreshCsrf()
  const response = await fetchFromServer(`/api/v1${path}`, {
    credentials: 'include', ...init,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': id(), ...(csrfToken && method !== 'GET' ? { 'X-XSRF-TOKEN': csrfToken } : {}), ...init.headers }
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiError
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('grammarquest:unauthenticated'))
    throw new Error(body.message || (response.status >= 500 ? offlineMessage : `Máy chủ trả lỗi ${response.status}`))
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
export async function refreshCsrf() {
  const response = await fetchFromServer('/api/v1/auth/csrf', { credentials: 'include' })
  if (!response.ok) throw new Error(response.status >= 500 ? offlineMessage : `Máy chủ từ chối thiết lập bảo mật phiên (HTTP ${response.status}).`)
  try { csrfToken = (await response.json() as { token: string }).token }
  catch { throw new Error('Phản hồi bảo mật phiên từ máy chủ không hợp lệ.') }
  if (!csrfToken) throw new Error('Máy chủ chưa cấp mã bảo mật phiên.')
}
export const api = {
  adminBusiness: () => request<{days:{date:string;registrations:number;classes:number;matches:number}[];finishedMatches:number}>('/admin/business'),
  adminDeleteLesson: (id:number) => request(`/admin/lessons/${id}`,{method:'DELETE'}),
  adminDeleteQuestion: (id:number) => request(`/admin/questions/${id}`,{method:'DELETE'}),
  me: () => request<Profile>('/auth/me'),
  login: (username: string, password: string) => request<Profile>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username: string, displayName: string, password: string) => request<Profile>('/auth/register', { method: 'POST', body: JSON.stringify({ username, displayName, password }) }),
  logout: async () => { await request<void>('/auth/logout', { method: 'POST' }); csrfToken = null },
  lessons: () => request<Lesson[]>('/lessons'),
  history: () => request<Attempt[]>('/attempts'),
  teacherQuestions: () => request<TeacherQuestion[]>('/teacher/questions'),
  teacherPromoteQuestionsToCommon: (questionIds: number[]) => request<{ promotedCount: number }>('/teacher/questions/promote-common', { method: 'POST', body: JSON.stringify({ questionIds }) }),
  teacherCreateLiveExamFromQuestions: (data: { classId: number; title: string; endsAt: string; questionIds: number[] }) => request<{ examId: number; questionsCount: number; classId: number }>('/teacher/questions/to-live-exam', { method: 'POST', body: JSON.stringify(data) }),
  classes: () => request<Classroom[]>('/classes'),
  teacherCurriculum: () => request<TeacherCurriculum>('/teacher/curriculum'),
  teacherCreateTopic: (data:Omit<CurriculumTopic,'published'>) => request<{slug:string}>('/teacher/curriculum/topics',{method:'POST',body:JSON.stringify(data)}),
  teacherEditTopic: (slug:string,data:Omit<CurriculumTopic,'published'>) => request<{slug:string}>(`/teacher/curriculum/topics/${slug}`,{method:'PUT',body:JSON.stringify(data)}),
  teacherPublishTopic: (slug:string,published:boolean) => request<{slug:string}>(`/teacher/curriculum/topics/${slug}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  teacherCreateLesson: (data:Omit<AdminLesson,'id'|'published'>) => request<{id:number}>('/teacher/curriculum/lessons',{method:'POST',body:JSON.stringify(data)}),
  teacherEditLesson: (id:number,data:Omit<AdminLesson,'id'|'published'>) => request<{id:number}>(`/teacher/curriculum/lessons/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  teacherPublishLesson: (id:number,published:boolean) => request<{id:number}>(`/teacher/curriculum/lessons/${id}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  teacherCreateCommonQuestion: (data:Omit<AdminQuestion,'id'|'published'>) => request<{id:number}>('/teacher/curriculum/questions',{method:'POST',body:JSON.stringify(data)}),
  teacherCreateCommonQuestionsBatch: (data: { lessonId: number; questions: Omit<AdminQuestion, 'id' | 'published' | 'lessonId'>[] }) => request<{ createdCount: number }>('/teacher/curriculum/questions/batch', { method: 'POST', body: JSON.stringify(data) }),
  teacherEditCommonQuestion: (id:number,data:Omit<AdminQuestion,'id'|'published'>) => request<{id:number}>(`/teacher/curriculum/questions/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  teacherPublishCommonQuestion: (id:number,published:boolean) => request<{id:number}>(`/teacher/curriculum/questions/${id}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  teacherCreateQuestion: (data:Omit<TeacherQuestion,'id'|'active'>) => request<TeacherQuestion>('/teacher/questions',{method:'POST',body:JSON.stringify(data)}),
  teacherCreateQuestionsBatch: (data: { lessonId: number; questions: Omit<TeacherQuestion, 'id' | 'active' | 'lessonId'>[] }) => request<{ createdCount: number }>('/teacher/questions/batch', { method: 'POST', body: JSON.stringify(data) }),
  teacherEditQuestion: (id:number,data:Omit<TeacherQuestion,'id'|'active'>) => request<TeacherQuestion>(`/teacher/questions/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  teacherActivateQuestion: (id:number,active:boolean) => request<TeacherQuestion>(`/teacher/questions/${id}/active`,{method:'PATCH',body:JSON.stringify({active})}),
  adminUsers: () => request<AdminUser[]>('/admin/users'),
  adminRole: (id:number,role:string) => request<{id:number;role:string}>(`/admin/users/${id}/role`,{method:'PATCH',body:JSON.stringify({role})}),
  adminLock: (id:number,locked:boolean) => request<{id:number;locked:boolean}>(`/admin/users/${id}/lock`,{method:'PATCH',body:JSON.stringify({locked})}),
  adminContent: () => request<AdminContent>('/admin/content'),
  adminPublishLesson: (id:number,published:boolean) => request<{id:number}>(`/admin/lessons/${id}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  adminPublishQuestion: (id:number,published:boolean) => request<{id:number}>(`/admin/questions/${id}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  adminAudit: () => request<{id:number;actor:string;action:string;targetType:string;targetId:number;detail:string;createdAt:string}[]>('/admin/audit')
}
