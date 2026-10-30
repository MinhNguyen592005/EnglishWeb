import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, channel: 'msedge' })
await mkdir('artifacts/role-views', { recursive: true })
try {
  for (const isHost of [true, false]) {
    const page = await browser.newPage({
      viewport: isHost ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
    })
    const user = {
      id: isHost ? 1 : 2,
      username: 'reporter',
      displayName: 'Người báo cáo',
      role: 'LEARNER',
      totalXp: 0,
      level: 1,
      xpInLevel: 0,
    }
    const room = {
      id: 7,
      code: 'ABC123',
      status: 'WAITING',
      stateVersion: 1,
      hostId: 1,
      guestId: 2,
      hostName: 'Alice',
      guestName: 'Bob',
      hostReady: false,
      guestReady: false,
      hostScore: 0,
      guestScore: 0,
      currentRound: 0,
      questionLimit: 10,
      isHost,
    }
    const reports = []
    const errors = []
    let attempts = 0
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('dialog', async (dialog) => {
      errors.push('Unexpected browser prompt')
      await dialog.dismiss()
    })
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      const data = path.endsWith('/auth/me')
        ? user
        : path.endsWith('/daily-quests')
          ? { quests: [], streak: { currentStreak: 0 }, milestone: {} }
          : path.endsWith('/notifications')
            ? { items: [], unreadCount: 0, hasMore: false }
            : []
      return route.fulfill({ json: data })
    })
    await page.routeWebSocket('**/api/ws-system', (ws) => {
      ws.onMessage((raw) => {
        const message = JSON.parse(raw)
        if (!message.requestId) return
        let action = 'ARENA_DATA'
        let payload = {}
        switch (message.action) {
          case 'ACCOUNT_GET':
            action = 'ACCOUNT_DATA'
            payload = user
            break
          case 'CLIENT_ACTIVITY':
            action = 'ACTIVITY_UPDATED'
            break
          case 'QUEUE_STATUS':
          case 'QUEUE_CANCEL':
            action = 'MATCHMAKING_UPDATE'
            payload = { status: 'IDLE' }
            break
          case 'ARENA_OPEN':
            payload = room
            break
          case 'ARENA_HISTORY':
          case 'ARENA_MESSAGES':
            payload = []
            break
          case 'REPORT_USER':
            reports.push(message.payload)
            attempts++
            action = attempts === 1 ? 'ERROR' : 'REPORT_DATA'
            payload =
              attempts === 1
                ? { message: 'Không thể gửi báo cáo. Hãy thử lại.' }
                : { id: 100, status: 'OPEN' }
            break
        }
        ws.send(JSON.stringify({ action, payload, requestId: message.requestId }))
      })
    })
    await page.goto(`${process.env.ARENA_UI_URL || 'http://127.0.0.1:5173'}/arena`)
    const open = page.getByRole('button', { name: 'Báo cáo đối thủ', exact: true })
    await open.click({ timeout: 15000 }).catch(async (error) => {
      console.error({
        errors,
        url: page.url(),
        body: (await page.locator('body').innerText()).slice(0, 2000),
      })
      throw error
    })
    const dialog = page.getByRole('dialog', { name: 'Báo cáo người chơi' })
    await dialog.waitFor()
    assert.match(await dialog.innerText(), new RegExp(isHost ? 'Bob' : 'Alice'))
    const submit = dialog.getByRole('button', { name: 'Gửi báo cáo', exact: true })
    assert.equal(await submit.isDisabled(), true)
    await dialog.getByRole('checkbox', { name: 'Ngôn ngữ xúc phạm, quấy rối' }).check()
    await dialog.getByRole('checkbox', { name: 'Gian lận, can thiệp trận đấu' }).check()
    const details = dialog.getByRole('textbox', { name: /Nội dung bổ sung/ })
    await details.fill('a'.repeat(500))
    assert.equal(await submit.isDisabled(), true)
    await details.fill('Đối thủ liên tục xúc phạm trong trận đấu.')
    await page.screenshot({
      path: `artifacts/role-views/arena-report-${isHost ? 'desktop' : 'mobile'}.png`,
    })
    await submit.click()
    await dialog
      .getByRole('alert')
      .filter({ hasText: 'Không thể gửi báo cáo. Hãy thử lại.' })
      .waitFor()
    assert.equal(await details.inputValue(), 'Đối thủ liên tục xúc phạm trong trận đấu.')
    assert.equal(
      await dialog.getByRole('checkbox', { name: 'Gian lận, can thiệp trận đấu' }).isChecked(),
      true,
    )
    await submit.click()
    await dialog.waitFor({ state: 'detached' })
    await page
      .getByRole('status')
      .filter({ hasText: 'Đã gửi báo cáo đối thủ cho quản trị viên.' })
      .waitFor()
    assert.equal(reports.length, 2)
    assert.deepEqual(reports[1], {
      targetId: isHost ? 2 : 1,
      contextType: 'ARENA',
      contextId: 7,
      reason:
        'Lý do: Ngôn ngữ xúc phạm, quấy rối; Gian lận, can thiệp trận đấu\nNội dung bổ sung: Đối thủ liên tục xúc phạm trong trận đấu.',
    })
    await open.click()
    assert.equal(
      await dialog.getByRole('checkbox', { name: 'Ngôn ngữ xúc phạm, quấy rối' }).isChecked(),
      false,
    )
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    await open.click()
    await dialog.getByRole('button', { name: 'Hủy', exact: true }).click()
    assert.equal(reports.length, 2)
    // A preset alone is enough; additional details are optional.
    await open.click()
    await dialog.getByRole('checkbox', { name: 'Spam hoặc quảng cáo' }).check()
    await submit.click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(reports[2].reason, 'Lý do: Spam hoặc quảng cáo')
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(
    'PASS: desktop/mobile, host/guest targets, multiple reasons, optional details, length validation, retry preserving draft, submit and cancel without browser prompts; socket mocked.',
  )
} finally {
  await browser.close()
}
