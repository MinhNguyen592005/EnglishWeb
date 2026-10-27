import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
const page = await context.newPage(),
  errors = [],
  starts = [],
  attempts = new Map()
page.on('pageerror', (e) => errors.push(e.message))
const profile = {
  id: 80,
  username: 'practice_preview',
  displayName: 'Minh Anh',
  role: 'LEARNER',
  totalXp: 100,
  level: 1,
  xpInLevel: 100,
}
const modules = Array.from({ length: 3 }, (_, i) => ({
  id: `l1-m${i + 1}`,
  levelId: 1,
  ordinalNo: i + 1,
  title: ['Sentence foundations', 'Questions and negatives', 'Present simple'][i],
  completedCount: 0,
  lessonCount: 3,
  lessons: [],
  unlocked: i === 0,
  lockReason: 'Finish the previous module to unlock.',
}))
const levels = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1,
  title: [
    'Grammar foundations',
    'Essential tenses',
    'Advanced tenses',
    'Complex sentences',
    'Advanced grammar',
  ][i],
  unlocked: i === 0,
  passed: false,
  modules: i === 0 ? modules : [],
  completedCount: 0,
  lessonCount: 9,
}))
let questCalls = 0
await context.route('**/api/v1/**', (route) => {
  const path = new URL(route.request().url()).pathname
  if (path.endsWith('/auth/me')) return route.fulfill({ json: profile })
  if (path.endsWith('/daily-quests')) questCalls++
  return route.fulfill({
    json: {
      quests: [],
      milestone: { totalQuests: 3, completedQuests: 0 },
      streak: { currentStreak: 0 },
    },
  })
})
await context.routeWebSocket('**/api/ws-system', (socket) =>
  socket.onMessage((raw) => {
    const m = JSON.parse(String(raw))
    if (!m.requestId) return
    let data = {}
    if (m.action === 'GET_ROADMAP' || m.action === 'START_ATTEMPT')
      throw Error('Legacy practice must not be requested')
    if (m.action === 'ROADMAP_OPEN') data = { levels }
    if (m.action === 'ROADMAP_START') {
      starts.push(m.payload)
      assert.ok(['LEVEL_REVIEW', 'MODULE_REVIEW'].includes(m.payload.kind))
      assert.ok(['1', 'l1-m1'].includes(m.payload.referenceId))
      data = {
        id: 100 + starts.length,
        kind: m.payload.kind,
        referenceId: m.payload.referenceId,
        title: 'Grammar foundations',
        levelId: 1,
        status: 'IN_PROGRESS',
        totalQuestions: 2,
        requiredCorrect: 0,
        answers: {},
        questions: [
          {
            id: 'q1',
            prompt: 'She ___ coffee.',
            options: ['likes', 'like', 'liked', 'liking'],
            moduleTitle: 'Sentence foundations',
            lessonId: '1.1',
            lessonTitle: 'Subject and verb',
          },
          {
            id: 'q2',
            prompt: 'They ___ students.',
            options: ['is', 'are', 'was', 'am'],
            moduleTitle: 'Sentence foundations',
            lessonId: '1.2',
            lessonTitle: 'Verb be',
          },
        ],
      }
      attempts.set(data.id, data)
    }
    if (m.action === 'ROADMAP_ATTEMPT') data = attempts.get(m.payload.attemptId)
    if (m.action === 'ROADMAP_SAVE') data = attempts.get(m.payload.attemptId)
    if (m.action === 'ROADMAP_SUBMIT') {
      data = {
        ...attempts.get(m.payload.attemptId),
        status: 'COMPLETED',
        correctCount: 2,
        answers: m.payload.answers,
      }
      data.questions = data.questions.map((q, i) => ({
        ...q,
        answer: m.payload.answers[q.id],
        correct: true,
        correctOption: i === 0 ? 'A' : 'B',
        explanation: 'Explanation fixture',
      }))
      attempts.set(data.id, data)
    }
    socket.send(
      JSON.stringify({
        action: m.action.startsWith('ROADMAP_') ? 'ROADMAP_COURSE_DATA' : 'ACTIVITY_UPDATED',
        requestId: m.requestId,
        payload: data,
      }),
    )
  }),
)
try {
  await mkdir('artifacts/practice', { recursive: true })
  await page.goto('http://localhost:5173/practice')
  await expect(page.locator('.practice-module')).toHaveCount(3)
  await expect(page.locator('.practice-module.is-locked button').first()).toBeDisabled()
  await expect(page.locator('.practice-levels button').nth(1)).toBeDisabled()
  await page.screenshot({ path: 'artifacts/practice/desktop.png', fullPage: true })
  await page.locator('.practice-start-mixed').click()
  await expect(page.locator('.study-question')).toHaveCount(2)
  assert.equal(starts[0].kind, 'LEVEL_REVIEW')
  await page.reload()
  await expect(page.locator('.study-question')).toHaveCount(2)
  await page.locator('.study-question').nth(0).getByRole('radio').nth(0).check()
  await page.locator('.study-question').nth(1).getByRole('radio').nth(1).check()
  const before = questCalls
  await page.locator('.study-actions button[type=submit]').click()
  await expect(page.locator('.feedback')).toHaveCount(2)
  await expect.poll(() => questCalls).toBeGreaterThan(before)
  await page.locator('.study-actions button').first().click()
  await expect(page.locator('.study-question')).toHaveCount(2)
  await expect(page.locator('.feedback')).toHaveCount(0)
  assert.equal(starts.length, 2)
  await page.locator('.practice-back').click()
  await expect(page.locator('.practice-module.is-locked button').first()).toBeDisabled()
  await page.locator('.practice-module:not(.is-locked) button').click()
  await expect(page.locator('.study-question')).toHaveCount(2)
  assert.equal(starts.at(-1).kind, 'MODULE_REVIEW')
  assert.equal(starts.at(-1).referenceId, 'l1-m1')
  await page.locator('.practice-back').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/practice/mobile.png', fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    'PASS: study-only practice, locked levels/modules, mixed/module requests, reload, answers/retry, daily refresh, mobile',
  )
} finally {
  await browser.close()
}
