import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

// Serve the production build to verify lazy loading and authentication recovery together.
const server = createServer(async (req, res) => {
  try {
    const path = req.url.startsWith('/assets/') ? req.url.split('?')[0] : '/index.html'
    const body = await readFile(new URL(`../dist${path}`, import.meta.url))
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html')
    res.end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ headless: true, channel: process.env.UI_BROWSER_CHANNEL || 'msedge' })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let available = false
  await page.route('**/api/v1/auth/me', route => route.fulfill({
    status: available ? 401 : 503, contentType: 'application/json',
    body: JSON.stringify({ code: available ? 'UNAUTHENTICATED' : 'UNAVAILABLE', message: 'Temporary outage' })
  }))
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard`)
  await page.getByRole('alert').waitFor()
  assert.equal(new URL(page.url()).pathname, '/dashboard')
  available = true
  await page.getByRole('alert').getByRole('button').click()
  await page.waitForURL('**/login')
  await page.locator('#username').waitFor()
  await page.goto(`http://127.0.0.1:${server.address().port}/register`)
  await page.locator('#display-name').waitFor()
  assert.deepEqual(errors, [])
  console.log('Authentication recovery and lazy route checks passed')
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
