import { chromium } from 'playwright'

const url = process.argv[2]
const out = process.argv[3]

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 200)))
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// leva の select 要素を列挙する
const selects = await page.$$eval('select', (els) =>
  els.map((e, i) => ({
    i,
    value: e.value,
    options: [...e.options].map((o) => o.value),
  })),
)
console.log('SELECTS', JSON.stringify(selects, null, 1))

// leva の行ラベルを列挙して、表示が壊れていないか見る
const labels = await page.$$eval('#leva__root label, #leva__root [class*=label]', (els) =>
  [...new Set(els.map((e) => e.textContent.trim()).filter(Boolean))].slice(0, 40),
)
console.log('LABELS', JSON.stringify(labels))

// shape セレクト（2 番目）を helix に変えて反映されるか見る
const target = process.argv[4]
if (target) {
  const [idx, val] = target.split(':')
  await page.selectOption(`select >> nth=${idx}`, val)
  console.log('selected', idx, val)
  await page.waitForTimeout(3000)
  const after = await page.$$eval('select', (els) => els.map((e) => e.value))
  console.log('AFTER', JSON.stringify(after))
}

await page.screenshot({ path: out })
console.log('saved', out)
await browser.close()
