import type { AdminContent, AdminLesson, AdminQuestion, AdminReport, AdminUser, AnswerResult, ArenaHistory, ArenaMessage, ArenaRoom, AssignmentResult, Attempt, ClassMessage, Classroom, CurriculumTopic, Lesson, Profile, TeacherCurriculum, TeacherOverview, TeacherQuestion, Topic } from '../types'

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
  me: () => request<Profile>('/auth/me'),
  login: (username: string, password: string) => request<Profile>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username: string, displayName: string, password: string) => request<Profile>('/auth/register', { method: 'POST', body: JSON.stringify({ username, displayName, password }) }),
  logout: async () => { await request<void>('/auth/logout', { method: 'POST' }); csrfToken = null },
  lessons: () => request<Lesson[]>('/lessons'),
  topics: () => request<Topic[]>('/topics'),
  lesson: (id: number) => request<Lesson>(`/lessons/${id}`),
  start: (kind: Attempt['kind'], lessonId: number | null) => request<Attempt>('/attempts', { method: 'POST', body: JSON.stringify({ kind, lessonId }) }),
  attempt: (id: number) => request<Attempt>(`/attempts/${id}`),
  answer: (id: number, ordinalNo: number, option: string) => request<AnswerResult>(`/attempts/${id}/answers`, { method: 'POST', body: JSON.stringify({ ordinalNo, option }) }),
  history: () => request<Attempt[]>('/attempts'),
  classes: () => request<Classroom[]>('/classes'),
  classDetail: (id:number) => request<Classroom>(`/classes/${id}`),
  renameClass: (id:number,name:string) => request<Classroom>(`/classes/${id}`,{method:'PATCH',body:JSON.stringify({name})}),
  removeClassMember: (id:number,memberId:number) => request<{removed:boolean}>(`/classes/${id}/members/${memberId}`,{method:'DELETE'}),
  createClass: (name:string) => request<Classroom>('/classes',{method:'POST',body:JSON.stringify({name})}),
  joinClass: (code:string) => request<Classroom>('/classes/join',{method:'POST',body:JSON.stringify({code})}),
  createAssignment: (classId:number, data:{title:string;lessonId:number;instructions:string;passPercent:number;dueAt:string}) => request<{id:number}>(`/classes/${classId}/assignments`,{method:'POST',body:JSON.stringify(data)}),
  updateAssignment: (classId:number,assignmentId:number,data:{title:string;instructions:string;passPercent:number;dueAt:string;status:'PUBLISHED'|'CLOSED'}) => request<{id:number}>(`/classes/${classId}/assignments/${assignmentId}`,{method:'PATCH',body:JSON.stringify(data)}),
  startAssignment: (classId:number,assignmentId:number) => request<Attempt>(`/classes/${classId}/assignments/${assignmentId}/start`,{method:'POST'}),
  assignmentResults: (classId:number,assignmentId:number) => request<AssignmentResult[]>(`/classes/${classId}/assignments/${assignmentId}/results`),
  classMessages: (id:number) => request<ClassMessage[]>(`/classes/${id}/messages`),
  sendClassMessage: (id:number,body:string) => request<ClassMessage>(`/classes/${id}/messages`,{method:'POST',body:JSON.stringify({body})}),
  reportClassMessage: (id:number,messageId:number,reason:string) => request<{id:number}>(`/classes/${id}/messages/${messageId}/report`,{method:'POST',body:JSON.stringify({reason})}),
  teacherQuestions: () => request<TeacherQuestion[]>('/teacher/questions'),
  teacherOverview: () => request<TeacherOverview>('/teacher/overview'),
  teacherCurriculum: () => request<TeacherCurriculum>('/teacher/curriculum'),
  teacherCreateTopic: (data:Omit<CurriculumTopic,'published'>) => request<{slug:string}>('/teacher/curriculum/topics',{method:'POST',body:JSON.stringify(data)}),
  teacherEditTopic: (slug:string,data:Omit<CurriculumTopic,'published'>) => request<{slug:string}>(`/teacher/curriculum/topics/${slug}`,{method:'PUT',body:JSON.stringify(data)}),
  teacherPublishTopic: (slug:string,published:boolean) => request<{slug:string}>(`/teacher/curriculum/topics/${slug}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  teacherCreateLesson: (data:Omit<AdminLesson,'id'|'published'>) => request<{id:number}>('/teacher/curriculum/lessons',{method:'POST',body:JSON.stringify(data)}),
  teacherEditLesson: (id:number,data:Omit<AdminLesson,'id'|'published'>) => request<{id:number}>(`/teacher/curriculum/lessons/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  teacherPublishLesson: (id:number,published:boolean) => request<{id:number}>(`/teacher/curriculum/lessons/${id}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  teacherCreateCommonQuestion: (data:Omit<AdminQuestion,'id'|'published'>) => request<{id:number}>('/teacher/curriculum/questions',{method:'POST',body:JSON.stringify(data)}),
  teacherEditCommonQuestion: (id:number,data:Omit<AdminQuestion,'id'|'published'>) => request<{id:number}>(`/teacher/curriculum/questions/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  teacherPublishCommonQuestion: (id:number,published:boolean) => request<{id:number}>(`/teacher/curriculum/questions/${id}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  teacherCreateQuestion: (data:Omit<TeacherQuestion,'id'|'active'>) => request<TeacherQuestion>('/teacher/questions',{method:'POST',body:JSON.stringify(data)}),
  teacherEditQuestion: (id:number,data:Omit<TeacherQuestion,'id'|'active'>) => request<TeacherQuestion>(`/teacher/questions/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  teacherActivateQuestion: (id:number,active:boolean) => request<TeacherQuestion>(`/teacher/questions/${id}/active`,{method:'PATCH',body:JSON.stringify({active})}),
  arenaMine: () => request<ArenaRoom|Record<string,never>>('/arena/mine'),
  arenaHistory: () => request<ArenaHistory[]>('/arena/history'),
  arenaCreate: () => request<ArenaRoom>('/arena/rooms',{method:'POST'}),
  arenaJoin: (code:string) => request<ArenaRoom>('/arena/join',{method:'POST',body:JSON.stringify({code})}),
  arenaRoom: (id:number) => request<ArenaRoom>(`/arena/rooms/${id}`),
  arenaMessages: (id:number) => request<ArenaMessage[]>(`/arena/rooms/${id}/messages`),
  arenaSendMessage: (id:number,body:string) => request<ArenaMessage>(`/arena/rooms/${id}/messages`,{method:'POST',body:JSON.stringify({body})}),
  arenaReportMessage: (id:number,messageId:number,reason:string) => request<{status:string}>(`/arena/rooms/${id}/messages/${messageId}/report`,{method:'POST',body:JSON.stringify({reason})}),
  arenaReady: (id:number,ready:boolean) => request<ArenaRoom>(`/arena/rooms/${id}/ready`,{method:'POST',body:JSON.stringify({ready})}),
  arenaStart: (id:number) => request<ArenaRoom>(`/arena/rooms/${id}/start`,{method:'POST'}),
  arenaAnswer: (id:number,roundNo:number,option:string) => request<ArenaRoom>(`/arena/rooms/${id}/answers`,{method:'POST',body:JSON.stringify({roundNo,option})}),
  arenaLeave: (id:number) => request<ArenaRoom>(`/arena/rooms/${id}/leave`,{method:'POST'}),
  adminOverview: () => request<{users:number;classes:number;openReports:number;questions:number}>('/admin/overview'),
  adminUsers: () => request<AdminUser[]>('/admin/users'),
  adminRole: (id:number,role:string) => request<{id:number;role:string}>(`/admin/users/${id}/role`,{method:'PATCH',body:JSON.stringify({role})}),
  adminLock: (id:number,locked:boolean) => request<{id:number;locked:boolean}>(`/admin/users/${id}/lock`,{method:'PATCH',body:JSON.stringify({locked})}),
  adminReports: () => request<AdminReport[]>('/admin/reports'),
  adminDecide: (id:number,action:string,note:string,source:'CLASS'|'ARENA') => request<{id:number}>(`/admin/reports/${id}/decision`,{method:'POST',body:JSON.stringify({action,note,source})}),
  adminContent: () => request<AdminContent>('/admin/content'),
  adminCreateLesson: (data:Omit<AdminLesson,'id'|'published'>) => request<{id:number}>('/admin/lessons',{method:'POST',body:JSON.stringify(data)}),
  adminEditLesson: (id:number,data:Omit<AdminLesson,'id'|'published'>) => request<{id:number}>(`/admin/lessons/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  adminCreateQuestion: (data:Omit<AdminQuestion,'id'|'published'>) => request<{id:number}>('/admin/questions',{method:'POST',body:JSON.stringify(data)}),
  adminPublishLesson: (id:number,published:boolean) => request<{id:number}>(`/admin/lessons/${id}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  adminPublishQuestion: (id:number,published:boolean) => request<{id:number}>(`/admin/questions/${id}/publication`,{method:'PATCH',body:JSON.stringify({published})}),
  adminEditQuestion: (id:number,data:AdminContent['questions'][number]) => request<{id:number}>(`/admin/questions/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  adminAudit: () => request<{id:number;actor:string;action:string;targetType:string;targetId:number;detail:string;createdAt:string}[]>('/admin/audit')
}
