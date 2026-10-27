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
      const response = await context.fetch(`/api/v1${path}`, {
        method,
        headers: { 'X-XSRF-TOKEN': token },
        ...(data === undefined ? {} : { data }),
      })
      const body = await response.json().catch(() => null)
      if (response.status() !== expected)
        throw new Error(
          `${username} ${method} ${path}: ${response.status()} ${JSON.stringify(body)}`,
        )
      return body
    },
  }
}
const teacher = await client('teacher_demo'),
  learner = await client('learner_one'),
  opponent = await client('learner_two'),
  admin = await client('admin_demo')
try {
  const overview = await teacher.call('GET', '/teacher/overview')
  if (typeof overview.classes !== 'number' || !Array.isArray(overview.recent))
    throw new Error('Teacher overview invalid')
  await learner.call('GET', '/teacher/overview', undefined, 403)
  const cls = await teacher.call('POST', '/classes', { name: `Kiểm tra ${Date.now()}` })
  const renamed = await teacher.call('PATCH', `/classes/${cls.id}`, { name: 'Lớp đã đổi tên' })
  if (renamed.name !== 'Lớp đã đổi tên') throw new Error('Class rename failed')
  await learner.call('POST', '/classes/join', { code: cls.joinCode })
  const textQuestion = await teacher.call('POST', '/teacher/questions', {
    lessonId: 1,
    prompt: `Fill the blank ${Date.now()}: If I ___ time, I would study.`,
    questionType: 'FILL_BLANK',
    acceptedAnswer: 'had',
    explanation: 'Câu điều kiện loại 2 dùng quá khứ đơn.',
  })
  if (textQuestion.questionType !== 'FILL_BLANK') throw new Error('Teacher text question missing')
  const dueAt = new Date(Date.now() + 86400000).toISOString()
  const assignment = await teacher.call('POST', `/classes/${cls.id}/assignments`, {
    title: 'Nhiệm vụ kiểm tra',
    lessonId: 1,
    instructions: 'Làm bài',
    passPercent: 80,
    dueAt,
  })
  await teacher.call('PATCH', `/classes/${cls.id}/assignments/${assignment.id}`, {
    title: 'Nhiệm vụ đã sửa',
    instructions: 'Đã sửa',
    passPercent: 70,
    dueAt,
    status: 'CLOSED',
  })
  await learner.call(
    'POST',
    `/classes/${cls.id}/assignments/${assignment.id}/start`,
    undefined,
    409,
  )
  await teacher.call('PATCH', `/classes/${cls.id}/assignments/${assignment.id}`, {
    title: 'Nhiệm vụ đã sửa',
    instructions: 'Đã sửa',
    passPercent: 70,
    dueAt,
    status: 'PUBLISHED',
  })
  const attempt = await learner.call(
    'POST',
    `/classes/${cls.id}/assignments/${assignment.id}/start`,
  )
  const textIndex = attempt.questions.findIndex((q) => q.prompt === textQuestion.prompt)
  if (textIndex < 0) throw new Error('Teacher text question was not selected')
  for (let i = 0; i < textIndex; i++)
    await learner.call('POST', `/attempts/${attempt.id}/answers`, { ordinalNo: i + 1, option: 'A' })
  const graded = await learner.call('POST', `/attempts/${attempt.id}/answers`, {
    ordinalNo: textIndex + 1,
    option: ' HAD. ',
  })
  if (!graded.correct || graded.correctOption !== 'had')
    throw new Error('Text answer was not graded correctly')
  const snapshot = await learner.call('GET', `/attempts/${attempt.id}`)
  if (
    snapshot.questions[textIndex].questionType !== 'FILL_BLANK' ||
    snapshot.questions[textIndex].options.length !== 0
  )
    throw new Error('Text question snapshot invalid')
  const detail = await teacher.call('GET', `/classes/${cls.id}`)
  if (detail.assignments[0].title !== 'Nhiệm vụ đã sửa') throw new Error('Assignment edit failed')
  await teacher.call(
    'DELETE',
    `/classes/${cls.id}/members/${(await learner.call('GET', '/auth/me')).id}`,
  )
  await learner.call('GET', `/classes/${cls.id}`, undefined, 403)

  const slug = `test-${Date.now()}`
  const lesson = await admin.call('POST', '/admin/lessons', {
    topicSlug: slug,
    ordinalNo: 0,
    title: 'Bài nháp',
    summary: 'Chưa xuất bản',
    theory: 'Nội dung thử nghiệm.',
  })
  await admin.call('PUT', `/admin/lessons/${lesson.id}`, {
    topicSlug: slug,
    ordinalNo: 0,
    title: 'Bài nháp đã sửa',
    summary: 'Chưa xuất bản',
    theory: 'Nội dung thử nghiệm đã sửa.',
  })
  const q = await admin.call('POST', '/admin/questions', {
    lessonId: lesson.id,
    prompt: 'Choose the correct option.',
    optionA: 'one',
    optionB: 'two',
    optionC: 'three',
    optionD: 'four',
    correctOption: 'A',
    explanation: 'A is correct.',
  })
  if (!q.id) throw new Error('Question draft missing ID')
  await admin.call('PATCH', `/admin/lessons/${lesson.id}/publication`, { published: true }, 409)
  const publicLessons = await learner.call('GET', '/lessons')
  if (publicLessons.some((l) => l.id === lesson.id)) throw new Error('Draft lesson leaked')
  const content = await admin.call('GET', '/admin/content')
  if (!content.lessons.some((l) => l.id === lesson.id && l.theory.includes('đã sửa')))
    throw new Error('Lesson edit missing')

  const room = await learner.call('POST', '/arena/rooms')
  await opponent.call('POST', '/arena/join', { code: room.code })
  const message = await opponent.call('POST', `/arena/rooms/${room.id}/messages`, {
    body: 'Tin nhắn kiểm tra báo cáo',
  })
  await teacher.call(
    'POST',
    `/arena/rooms/${room.id}/messages/${message.id}/report`,
    { reason: 'Không thuộc phòng' },
    403,
  )
  await learner.call('POST', `/arena/rooms/${room.id}/messages/${message.id}/report`, {
    reason: 'Thử báo cáo',
  })
  await learner.call(
    'POST',
    `/arena/rooms/${room.id}/messages/${message.id}/report`,
    { reason: 'Trùng' },
    409,
  )
  const report = (await admin.call('GET', '/admin/reports')).find(
    (r) => r.source === 'ARENA' && r.messageBody === message.body && r.status === 'OPEN',
  )
  if (!report) throw new Error('Arena report missing')
  await admin.call('POST', `/admin/reports/${report.id}/decision`, {
    action: 'WARN',
    note: 'Đã xem',
    source: 'ARENA',
  })
  await learner.call('POST', `/arena/rooms/${room.id}/ready`, { ready: true })
  await opponent.call('POST', `/arena/rooms/${room.id}/ready`, { ready: true })
  const started = await learner.call('POST', `/arena/rooms/${room.id}/start`)
  await new Promise((resolve) => setTimeout(resolve, 9000))
  const paused = await learner.call('GET', `/arena/rooms/${room.id}`)
  if (paused.pausedUserId !== started.guestId || !paused.pauseExpiresAt)
    throw new Error('Match did not pause for disconnected opponent')
  const resumed = await opponent.call('GET', `/arena/rooms/${room.id}`)
  if (resumed.pausedUserId !== null || new Date(resumed.deadlineAt) <= new Date(started.deadlineAt))
    throw new Error('Match did not resume with extended deadline')
  await learner.call('POST', `/arena/rooms/${room.id}/leave`)
  const finished = await opponent.call('GET', `/arena/rooms/${room.id}`)
  if (finished.status !== 'FINISHED') throw new Error('Match did not finish')
  await opponent.call('POST', `/arena/rooms/${room.id}/messages`, { body: 'Late' }, 409)
  if (!(await opponent.call('GET', '/arena/history')).some((m) => m.id === room.id))
    throw new Error('Match history missing')
  console.log('PASS: teacher management, admin drafts, arena moderation, pause/reconnect, history')
} finally {
  await Promise.all([teacher, learner, opponent, admin].map((c) => c.context.dispose()))
}
