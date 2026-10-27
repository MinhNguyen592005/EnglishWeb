// Frontend contract/interaction checks with deterministic HTTP and socket fixtures.
// No real accounts or application database are touched.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const base = process.env.QUEST_UI_BASE || 'http://127.0.0.1:5175'
const browser = await chromium.launch({
  channel: process.env.UI_BROWSER_CHANNEL || 'msedge',
  headless: true,
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
let profile = {
  id: 901,
  username: 'quest_preview',
  displayName: 'Minh Anh',
  role: 'LEARNER',
  totalXp: 4820,
  level: 5,
  xpInLevel: 820,
  placementEligible: false,
}
const freshOverview = () => ({
  quests: [
    {
      id: 101,
      code: 'ARENA_PLAY_1',
      tier: 'EASY',
      title: 'Tinh thần đấu sĩ',
      description: 'Tham gia 1 trận đấu trường PvP',
      category: 'ARENA',
      targetType: 'ARENA_PLAY',
      targetCount: 1,
      currentProgress: 1,
      rewardXp: 30,
      icon: 'Swords',
      completed: true,
      claimed: true,
    },
    {
      id: 102,
      code: 'CORRECT_15',
      tier: 'MEDIUM',
      title: 'Kỹ sư ngôn từ',
      description: 'Trả lời đúng tổng cộng 15 câu hỏi trong ngày',
      category: 'PRACTICE',
      targetType: 'CORRECT_COUNT',
      targetCount: 15,
      currentProgress: 15,
      rewardXp: 50,
      icon: 'CheckCircle2',
      completed: true,
      claimed: false,
    },
    {
      id: 103,
      code: 'DEFEAT_BOSS_1',
      tier: 'HARD',
      title: 'Hạ gục Robot canh trạm',
      description: 'Đánh bại 1 Boss bài học hoặc Boss chương',
      category: 'BOSS',
      targetType: 'BOSS_WIN',
      targetCount: 1,
      currentProgress: 0,
      rewardXp: 70,
      icon: 'Target',
      completed: false,
      claimed: false,
    },
  ],
  milestone: {
    totalQuests: 3,
    completedQuests: 2,
    allCompleted: false,
    claimed: false,
    rewardXp: 100,
  },
  streak: { currentStreak: 5, longestStreak: 12, completedToday: false },
})
let overview = freshOverview()
let failLoad = false,
  failClaim = false,
  overviewDelay = 0,
  claimCount = 0,
  chestCount = 0
const lesson = {
  id: 21,
  topicSlug: 'basic-tenses',
  topicTitle: 'Nền tảng các thì',
  title: 'Thì hiện tại đơn',
  summary: 'Ôn tập cách diễn đạt thói quen và sự thật.',
  ordinalNo: 0,
  difficulty: 'BEGINNER',
  status: 'AVAILABLE',
  chapterCompleted: false,
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await context.route('**/api/v1/**', async (route) => {
  const path = new URL(route.request().url()).pathname
  const json = (data) => route.fulfill({ json: data })
  if (path === '/api/v1/auth/me') return json(profile)
  if (path === '/api/v1/auth/csrf') return json({ token: 'fixture-csrf' })
  if (path === '/api/v1/attempts') return json([])
  if (path === '/api/v1/daily-quests') {
    const snapshot = structuredClone(overview)
    await delay(overviewDelay)
    return failLoad
      ? route.fulfill({ status: 503, json: { message: 'Không tải được nhiệm vụ thử nghiệm' } })
      : json(snapshot)
  }
  if (path === '/api/v1/daily-quests/102/claim') {
    claimCount++
    await delay(250)
    if (failClaim)
      return route.fulfill({
        status: 409,
        json: { message: 'Phần thưởng đã được nhận ở tab khác' },
      })
    assert.equal(route.request().headers()['x-xsrf-token'], 'fixture-csrf')
    overview.quests[1].claimed = true
    profile = { ...profile, totalXp: profile.totalXp + 50, xpInLevel: profile.xpInLevel + 50 }
    return json({ quest: overview.quests[1], profile })
  }
  if (path === '/api/v1/daily-quests/claim-milestone') {
    chestCount++
    assert.equal(overview.milestone.allCompleted, true)
    await delay(250)
    overview.milestone.claimed = true
    overview.streak = { ...overview.streak, currentStreak: 6, completedToday: true }
    profile = { ...profile, totalXp: profile.totalXp + 100, xpInLevel: profile.xpInLevel + 100 }
    return json({ milestone: overview.milestone, streak: overview.streak, profile })
  }
  throw new Error(`Unexpected HTTP fixture: ${path}`)
})
await context.routeWebSocket('**/api/ws-system', (socket) => {
  socket.onMessage((raw) => {
    const message = JSON.parse(String(raw))
    if (message.action === 'GET_ROADMAP')
      socket.send(
        JSON.stringify({
          action: 'ROADMAP_DATA',
          requestId: message.requestId,
          payload: [{ lessons: [lesson] }],
        }),
      )
    if (message.action === 'ACCOUNT_GET')
      socket.send(
        JSON.stringify({ action: 'ACCOUNT_DATA', requestId: message.requestId, payload: profile }),
      )
  })
})

try {
  await mkdir('artifacts/daily-quests', { recursive: true })
  await page.goto(`${base}/dashboard`)
  await expect(page.locator('.dq-task')).toHaveCount(3)
  await expect(page.locator('.dq-claimed')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Rương đang khóa' })).toBeDisabled()
  assert.equal(await page.locator('.dq-task.hard a').getAttribute('href'), '/lessons/21')
  await expect(page.locator('.dq-reward-summary')).toContainText('250')
  await page.screenshot({ path: 'artifacts/daily-quests/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.dq-heading-row')).toBeVisible()
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Mobile page must not overflow horizontally',
  )
  await page.screenshot({ path: 'artifacts/daily-quests/mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1050 })

  await page.getByRole('button', { name: 'Nhận 50 EXP: Kỹ sư ngôn từ' }).click()
  await expect(page.getByRole('button', { name: 'Nhận 50 EXP: Kỹ sư ngôn từ' })).toBeDisabled()
  await expect(page.locator('.dq-claimed')).toHaveCount(2)
  await expect(page.locator('.dq-toast')).toContainText('+50 EXP')
  assert.equal(claimCount, 1)
  await expect(page.locator('.home-stats').getByText(/4.870 XP/)).toBeVisible()

  overview.quests[2].completed = true
  overview.quests[2].currentProgress = 1
  overview.milestone.completedQuests = 3
  overview.milestone.allCompleted = true
  await page.getByRole('button', { name: 'Làm mới nhiệm vụ' }).click()
  await expect(page.getByRole('button', { name: 'Mở rương +100 EXP' })).toBeEnabled()
  // The final individual reward need not be claimed to open the chest.
  await page.getByRole('button', { name: 'Mở rương +100 EXP' }).click()
  await expect(page.getByText('Đã mở rương hôm nay', { exact: true })).toBeVisible()
  await expect(page.locator('.topbar .streak-pill')).toHaveText('6')
  await expect(page.locator('.dq-streak-status')).toContainText('Đã duy trì chuỗi hôm nay')
  assert.equal(chestCount, 1)
  await page.locator('.topbar-profile').click()
  await expect(page.locator('.profile-stat')).toContainText(['Chuỗi 6 ngày'])

  // A failed refresh preserves existing data; a failed initial load has retry UI.
  failLoad = true
  await page.goto(`${base}/dashboard`)
  await expect(page.getByText('Chưa tải được nhiệm vụ', { exact: true })).toBeVisible()
  failLoad = false
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.locator('.dq-task')).toHaveCount(3)
  failLoad = true
  await page.getByRole('button', { name: 'Làm mới nhiệm vụ' }).click()
  await expect(page.locator('.dq-message.error')).toContainText(
    'Không tải được nhiệm vụ thử nghiệm',
  )
  await expect(page.locator('.dq-task')).toHaveCount(3)

  failLoad = false
  overview = freshOverview()
  failClaim = true
  await page.getByRole('button', { name: 'Làm mới nhiệm vụ' }).click()
  await expect(page.getByRole('button', { name: 'Nhận 50 EXP: Kỹ sư ngôn từ' })).toBeVisible()
  await page.getByRole('button', { name: 'Nhận 50 EXP: Kỹ sư ngôn từ' }).click()
  await expect(page.locator('.dq-message.error')).toContainText(
    'Phần thưởng đã được nhận ở tab khác',
  )
  await expect(page.locator('.dq-claimed')).toHaveCount(1)

  overview = {
    ...freshOverview(),
    quests: [],
    milestone: {
      totalQuests: 0,
      completedQuests: 0,
      allCompleted: false,
      claimed: false,
      rewardXp: 100,
    },
  }
  await page.getByRole('button', { name: 'Làm mới nhiệm vụ' }).click()
  await expect(page.getByText('Trạm nhiệm vụ đang chuẩn bị', { exact: true })).toBeVisible()
  overview = freshOverview()
  overviewDelay = 600
  await page.reload()
  await expect(page.locator('.dq-loading')).toBeVisible()
  await expect(page.locator('.dq-task')).toHaveCount(3)
  overviewDelay = 0
  // A focus refresh reads server progress rather than incrementing it locally.
  overview.quests[2].completed = true
  overview.quests[2].currentProgress = 1
  overview.milestone = { ...overview.milestone, completedQuests: 3, allCompleted: true }
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('button', { name: 'Mở rương +100 EXP' })).toBeEnabled()

  const otherTab = await context.newPage()
  otherTab.on('pageerror', (error) => errors.push(error.message))
  await otherTab.goto(`${base}/dashboard`)
  await expect(otherTab.locator('.dq-task')).toHaveCount(3)
  overview.streak = { currentStreak: 9, longestStreak: 12, completedToday: true }
  profile = { ...profile, totalXp: 6000, level: 7, xpInLevel: 0 }
  await page.evaluate(() => localStorage.setItem('grammarquest:quests:901', crypto.randomUUID()))
  await expect(otherTab.locator('.topbar .streak-pill')).toHaveText('9')
  await expect(otherTab.locator('.home-stats').getByText(/6.000 XP/)).toBeVisible()
  await otherTab.close()
  assert.deepEqual(errors, [])
  console.log(
    'PASS: desktop/mobile, reward claims, chest, XP/streak sync, loading, retry, empty, failed claims, focus refresh and cross-tab sync. Screenshots: artifacts/daily-quests/',
  )
} finally {
  await context.close()
  await browser.close()
}
