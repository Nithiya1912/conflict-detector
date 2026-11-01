// Captures screenshots of key pages for visual review: node e2e/screens.mjs <outDir>
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'screens'
const base = 'http://127.0.0.1:5173'
const browser = await chromium.launch()
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 })
  await page.goto(`${base}/`)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${out}/${name}-landing.png`, fullPage: name === 'desktop' })
  await page.goto(`${base}/login?demo=1`)
  await page.getByRole('button', { name: /Clinician/ }).first().click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/app')
  for (const p of ['', 'validation', 'evaluation', 'graph', 'cases/CASE-1001', 'diet-plans', 'tests']) {
    await page.goto(`${base}/app/${p}`)
    await page.waitForTimeout(1700)
    await page.screenshot({ path: `${out}/${name}-${p.replace('/', '_') || 'dashboard'}.png`, fullPage: name === 'desktop' && p === '' })
  }
  await page.close()
}
await browser.close()
