import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('../artifacts/legacy/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Đăng nhập' }).waitFor()
    await page.screenshot({ path: `${output}login-${name}.png`, fullPage: true })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    if (overflow) throw new Error(`Horizontal overflow at ${width}px`)
    console.log(`${name}: login visible, no horizontal overflow`)
    await page.close()
  }
} finally {
  await browser.close()
}
