// Browser regression test with mocked HTTP/WS: run Vite on port 5175 first.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ headless: true, channel: process.env.UI_BROWSER_CHANNEL || 'msedge' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = [], actions = []
let phase = 0, liveSocket
const profile = { id: 7, username: 'alice', displayName: 'Alice', role: 'LEARNER', totalXp: 1250, level: 2, xpInLevel: 250, placementEligible: false }
function course() {
  return { levels: [1, 2].map(id => {
    const placementPassed = phase === 2 && id === 1
    const lessons = (id === 1 ? ['1.1', '1.2'] : ['2.1']).map((lessonId, index) => ({ id: lessonId, title: `Lesson ${lessonId}`, ordinalNo: index + 1, status: phase === 3 || (phase === 1 && lessonId === '1.1') ? 'COMPLETED' : 'NOT_STARTED' }))
    const completedCount = lessons.filter(l => l.status === 'COMPLETED').length
    const unlocked = id === 1 || phase >= 2
    return { id, title: `Planet ${id}`, outcome: 'Grammar', planetStyle: 'mint', passed: placementPassed || phase === 3, placementPassed, unlocked, completedCount, lessonCount: lessons.length, examReady: completedCount === lessons.length,
      modules: [{ id: `l${id}-m1`, levelId: id, title: `Module ${id}`, ordinalNo: 1, unlocked, passed: placementPassed || phase === 3, lockReason: null, completedCount, lessonCount: lessons.length, lessons }] }
  }) }
}
const history = [{ id: 77, kind: 'LESSON', referenceId: '1.1', title: 'Lesson 1.1', levelId: 1, status: 'COMPLETED', totalQuestions: 3, correctCount: 2, createdAt: '2026-10-26T10:00:00Z', submittedAt: '2026-10-26T10:05:00Z' }]
page.on('pageerror', error => errors.push(error.message))
await page.route('**/api/v1/**', route => {
  const path = new URL(route.request().url()).pathname
  const data = path.endsWith('/auth/me') ? profile : path.endsWith('/daily-quests/streak') ? { currentStreak: 1, longestStreak: 2, completedToday: true }
    : path.endsWith('/daily-quests') ? { quests: [], milestone: { totalQuests: 0, completedQuests: 0, allCompleted: false, claimed: false, rewardXp: 100 }, streak: { currentStreak: 1, longestStreak: 2, completedToday: true } } : []
  return route.fulfill({ json: data })
})
await page.routeWebSocket('**/api/ws-system', ws => {
  liveSocket = ws
  ws.onMessage(raw => {
    const message = JSON.parse(raw); actions.push(message.action)
    if (!message.requestId) return
    const payload = message.action === 'ROADMAP_OPEN' ? course() : message.action === 'ROADMAP_HISTORY' ? history : message.action === 'ROADMAP_ATTEMPT' ? { ...history[0], requiredCorrect: 0, questions: [], answers: {} } : message.action === 'ACCOUNT_GET' ? profile : {}
    ws.send(JSON.stringify({ action: message.action.startsWith('ROADMAP_') ? 'ROADMAP_COURSE_DATA' : 'ACCOUNT_DATA', requestId: message.requestId, payload }))
  })
})
try {
  await page.goto('http://127.0.0.1:5175/dashboard')
  await expect(page.getByText('0/3 bài học hoàn thành', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Lesson 1.1', exact: true })).toBeVisible()
  phase = 1; liveSocket.send(JSON.stringify({ action: 'ROADMAP_PROGRESS_CHANGED', payload: { changed: true } }))
  await expect(page.getByText('1/3 bài học hoàn thành', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Lesson 1.2', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tiếp tục học', exact: true })).toHaveAttribute('href', '/roadmap?planet=level-1&module=l1-m1&lesson=1.2')
  await page.goto('http://127.0.0.1:5175/roadmap')
  await expect(page.locator('.roadmap-summary-main > strong')).toHaveText('1/3')
  await expect(page.locator('.roadmap-next h2')).toHaveText('Lesson 1.2')
  await page.goto('http://127.0.0.1:5175/profile')
  await expect(page.getByText('1/3 bài học hoàn thành · 33%', { exact: true })).toBeVisible()
  const record = page.locator('a.history-row').filter({ hasText: 'Lesson 1.1' })
  await expect(record).toHaveAttribute('href', '/roadmap?planet=level-1&attempt=77')
  await expect(record).toContainText('2/3 câu đúng')
  // A completion in another tab refreshes the mounted profile without navigation.
  phase = 3; liveSocket.send(JSON.stringify({ action: 'ROADMAP_PROGRESS_CHANGED', payload: { changed: true } }))
  await expect(page.getByText('3/3 bài học hoàn thành · 100%', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'Mobile profile must fit viewport')
  await record.click()
  await expect(page).toHaveURL(/\/roadmap\?planet=level-1&attempt=77$/)
  await expect(page.getByRole('heading', { name: 'Đã hoàn thành bài học', exact: true })).toBeVisible()
  phase = 2
  await page.goto('http://127.0.0.1:5175/dashboard')
  await expect(page.getByText('0/3 bài học hoàn thành', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Lesson 2.1', exact: true })).toBeVisible()
  await expect(page.getByText('1/2 level đã vượt qua', { exact: true })).toBeVisible()
  assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'Mobile dashboard must fit viewport')
  assert(!actions.includes('GET_ROADMAP'), 'Dashboard must not request legacy roadmap progress')
  assert(actions.includes('ROADMAP_HISTORY'), 'Profile must fetch study history')
  assert.deepEqual(errors, [])
  console.log('PASS: dashboard, roadmap and profile share study progress; realtime refresh, history links and placement exemption are consistent')
} finally { await context.close(); await browser.close() }
