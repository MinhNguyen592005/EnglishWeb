import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const profile = { id: 80, username: 'teacher', displayName: 'Teacher', role: 'TEACHER', level: 1, totalXp: 0 }
const assignment = { id: 1, title: 'Unit 1', dueAt: '2027-01-01T00:00:00Z', passPercent: 80, status: 'PUBLISHED', instructions: '', lessonId: 1, lessonTitle: 'Unit 1' }
const classroom = { id: 90, name: 'English 10A', teacherId: 80, teacherName: 'Teacher', joinCode: 'CLASS90', members: [{ id: 100, username: 'student', displayName: 'Student', role: 'LEARNER' }], assignments: [assignment] }
let submitted = false
let socket
const commands = []
let resultReads = 0
const chatMessages = [
  { id: 1, userId: 100, displayName: 'Minh Anh', body: 'Thầy ơi, em muốn hỏi thêm về bài tập hôm nay ạ.', createdAt: '2026-10-29T08:00:00Z' },
  { id: 2, userId: 80, displayName: 'Teacher', body: 'Các em đọc kỹ phần ví dụ nhé. Có câu nào chưa rõ thì gửi vào đây, thầy sẽ giải thích thêm.', createdAt: '2026-10-29T08:01:00Z' },
  { id: 3, userId: 100, displayName: 'Minh Anh', body: 'Dạ em hiểu rồi, em cảm ơn thầy!', createdAt: '2026-10-29T08:02:00Z' },
]
await context.route('**/api/v1/**', (route) => {
  const path = new URL(route.request().url()).pathname
  let data = {}
  if (path.endsWith('/auth/me')) data = profile
  else if (path.endsWith('/classes/90')) data = classroom
  else if (path.endsWith('/classes')) data = [classroom]
  else if (path.endsWith('/overview')) data = { totalStudents: 1 }
  else if (path.endsWith('/messages')) data = chatMessages
  else if (path.endsWith('/assignments/1/results')) {
    resultReads++
    data = submitted ? [{ userId: 100, displayName: 'Student', attemptId: 1, status: 'COMPLETED', correctCount: 9, totalQuestions: 10, completedAt: '2026-10-29T10:00:00Z', passed: true }] : []
  }
  return route.fulfill({ json: data })
})
await context.routeWebSocket('**/api/ws-system', (ws) => {
  socket = ws
  ws.onMessage((raw) => {
    const message = JSON.parse(String(raw))
    commands.push(message.action)
    const action = ['CLASS_OPEN', 'CLASS_LIST'].includes(message.action) ? 'CLASS_SNAPSHOT' : message.action === 'CLASS_UNWATCH' ? 'CLASS_DATA' : null
    if (action) ws.send(JSON.stringify({ action, requestId: message.requestId, payload: message.action === 'CLASS_LIST' ? { classes: [classroom] } : { classroom, messages: [] } }))
  })
})
try {
  await page.goto('http://localhost:5174/classes/90?view=members')
  await expect(page.locator('.class-student-row')).toBeVisible()
  await expect.poll(() => commands.includes('CLASS_OPEN')).toBe(true)
  await page.locator('.class-student-row .mono').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Chưa nộp')
  const bounds = await dialog.boundingBox()
  expect(Math.abs(bounds.x + bounds.width / 2 - 720)).toBeLessThan(3)
  expect(Math.abs(bounds.y + bounds.height / 2 - 500)).toBeLessThan(3)
  submitted = true
  socket.send(JSON.stringify({ action: 'DATA_INVALIDATED', payload: { refresh: true } }))
  await expect(dialog).toContainText('90%')
  expect(resultReads).toBeGreaterThan(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('link', { name: 'Quay lại lớp học' }).click()
  await expect.poll(() => commands.includes('CLASS_LIST')).toBe(true)
  await expect(page.locator('.class-card h3')).toHaveText('English 10A')
  classroom.name = 'English 10A updated'
  socket.send(JSON.stringify({ action: 'CLASS_UPDATE', payload: { classes: [classroom] } }))
  await expect(page.locator('.class-card h3')).toHaveText('English 10A updated')
  await page.locator('#new-class-name').fill('Unsaved draft')
  socket.send(JSON.stringify({ action: 'DATA_INVALIDATED', payload: { refresh: true } }))
  await expect(page.locator('#new-class-name')).toHaveValue('Unsaved draft')
  const registrations = commands.filter((action) => action === 'CLASS_LIST').length
  socket.close({ code: 1001, reason: 'Reconnect test' })
  await expect.poll(() => commands.filter((action) => action === 'CLASS_LIST').length, { timeout: 15000 }).toBeGreaterThan(registrations)
  await expect(page.locator('#new-class-name')).toHaveValue('Unsaved draft')
  await page.goto('http://localhost:5174/classes/90?view=chat')
  await expect(page.locator('.chat-message')).toHaveCount(3)
  await expect(page.locator('.chat-message.mine')).toHaveCount(1)
  await expect(page.locator('.class-chat-day')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Gửi tin nhắn', exact: true })).toBeDisabled()
  await page.getByRole('textbox', { name: 'Tin nhắn lớp' }).fill('Xin chào cả lớp!')
  await expect(page.getByRole('button', { name: 'Gửi tin nhắn', exact: true })).toBeEnabled()
  await mkdir('artifacts/classroom', { recursive: true })
  await page.locator('.class-chat').screenshot({ path: 'artifacts/classroom/chat-messenger.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.class-chat').screenshot({ path: 'artifacts/classroom/chat-messenger-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  console.log('PASS: class watches, row click, centered modal, live result update, Escape, list push, reconnect, preserved draft')
} finally { await browser.close() }
