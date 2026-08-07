import { chromium } from 'playwright'

const url = process.argv[2]
const out = process.argv[3]
const hover = process.argv[4] === 'hover'
const waitMs = Number(process.argv[5] || 1500)

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

page.on('console', (m) => console.log(`[console:${m.type()}]`, m.text().slice(0, 300)))
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const canvas = await page.$('canvas')
if (!canvas) {
  console.log('!! canvas not found')
} else if (hover) {
  const box = await canvas.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.waitForTimeout(200)
  // 微小に動かして pointermove を継続的に発火させる
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(cx + Math.sin(i) * 6, cy + Math.cos(i) * 6)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(waitMs)
} else {
  await page.waitForTimeout(waitMs)
}

await page.screenshot({ path: out })
console.log('saved', out)
await browser.close()
