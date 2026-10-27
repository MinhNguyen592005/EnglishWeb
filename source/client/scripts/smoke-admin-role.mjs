import { chromium, request } from '@playwright/test'

const password = process.env.DEMO_PASSWORD
if (!password) throw new Error('DEMO_PASSWORD is required')

const baseURL = 'http://127.0.0.1:5173'
const api = await request.newContext({ baseURL })
try {
  const csrf = (await (await api.get('/api/v1/auth/csrf')).json()).token
  const login = await api.post('/api/v1/auth/login', {
    data: { username: 'admin_demo', password },
    headers: { 'X-XSRF-TOKEN': csrf },
  })
  if (login.status() !== 200) throw new Error(`Admin login failed: ${login.status()}`)
  for (const path of [
    '/admin/overview',
    '/teacher/overview',
    '/teacher/questions',
    '/lessons',
    '/classes',
    '/arena/mine',
  ]) {
    const response = await api.get(`/api/v1${path}`)
    const expected = path === '/admin/overview' ? 200 : 403
    if (response.status() !== expected)
      throw new Error(`${path}: ${response.status()}, expected ${expected}`)
  }
  for (const [path, data] of [
    ['/classes', { name: 'Denied' }],
    ['/arena/rooms', {}],
  ]) {
    const response = await api.post(`/api/v1${path}`, { data, headers: { 'X-XSRF-TOKEN': csrf } })
    if (response.status() !== 403) throw new Error(`${path}: ${response.status()}, expected 403`)
  }
} finally {
  await api.dispose()
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`${baseURL}/login`)
  await page.locator('#username').fill('admin_demo')
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForURL('**/admin')
  const menu = await page
    .getByRole('navigation', { name: 'Điều hướng chính' })
    .locator('a')
    .allTextContents()
  if (menu.length !== 1 || !menu[0].includes('Quản trị'))
    throw new Error(`Unexpected admin menu: ${JSON.stringify(menu)}`)
  for (const path of ['/teacher', '/dashboard', '/classes', '/arena']) {
    await page.goto(`${baseURL}${path}`)
    await page.waitForURL('**/admin')
  }
} finally {
  await browser.close()
}

console.log('PASS: admin can manage and cannot use teacher or learner activities')
