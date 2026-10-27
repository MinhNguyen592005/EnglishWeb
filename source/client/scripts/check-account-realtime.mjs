import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const entries = [],
  errors = [],
  restProfiles = [],
  reports = []
let student = {
  id: 2,
  username: 'alice',
  displayName: 'Alice',
  role: 'LEARNER',
  totalXp: 0,
  level: 1,
  xpInLevel: 0,
}
const teacher = {
  id: 1,
  username: 'teacher',
  displayName: 'Teacher',
  role: 'TEACHER',
  totalXp: 0,
  level: 1,
  xpInLevel: 0,
}
const admin = {
  id: 4,
  username: 'admin',
  displayName: 'Admin',
  role: 'ADMIN',
  totalXp: 0,
  level: 1,
  xpInLevel: 0,
}
const push = (id, action, payload) =>
  entries
    .filter((e) => e.user.id === id)
    .forEach((e) => e.ws.send(JSON.stringify({ action, payload })))
async function open(user, path) {
  const context = await browser.newContext(),
    page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept('Behavior report'))
  await page.route('**/api/v1/**', (route) => {
    const p = new URL(route.request().url()).pathname
    let data = []
    if (p.endsWith('/auth/me')) {
      restProfiles.push(user.id)
      data = user
    }
    if (p.endsWith('/teacher/overview'))
      data = { classes: 0, students: 0, openAssignments: 0, questions: 0, recent: [] }
    if (p.endsWith('/admin/users')) data = []
    if (p.endsWith('/admin/reports')) data = reports
    if (p.endsWith('/admin/content')) data = { lessons: [], questions: [] }
    if (p.endsWith('/admin/overview'))
      data = { users: 4, classes: 1, openReports: reports.length, questions: 0 }
    return route.fulfill({ json: data })
  })
  await page.routeWebSocket('**/api/ws-system', (ws) => {
    const entry = { ws, user }
    entries.push(entry)
    ws.onClose(() => {
      const index = entries.indexOf(entry)
      if (index >= 0) entries.splice(index, 1)
    })
    ws.onMessage((raw) => {
      const m = JSON.parse(raw)
      let action = 'CLASS_DATA',
        payload = {}
      switch (m.action) {
        case 'AUTH':
        case 'CLIENT_INTERACTION':
          return
        case 'WORKSPACE_UNWATCH':
          action = 'WORKSPACE_DATA'
          break
        case 'TEACHER_OVERVIEW_WATCH':
          action = 'WORKSPACE_DATA'
          payload = { classes: 1, students: 1, openAssignments: 0, questions: 0, recent: [] }
          break
        case 'ADMIN_REPORTS_WATCH':
          action = 'WORKSPACE_DATA'
          payload = {
            reports,
            overview: {
              users: 4,
              classes: 1,
              openReports: reports.filter((r) => r.status === 'OPEN').length,
              questions: 0,
            },
          }
          break
        case 'ADMIN_REPORT_DECIDE': {
          action = 'REPORT_DECISION_DATA'
          payload = { id: m.payload.reportId, status: 'RESOLVED' }
          const report = reports.find((r) => r.id === m.payload.reportId)
          report.status = 'RESOLVED'
          report.decision = m.payload.action
          push(1, 'REPORT_DECISION', {
            source: 'USER',
            reportId: report.id,
            decision: m.payload.action,
            recipient: 'REPORTER',
            message: 'Report processed for reporter.',
          })
          push(2, 'REPORT_DECISION', {
            source: 'USER',
            reportId: report.id,
            decision: m.payload.action,
            recipient: 'TARGET',
            message: 'Report processed for target.',
          })
          push(4, 'WORKSPACE_UPDATE', {
            kind: 'REPORTS',
            data: { reports, overview: { users: 4, classes: 1, openReports: 0, questions: 0 } },
          })
          break
        }
        case 'CLIENT_ACTIVITY':
          action = 'ACTIVITY_UPDATED'
          break
        case 'ACCOUNT_GET':
          action = 'ACCOUNT_DATA'
          payload = user.id === 2 ? student : user
          break
        case 'CLASS_LESSONS':
          payload = []
          break
        case 'EXAM_LIST':
          action = 'EXAM_DATA'
          payload = []
          break
        case 'EXAM_UNWATCH':
          action = 'EXAM_DATA'
          break
        case 'CLASS_OPEN':
          action = 'CLASS_SNAPSHOT'
          payload = {
            classroom: {
              id: 1,
              name: 'Live classroom',
              teacherId: 1,
              teacherName: 'Teacher',
              joinCode: 'LIVE123',
              members: [student],
              assignments: [],
            },
            messages: [],
          }
          break
        case 'REPORT_USER': {
          action = 'REPORT_DATA'
          payload = { id: 7, status: 'OPEN' }
          reports.push({
            id: 7,
            source: 'USER',
            accusedId: 2,
            accusedName: 'Alice',
            reporterId: 1,
            reason: 'Behavior report',
            messageBody: 'CLASS #1',
            status: 'OPEN',
            createdAt: new Date().toISOString(),
          })
          push(1, 'REPORT_SUBMITTED', {
            source: 'USER',
            reportId: 7,
            status: 'OPEN',
            message: 'Report accepted by server.',
          })
          push(4, 'WORKSPACE_UPDATE', {
            kind: 'REPORTS',
            data: { reports, overview: { users: 4, classes: 1, openReports: 1, questions: 0 } },
          })
          push(2, 'REPORT_RECEIVED', {
            source: 'USER',
            reportId: 7,
            message:
              'Tài khoản của bạn vừa nhận một báo cáo. Quản trị viên sẽ xem xét; bạn chưa bị xác định vi phạm.',
          })
          push(4, 'REPORT_CREATED', { source: 'USER', reportId: 7 })
          break
        }
      }
      if (m.requestId) ws.send(JSON.stringify({ action, payload, requestId: m.requestId }))
    })
  })
  await page.goto(`http://localhost:5175${path}`)
  return page
}
try {
  const a = await open(student, '/profile'),
    b = await open(student, '/profile')
  await a.getByText('0 EXP tích lũy', { exact: true }).waitFor()
  await b.getByText('0 EXP tích lũy', { exact: true }).waitFor()
  const initialFetches = restProfiles.filter((id) => id === 2).length
  student = { ...student, totalXp: 1250, level: 2, xpInLevel: 250 }
  push(2, 'ACCOUNT_UPDATE', student)
  for (const page of [a, b]) await page.getByText('1250 EXP tích lũy', { exact: true }).waitFor()
  assert.equal(restProfiles.filter((id) => id === 2).length, initialFetches)
  const adminPage = await open(admin, '/admin?tab=reports'),
    teacherPage = await open(teacher, '/classes/1')
  await teacherPage.getByRole('button', { name: 'Báo cáo học sinh', exact: true }).click()
  for (const page of [a, b])
    await page.getByText(/Tài khoản của bạn vừa nhận một báo cáo/).waitFor()
  await adminPage.getByText('Lý do: Behavior report', { exact: false }).waitFor()
  await adminPage.getByRole('button', { name: 'Cảnh báo', exact: true }).click()
  await teacherPage.getByText('Report processed for reporter.', { exact: true }).waitFor()
  for (const page of [a, b])
    await page.getByText('Report processed for target.', { exact: true }).waitFor()
  await mkdir('artifacts/role-views', { recursive: true })
  await a.screenshot({ path: 'artifacts/role-views/account-report.png', fullPage: true })
  const originalSockets = entries.filter((e) => e.user.id === 2).map((e) => e.ws)
  student = { ...student, role: 'TEACHER' }
  push(2, 'ACCOUNT_UPDATE', student)
  for (const page of [a, b]) await page.waitForURL('**/teacher')
  assert.deepEqual(
    entries.filter((e) => e.user.id === 2).map((e) => e.ws),
    originalSockets,
    'Role update must reuse sockets',
  )
  for (const entry of entries.filter((e) => e.user.id === 2)) {
    entry.ws.send(
      JSON.stringify({
        action: 'ACCOUNT_LOCKED',
        payload: {
          message: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.',
        },
      }),
    )
    entry.ws.close({ code: 4003, reason: 'Account locked' })
  }
  for (const page of [a, b]) {
    await page.waitForURL('**/login')
    await page
      .getByRole('alert')
      .getByText(/Tài khoản đã bị khóa/)
      .waitFor()
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS: XP across two tabs without profile REST; report receipt reaches sender; admin decision reaches both parties across tabs; role changes reuse sockets; locked tabs sign out',
  )
} finally {
  await browser.close()
}
