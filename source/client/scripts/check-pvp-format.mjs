import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const page = await context.newPage()
const errors = [],
  actions = []
page.on('pageerror', (e) => errors.push(e.message))
const profile = {
  id: 1,
  username: 'alice',
  displayName: 'Minh Anh',
  role: 'LEARNER',
  level: 3,
  totalXp: 2500,
  xpInLevel: 500,
  pvpElo: 1200,
  pvpWins: 8,
  pvpLosses: 3,
  pvpDraws: 1,
  equippedFrame: 'FRAME_SILVER',
}
const stats = {
  elo: 1200,
  rank: 8,
  rankTier: 'SILVER',
  rankTitle: 'Bac',
  wins: 8,
  losses: 3,
  draws: 1,
}
const leaders = Array.from({ length: 3 }, (_, i) => ({
  userId: i + 1,
  rank: i + 1,
  displayName: ['Minh Anh', 'Bao Ngoc', 'Hoang Nam'][i],
  elo: 1200 - i * 10,
  peakElo: 1250,
  rankTitle: 'Silver',
  rankTier: 'SILVER',
  rankColorClass: 'rank-silver',
  equippedFrame: 'FRAME_SILVER',
  wins: 8,
  losses: 3,
  draws: 1,
  winRate: 67,
  totalMatches: 12,
  winStreak: 2,
  bestWinStreak: 4,
}))
const frames = [
  {
    code: 'FRAME_SILVER',
    type: 'FRAME',
    name: 'Silver Orbit',
    description: 'Reach 1100 ELO to unlock this frame.',
    cssClass: 'frame-silver',
    unlocked: true,
    equipped: true,
  },
  {
    code: 'FRAME_GOLD',
    type: 'FRAME',
    name: 'Solar Gold',
    description: 'Reach 1300 ELO to unlock this frame.',
    cssClass: 'frame-gold',
    unlocked: false,
    equipped: false,
    currentProgress: 1250,
    unlockThreshold: 1300,
  },
]
const cosmetics = {
  items: [
    ...frames,
    {
      code: 'BADGE_FIRST_WIN',
      type: 'BADGE',
      name: 'First Victory',
      description: 'Win your first PvP match.',
      cssClass: 'badge-first-win',
      unlocked: true,
      equipped: false,
      icon: 'Swords',
    },
  ],
  equippedFrame: 'FRAME_SILVER',
  profile,
}
let failCosmetics = false
await context.route('**/api/v1/**', (route) => {
  const path = new URL(route.request().url()).pathname
  if (path.endsWith('/arena/cosmetics'))
    return failCosmetics
      ? route.fulfill({ status: 503, json: { message: 'Fixture unavailable' } })
      : route.fulfill({ json: cosmetics })
  return route.fulfill({
    json: path.endsWith('/auth/me')
      ? profile
      : { streak: { currentStreak: 3 }, quests: [], milestone: {} },
  })
})
await context.routeWebSocket('**/api/ws-system', (socket) =>
  socket.onMessage((raw) => {
    const m = JSON.parse(String(raw))
    actions.push(m.action)
    if (!m.requestId) return
    let data = {}
    if (m.action === 'ARENA_HISTORY') data = []
    if (m.action === 'ARENA_LEADERBOARD') data = { myStats: stats, leaders, tiers: [] }
    if (m.action === 'ARENA_COSMETICS' || m.action === 'ARENA_EQUIP_COSMETIC') data = cosmetics
    if (m.action.startsWith('QUEUE_'))
      data = {
        status: m.action === 'QUEUE_JOIN' ? 'WAITING' : 'IDLE',
        queuedAt: Date.now(),
        allowedGap: 0,
        allowedEloGap: 150,
      }
    const action = m.action.startsWith('QUEUE_')
      ? 'MATCHMAKING_UPDATE'
      : m.action.startsWith('ARENA_')
        ? 'ARENA_DATA'
        : 'ACTIVITY_UPDATED'
    socket.send(JSON.stringify({ action, requestId: m.requestId, payload: data }))
  }),
)
try {
  await mkdir('artifacts/pvp', { recursive: true })
  await page.goto('http://localhost:5173/arena')
  await expect(page.locator('.pvp-match-main')).toBeVisible()
  await expect(page.locator('.pvp-record')).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/pvp/desktop.png', fullPage: true })
  await page.locator('.pvp-match-action button').click()
  await expect(page.locator('.pvp-queue-status')).toBeVisible()
  await page.locator('.pvp-match-action button').click()
  if (!actions.includes('QUEUE_JOIN') || !actions.includes('QUEUE_CANCEL'))
    throw Error('Queue controls broken')
  await page.getByRole('tab').nth(1).click()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page.screenshot({ path: 'artifacts/pvp/leaderboard.png', fullPage: true })
  await page.getByRole('tab').nth(2).click()
  await expect(page.locator('.pvp-cosmetic-card')).toHaveCount(3)
  await page.screenshot({ path: 'artifacts/pvp/cosmetics.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/pvp/cosmetics-mobile.png', fullPage: true })
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    throw Error('Cosmetic overflow')
  await page.getByRole('tab').first().click()
  await page.screenshot({ path: 'artifacts/pvp/mobile.png', fullPage: true })
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    throw Error('Arena overflow')
  await page.getByRole('tab').nth(1).click()
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    throw Error('Leaderboard overflow')
  failCosmetics = true
  await page.getByRole('tab').nth(2).click()
  await expect(page.locator('.pvp-cosmetics-error')).toBeVisible()
  failCosmetics = false
  await page.locator('.pvp-cosmetics-error button').click()
  await expect(page.locator('.pvp-cosmetics-error')).toHaveCount(0)
  await expect(page.locator('.pvp-cosmetic-card')).toHaveCount(3)
  if (errors.length) throw Error(errors.join('\n'))
  console.log('PASS: profile, matchmaking join/cancel, leaderboard, cosmetics, mobile layout')
} finally {
  await browser.close()
}
