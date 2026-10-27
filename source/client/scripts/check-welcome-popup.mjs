// Real registration fixtures. No production user is changed; every fixture is removed.
import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const base = process.env.STUDY_UI_BASE || 'http://127.0.0.1:5173'
const schema = process.env.STUDY_UI_DATABASE || 'grammar_quest'
if (schema !== 'grammar_quest' || !process.env.DB_USERNAME || !process.env.DB_PASSWORD)
  throw new Error('Load local development DB configuration first')
function sql(query) {
  const result = spawnSync(
    'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe',
    [
      `--user=${process.env.DB_USERNAME}`,
      `--host=${process.env.DB_HOST || 'localhost'}`,
      `--port=${process.env.DB_PORT || '3306'}`,
      `--database=${schema}`,
      '--default-character-set=utf8mb4',
      '--batch',
      '--raw',
      '--skip-column-names',
      `--execute=${query}`,
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    },
  )
  if (result.status !== 0) throw new Error('Could not access isolated popup fixture')
  return result.stdout.trim()
}
const browser = await chromium.launch({
  channel: process.env.UI_BROWSER_CHANNEL || 'msedge',
  headless: true,
})
await mkdir('artifacts/placement', { recursive: true })
try {
  // A fresh browser has no login session and must never reach placement content.
  const anonymous = await browser.newContext()
  try {
    anonymous.setDefaultTimeout(30000)
    anonymous.setDefaultNavigationTimeout(60000)
    const page = await anonymous.newPage(),
      placementCalls = []
    page.on('websocket', (ws) =>
      ws.on('framesent', (frame) => {
        try {
          const m = JSON.parse(frame.payload.toString())
          if (m.action?.startsWith('PLACEMENT_')) placementCalls.push(m.action)
        } catch {}
      }),
    )
    assert.equal((await anonymous.request.get(`${base}/api/v1/auth/me`)).status(), 401)
    let releaseSession
    const sessionGate = new Promise((resolve) => {
      releaseSession = resolve
    })
    await page.route('**/api/v1/auth/me', async (route) => {
      await sessionGate
      await route.continue()
    })
    try {
      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
      await page.locator('.state-card[role=status]').waitFor()
      assert.equal(
        await page.locator('.auth-page,.placement-shell').count(),
        0,
        'Wait for session verification before showing login or placement',
      )
    } finally {
      releaseSession()
    }
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor()
    await page.unroute('**/api/v1/auth/me')
    for (const path of ['/', '/placement', '/roadmap']) {
      await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForURL('**/login')
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor()
      assert.equal(await page.locator('.study-question,.placement-shell,dialog').count(), 0)
    }
    assert.deepEqual(placementCalls, [])
    console.log(
      'PASS access: anonymous root, placement and roadmap require login; no placement requests',
    )
  } finally {
    await anonymous.close()
  }
  for (const mode of ['confirm', 'skip', 'close', 'escape', 'backdrop', 'reload', 'login']) {
    const username = `popup_ui_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      password = 'PopupBrowser123!'
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: mode === 'skip' ? 'reduce' : 'no-preference',
    })
    context.setDefaultTimeout(30000)
    context.setDefaultNavigationTimeout(60000)
    let fixtureId
    try {
      const page = await context.newPage(),
        frames = [],
        bodies = [],
        errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('request', (request) => {
        if (request.postData()) bodies.push(request.postData())
      })
      page.on('websocket', (ws) =>
        ws.on('framesent', (frame) => {
          try {
            frames.push(JSON.parse(frame.payload.toString()))
          } catch {}
        }),
      )
      await page.goto(`${base}/register`, { waitUntil: 'domcontentloaded' })
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
      await page.getByLabel('Tên hiển thị', { exact: true }).fill('Popup test')
      await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Đăng ký', exact: true }).click()
      const popup = page.getByRole('dialog', {
        name: 'Chào mừng bạn đến với hành trình học tiếng Anh! 👋',
        exact: true,
      })
      await popup.waitFor()
      fixtureId = Number(sql(`SELECT id FROM users WHERE username='${username}'`))
      assert.ok(Number.isSafeInteger(fixtureId) && fixtureId > 0)
      const storage = () =>
        page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))
      const originalStorage = await storage()
      assert.equal(await popup.locator('input[type=radio]').count(), 3)
      assert.equal(
        await popup.getByRole('heading', { name: 'Bạn thuộc nhóm tuổi nào?', exact: true }).count(),
        1,
      )
      assert.equal(await popup.locator('input:not([type=radio]),textarea,select').count(), 0)
      const next = popup.getByRole('button', { name: 'Tiếp tục', exact: true })
      assert.equal(await next.isEnabled(), true)
      assert.equal(
        Number(sql(`SELECT COUNT(*) FROM study_entry_attempts WHERE user_id=${fixtureId}`)),
        0,
      )
      async function nextStep(title) {
        await next.click()
        await popup.getByRole('heading', { name: title, exact: true }).waitFor()
        await page.waitForFunction(
          () =>
            document.querySelector('.placement-welcome-step')?.getAttribute('data-phase') ===
            'idle',
        )
      }
      async function previousStep(title) {
        await popup.getByRole('button', { name: 'Quay lại', exact: true }).click()
        await popup.getByRole('heading', { name: title, exact: true }).waitFor()
        await page.waitForFunction(
          () =>
            document.querySelector('.placement-welcome-step')?.getAttribute('data-phase') ===
            'idle',
        )
      }
      if (mode === 'confirm') {
        // Native dialog traps focus; radio groups support arrows and remain independent.
        await popup
          .getByRole('button', { name: 'Đóng chào mừng và làm bài kiểm tra', exact: true })
          .focus()
        await page.keyboard.press('Shift+Tab')
        assert.equal(await next.evaluate((e) => e === document.activeElement), true)
        await page.keyboard.press('Tab')
        assert.equal(await popup.evaluate((e) => e.contains(document.activeElement)), true)
        await popup.getByRole('radio', { name: 'Dưới 18.', exact: true }).focus()
        await page.keyboard.press('Space')
        await page.keyboard.press('ArrowRight')
        assert.equal(
          await popup.getByRole('radio', { name: '18–24.', exact: true }).isChecked(),
          true,
        )
        // Rapid presses should advance only one page while the animation is active.
        await next.evaluate((button) => {
          button.click()
          button.click()
          button.click()
        })
        await popup
          .getByRole('heading', {
            name: 'Bạn thấy trình độ hiện tại của mình thế nào?',
            exact: true,
          })
          .waitFor()
        await page.waitForFunction(
          () =>
            document.querySelector('.placement-welcome-step')?.getAttribute('data-phase') ===
            'idle',
        )
        assert.equal(
          await popup
            .getByRole('heading', { name: 'Bạn dự định học bao lâu mỗi ngày?', exact: true })
            .count(),
          0,
        )
        await popup.getByText('Biết một chút.', { exact: true }).click()
        await nextStep('Bạn dự định học bao lâu mỗi ngày?')
        await popup.getByText('30–60 phút.', { exact: true }).click()
        await previousStep('Bạn thấy trình độ hiện tại của mình thế nào?')
        assert.equal(
          await popup.getByRole('radio', { name: 'Biết một chút.', exact: true }).isChecked(),
          true,
        )
        await previousStep('Bạn thuộc nhóm tuổi nào?')
        assert.equal(
          await popup.getByRole('radio', { name: '18–24.', exact: true }).isChecked(),
          true,
        )
        await popup.getByText('Từ 25 trở lên.', { exact: true }).click()
        assert.equal(await popup.locator('input:checked').count(), 1)
        assert.equal(
          await popup.getByRole('radio', { name: '18–24.', exact: true }).isChecked(),
          false,
        )
        assert.deepEqual(await storage(), originalStorage)
        assert.equal(
          frames.some((m) =>
            ['PLACEMENT_OPEN', 'PLACEMENT_ACCEPT', 'PLACEMENT_SAVE', 'PLACEMENT_SUBMIT'].includes(
              m.action,
            ),
          ),
          false,
        )
        await page.screenshot({ path: 'artifacts/placement/desktop-popup.png', fullPage: true })
        await nextStep('Bạn thấy trình độ hiện tại của mình thế nào?')
        await page.screenshot({
          path: 'artifacts/placement/desktop-popup-step2.png',
          fullPage: true,
        })
        await nextStep('Bạn dự định học bao lâu mỗi ngày?')
        assert.equal(
          await popup.getByRole('radio', { name: '30–60 phút.', exact: true }).isChecked(),
          true,
        )
        const confirm = popup.getByRole('button', {
          name: 'Xác nhận và làm bài kiểm tra',
          exact: true,
        })
        await page.setViewportSize({ width: 390, height: 480 })
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
        )
        const dimensions = await popup.evaluate((e) => ({
          scroll: e.scrollHeight,
          client: e.clientHeight,
          width: e.getBoundingClientRect().width,
          height: e.getBoundingClientRect().height,
        }))
        assert.ok(dimensions.scroll > dimensions.client)
        assert.ok(dimensions.width <= 390 && dimensions.height <= 480)
        await page.screenshot({ path: 'artifacts/placement/mobile-popup.png', fullPage: true })
        await confirm.scrollIntoViewIfNeeded()
        // Multiple synchronous click attempts must still create just one exam.
        await confirm.evaluate((button) => {
          button.click()
          button.click()
          button.click()
        })
      } else if (mode === 'skip') {
        assert.equal(await popup.locator('input:checked').count(), 0)
        await popup.getByRole('button', { name: 'Bỏ qua câu này', exact: true }).click()
        await popup
          .getByRole('heading', {
            name: 'Bạn thấy trình độ hiện tại của mình thế nào?',
            exact: true,
          })
          .waitFor()
        await page.waitForFunction(
          () =>
            document.querySelector('.placement-welcome-step')?.getAttribute('data-phase') ===
            'idle',
        )
        await nextStep('Bạn dự định học bao lâu mỗi ngày?')
        assert.equal(await popup.locator('input:checked').count(), 0)
        await popup
          .getByRole('button', { name: 'Xác nhận và làm bài kiểm tra', exact: true })
          .click()
      } else if (mode === 'close')
        await popup
          .getByRole('button', { name: 'Đóng chào mừng và làm bài kiểm tra', exact: true })
          .click()
      else if (mode === 'escape') await page.keyboard.press('Escape')
      else if (mode === 'backdrop') await page.mouse.click(2, 2)
      else if (mode === 'reload') await page.reload()
      else {
        // Leave while the popup is still open, then log in through a fresh page load.
        const csrf = await (await context.request.get(`${base}/api/v1/auth/csrf`)).json()
        assert.equal(
          (
            await context.request.post(`${base}/api/v1/auth/logout`, {
              headers: { 'X-XSRF-TOKEN': csrf.token },
            })
          ).status(),
          204,
        )
        await page.goto(`${base}/login`)
        await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
        await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
      }
      await page.locator('.study-question').nth(9).waitFor()
      assert.equal(await page.getByRole('dialog').count(), 0)
      assert.equal(
        Number(sql(`SELECT COUNT(*) FROM study_entry_attempts WHERE user_id=${fixtureId}`)),
        1,
      )
      assert.equal(
        sql(
          `SELECT onboarding_json IS NULL AND placement_accepted_at IS NULL FROM study_entry_profiles WHERE user_id=${fixtureId}`,
        ),
        '1',
      )
      assert.equal(sql(`SELECT display_name FROM users WHERE id=${fixtureId}`), 'Popup test')
      assert.equal(
        frames.some((m) => m.action === 'PLACEMENT_ACCEPT'),
        false,
      )
      for (const label of ['Từ 25 trở lên.', 'Biết một chút.', '30–60 phút.'])
        assert.equal(
          JSON.stringify(frames).includes(label) || bodies.some((body) => body.includes(label)),
          false,
        )
      assert.deepEqual(await storage(), originalStorage)
      const attempt = sql(`SELECT id FROM study_entry_attempts WHERE user_id=${fixtureId}`)
      await page.goto(`${base}/roadmap?planet=level-5`)
      await page.waitForURL('**/placement')
      await page.locator('.study-question').nth(9).waitFor()
      assert.equal(await page.getByRole('dialog').count(), 0)
      assert.equal(sql(`SELECT id FROM study_entry_attempts WHERE user_id=${fixtureId}`), attempt)
      if (mode === 'close') {
        // A restored authenticated cookie explains automatic return to an unfinished test.
        await page.goto(base, { waitUntil: 'domcontentloaded' })
        await page.waitForURL('**/placement')
        await page.locator('.study-question').nth(9).waitFor()
        await page
          .locator('.placement-account')
          .getByText('Đã đăng nhập', { exact: true })
          .waitFor()
        await page
          .locator('.placement-account')
          .getByText(`@${username}`, { exact: true })
          .waitFor()
        await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
        await page.waitForURL('**/login')
        assert.equal((await context.request.get(`${base}/api/v1/auth/me`)).status(), 401)
        await page.goto(`${base}/placement`, { waitUntil: 'domcontentloaded' })
        await page.waitForURL('**/login')
        assert.equal(await page.locator('.study-question,.placement-shell').count(), 0)
        await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
        await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
        await page.locator('.study-question').nth(9).waitFor()
        assert.equal(await page.getByRole('dialog').count(), 0)
        assert.equal(sql(`SELECT id FROM study_entry_attempts WHERE user_id=${fixtureId}`), attempt)
        console.log(
          'PASS access: restored session is identified; sign out revokes access; explicit login resumes exam',
        )
      }
      assert.deepEqual(errors, [])
      console.log(`PASS popup: ${mode}`)
    } finally {
      await context.close()
      if (!fixtureId) fixtureId = Number(sql(`SELECT id FROM users WHERE username='${username}'`))
      if (
        Number.isSafeInteger(fixtureId) &&
        fixtureId > 0 &&
        /^popup_ui_[a-f0-9]{12}$/.test(username)
      ) {
        assert.equal(
          Number(sql(`SELECT id FROM users WHERE id=${fixtureId} AND username='${username}'`)),
          fixtureId,
        )
        sql(
          `DELETE FROM study_entry_attempts WHERE user_id=${fixtureId}; DELETE FROM study_entry_profiles WHERE user_id=${fixtureId}; DELETE FROM study_attempts WHERE user_id=${fixtureId}; DELETE FROM study_progress WHERE user_id=${fixtureId}; DELETE FROM study_enrollments WHERE user_id=${fixtureId}; DELETE FROM users WHERE id=${fixtureId} AND username='${username}'`,
        )
      }
    }
  }
} finally {
  await browser.close()
}
