import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import process from 'node:process'
import { chromium } from 'playwright-core'

const DEV_URL = 'http://127.0.0.1:4173'
const CHROME_PATH = '/usr/bin/google-chrome'

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Server is still booting.
    }
    await delay(250)
  }
  throw new Error(`Timed out waiting for dev server at ${url}`)
}

function spawnDevServer() {
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4173'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
    env: process.env,
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[vite] ${chunk}`)
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[vite] ${chunk}`)
  })

  return child
}

async function main() {
  const server = spawnDevServer()
  let browser

  try {
    await waitForServer(DEV_URL)

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
    })

    const page = await browser.newPage({ acceptDownloads: true })
    const pageErrors = []
    const consoleMessages = []

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })
    page.on('console', (message) => {
      consoleMessages.push({
        type: message.type(),
        text: message.text(),
      })
    })

    await page.goto(DEV_URL, { waitUntil: 'networkidle' })
    await page.click('#btn-load-sample')

    await page.waitForFunction(
      () => window.threeMotion?.state?.().hasModel === true,
      { timeout: 30_000 },
    )

    const initialState = await page.evaluate(() => window.threeMotion.state())

    const hdriCards = page.locator('#lighting-panel .hdri-card')
    await hdriCards.nth(1).click()
    await hdriCards.nth(2).click()
    await hdriCards.nth(0).click()

    const exposureSlider = page.locator('#lighting-panel input[type="range"]').first()
    await exposureSlider.fill('2.5')
    await exposureSlider.dispatchEvent('input')
    await exposureSlider.dispatchEvent('change')

    const exportPromise = page.waitForEvent('download')
    await page.click('#export-panel .export-btn')
    const download = await exportPromise

    const finalState = await page.evaluate(() => window.threeMotion.state())

    console.log(JSON.stringify({
      hasModelInitially: initialState.hasModel,
      finalHDRI: finalState.activeHDRI,
      finalExposure: finalState.exposure,
      exportSuggestedFilename: await download.suggestedFilename(),
      pageErrors,
      consoleMessages,
    }, null, 2))
  } finally {
    if (browser) {
      await browser.close()
    }
    server.kill('SIGTERM')
  }
}

await main()
