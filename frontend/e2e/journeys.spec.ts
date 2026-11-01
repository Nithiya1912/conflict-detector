import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, who: 'Clinician' | 'Administrator' = 'Clinician') {
  await page.goto('/login?demo=1')
  await page.getByRole('button', { name: new RegExp(who) }).first().click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Health Intelligence Overview' })).toBeVisible()
}

test('landing page presents the project and routes to the demo', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('b', { hasText: 'Detecting Silent Drug–Diet–Lifestyle Conflicts' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Together')
  await page.getByRole('link', { name: 'Explore Demo' }).first().click()
  await expect(page).toHaveURL(/login\?demo=1/)
  await expect(page.getByText('Local demonstration mode')).toBeVisible()
})

test('protected routes redirect to login and validation errors show', async ({ page }) => {
  await page.goto('/app/cases')
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Email is required')).toBeVisible()
})

test('analyse a case end-to-end and validate a finding', async ({ page }) => {
  await login(page)
  // create a new synthetic case with two notes via the analysis workflow
  await page.goto('/app/analysis')
  await page.getByRole('button', { name: 'Generate demo case' }).click()
  await expect(page.getByText('Step 2 · Instruction sources')).toBeVisible()
  await page.getByRole('button', { name: 'Add specialist note' }).click()
  await page.getByLabel('Specialist name or role').fill('Dr. E2E')
  await page.getByLabel('Note title').fill('E2E cardiology')
  await page.getByLabel('Note content').fill('Continue warfarin 5 mg once daily.')
  await expect(page.getByText('Extraction preview')).toBeVisible()
  await expect(page.locator('b', { hasText: 'warfarin' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Add note' }).click()
  await page.getByRole('button', { name: 'Add specialist note' }).click()
  await page.getByLabel('Specialist name or role').fill('Dr. E2E Ortho')
  await page.getByLabel('Note title').fill('E2E knee pain')
  await page.getByLabel('Note content').fill('Start ibuprofen 400 mg three times daily.')
  await page.getByRole('button', { name: 'Add note' }).click()

  await page.getByRole('button', { name: 'Run analysis' }).click()
  await expect(page.getByRole('main').getByText('Analysis complete')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Preparing clinician review')).toBeVisible()
  await expect(page.getByText('Anticoagulant combined with antiplatelet/NSAID').first()).toBeVisible()

  // open the full evidence trace
  await page.getByRole('button', { name: 'Full evidence trace' }).first().click()
  await expect(page.getByRole('heading', { name: 'Severity calculation' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Human validation decision' })).toBeVisible()

  // record a decision
  await page.getByRole('button', { name: 'Confirm conflict' }).click()
  await page.getByRole('button', { name: 'Record decision' }).click()
  await expect(page.getByText('Decision recorded')).toBeVisible()
  await expect(page.getByText('Confirmed').first()).toBeVisible({ timeout: 5000 })
})

test('run the 20 test sessions and the ablation study', async ({ page }) => {
  await login(page)
  await page.goto('/app/tests')
  await page.getByRole('button', { name: 'Run all 20' }).click()
  await expect(page.getByText(/Executed 20 session/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('20/20')).toBeVisible()
  await page.goto('/app/evaluation')
  await page.getByRole('button', { name: 'Run ablation study' }).first().click()
  await expect(page.getByText('Ablation study complete')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('cell', { name: 'Single-document baseline' })).toBeVisible()
  await expect(page.getByText('True positive')).toBeVisible()
})

test('knowledge graph renders stored entities @mobile', async ({ page }) => {
  await login(page)
  await page.goto('/app/graph')
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 })
  expect(await page.locator('.react-flow__node').count()).toBeGreaterThan(10)
})
