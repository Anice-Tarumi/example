import { chromium } from 'playwright'

const url = process.argv[2]
const out = process.argv[3]
const hover = process.argv[4] === 'hover'
const waitMs = Number(process.argv[5] || 1500)
// Retina 相当で撮る用。等倍だとテクスチャの解像度不足を見落とす
const dpr = Number(process.argv[6] || 1)

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr })

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
  // 大きめのストロークを描く。撫でた軌跡が要る演出の確認用
  const rx = box.width * 0.22
  const ry = box.height * 0.22
  for (let i = 0; i < 90; i++) {
    const t = (i / 90) * Math.PI * 4
    await page.mouse.move(cx + Math.sin(t * 0.7) * rx, cy + Math.sin(t * 1.1 + 0.6) * ry)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(waitMs)
} else {
  await page.waitForTimeout(waitMs)
}

await page.screenshot({ path: out })
console.log('saved', out)
await browser.close()
