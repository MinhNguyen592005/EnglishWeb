import { request } from '@playwright/test'

const password = process.env.DEMO_PASSWORD
if (!password) throw new Error('DEMO_PASSWORD is required')
const baseURL = 'http://127.0.0.1:5173'
async function client(username) {
  const context = await request.newContext({ baseURL })
  const token = (await (await context.get('/api/v1/auth/csrf')).json()).token
  const login = await context.post('/api/v1/auth/login', {
    data: { username, password },
    headers: { 'X-XSRF-TOKEN': token },
  })
  if (login.status() !== 200)
    throw new Error(`Login ${username}: ${login.status()} ${await login.text()}`)
  return {
    username,
    context,
    async call(method, path, data, expected = 200) {
      const options = { headers: { 'X-XSRF-TOKEN': token } }
      if (data !== undefined) options.data = data
      const response = await context.fetch(`/api/v1${path}`, { ...options, method })
      const body = response.status() === 204 ? null : await response.json().catch(() => null)
      if (response.status() !== expected)
        throw new Error(
          `${username} ${method} ${path}: ${response.status()} ${JSON.stringify(body)}`,
        )
      return body
    },
  }
}
const teacher = await client('teacher_demo')
const learner = await client('learner_one')
const opponent = await client('learner_two')
const admin = await client('admin_demo')
try {
  const name = `Test lớp ${Date.now()}`
  const cls = await teacher.call('POST', '/classes', { name })
  await learner.call('POST', '/classes', { name: 'Forbidden' }, 403)
  await learner.call('POST', '/classes/join', { code: cls.joinCode })
  const detail = await learner.call('GET', `/classes/${cls.id}`)
  if (!detail.members.some((m) => m.username === 'learner_one'))
    throw new Error('Member was not added')
  const custom = await teacher.call('POST', '/teacher/questions', {
    lessonId: 1,
    prompt: `Teacher question ${Date.now()}: If ice melts, it ___ water.`,
    optionA: 'becomes',
    optionB: 'became',
    optionC: 'will became',
    optionD: 'become',
    correctOption: 'A',
    explanation: 'Zero conditional uses present simple.',
  })
  if (custom.active !== true) throw new Error('Teacher question was not active')
  await learner.call('GET', '/teacher/questions', undefined, 403)
  const dueAt = new Date(Date.now() + 86400000).toISOString()
  const assignment = await teacher.call('POST', `/classes/${cls.id}/assignments`, {
    title: 'Ôn câu điều kiện',
    lessonId: 1,
    instructions: 'Làm bài tập',
    passPercent: 80,
    dueAt,
  })
  const attempt = await learner.call(
    'POST',
    `/classes/${cls.id}/assignments/${assignment.id}/start`,
  )
  if (attempt.kind !== 'PRACTICE') throw new Error('Assignment did not create practice attempt')
  if (!attempt.questions.some((q) => q.prompt === custom.prompt))
    throw new Error('Teacher question was not included')
  const results = await teacher.call(
    'GET',
    `/classes/${cls.id}/assignments/${assignment.id}/results`,
  )
  if (!results.some((r) => r.attemptId === attempt.id))
    throw new Error('Assignment attempt missing from teacher report')
  await learner.call(
    'GET',
    `/classes/${cls.id}/assignments/${assignment.id}/results`,
    undefined,
    403,
  )
  const chat = await teacher.call('POST', `/classes/${cls.id}/messages`, { body: 'Chào cả lớp' })
  await learner.call('POST', `/classes/${cls.id}/messages/${chat.id}/report`, {
    reason: 'Kiểm tra báo cáo',
  })
  const reports = await admin.call('GET', '/admin/reports')
  const report = reports.find((r) => r.messageBody === 'Chào cả lớp' && r.status === 'OPEN')
  if (!report) throw new Error('Report missing')
  await admin.call('POST', `/admin/reports/${report.id}/decision`, { action: 'WARN', note: 'Test' })
  const room = await learner.call('POST', '/arena/rooms')
  await opponent.call('POST', '/arena/join', { code: room.code })
  await learner.call('POST', `/arena/rooms/${room.id}/ready`, { ready: true })
  await opponent.call('POST', `/arena/rooms/${room.id}/ready`, { ready: true })
  const active = await learner.call('POST', `/arena/rooms/${room.id}/start`)
  if (!active.question || active.lastResult) throw new Error('Question missing or answer leaked')
  const first = await learner.call('POST', `/arena/rooms/${room.id}/answers`, {
    roundNo: 1,
    option: 'A',
  })
  if (first.lastResult || first.opponentAnswered) throw new Error('Answer leaked before opponent')
  const second = await opponent.call('POST', `/arena/rooms/${room.id}/answers`, {
    roundNo: 1,
    option: 'B',
  })
  if (second.currentRound !== 2 || !second.lastResult) throw new Error('Round did not advance')
  await learner.call('POST', `/arena/rooms/${room.id}/answers`, { roundNo: 1, option: 'A' }, 409)
  await learner.call('POST', `/arena/rooms/${room.id}/leave`)
  const finished = await opponent.call('GET', `/arena/rooms/${room.id}`)
  if (
    finished.status !== 'FINISHED' ||
    finished.winnerId !== (await opponent.call('GET', '/auth/me')).id
  )
    throw new Error('Forfeit result incorrect')
  const overview = await admin.call('GET', '/admin/overview')
  if (overview.classes < 1) throw new Error('Admin overview incorrect')
  const newName = `check_${Date.now()}`
  const created = await learner.call(
    'POST',
    '/auth/register',
    { username: newName, displayName: 'Role check', password },
    201,
  )
  await admin.call('PATCH', `/admin/users/${created.id}/role`, { role: 'TEACHER' })
  const promoted = await client(newName)
  try {
    await promoted.call('GET', '/teacher/questions')
    await admin.call('PATCH', `/admin/users/${created.id}/lock`, { locked: true })
    await promoted.call('GET', '/auth/me', undefined, 403)
    await admin.call('PATCH', `/admin/users/${created.id}/lock`, { locked: false })
    await admin.call('PATCH', `/admin/users/${created.id}/role`, { role: 'LEARNER' })
    await promoted.call('GET', '/teacher/questions', undefined, 403)
  } finally {
    await promoted.context.dispose()
  }
  const adminProfile = await admin.call('GET', '/auth/me')
  await admin.call('PATCH', `/admin/users/${adminProfile.id}/lock`, { locked: true }, 409)
  console.log(
    'PASS: classroom/assignment/teacher question/chat/report, admin roles and locks, two-client arena',
  )
} finally {
  await Promise.all([teacher, learner, opponent, admin].map((c) => c.context.dispose()))
}
