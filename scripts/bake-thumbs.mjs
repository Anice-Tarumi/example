/**
 * Home のカード用サムネイルを焼く。
 *
 * 開発サーバーを立てた状態で、各 example を実機で開いて撮る。
 *
 *   npm run dev            # 別のターミナルで
 *   node scripts/bake-thumbs.mjs [slug ...]
 *
 * 撮る前に**サイドバー・leva・説明札を隠す**。出したまま撮ると、カードの
 * 中がパネルだらけになって何の例か分からない。
 *
 * 待ち時間は example ごとに違う。焼き込みや読み込みがあるものは、既定の
 * 待ちでは真っ黒のまま撮れてしまう。`meta.json` の `thumb` で上書きする。
 *
 *   "thumb": { "wait": 6000, "hover": [0.5, 0.5], "scroll": 400, "variant": 2 }
 */

import { chromium } from 'playwright'
import { readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = `${ROOT}/src/assets/thumbs`
const BASE = process.env.THUMB_BASE || 'http://localhost:5174'

/** カードは 16:10。倍で撮って縮める */
const W = 1280
const H = 800
const DEFAULT_WAIT = 4000

/*
 * 撮影用に画面から消すもの。パネルが写るとカードが読めない。
 *
 * **サイドバーを `display: none` にしてはいけない。** 骨組みは
 * `grid-template-columns: var(--sidebar-w) 1fr` の 2 列で、サイドバーが
 * 消えると本体が 1 列目（幅 0）へ繰り上がり、**本体の幅が 0 になる**。
 * 列は残したまま、幅の変数を 0 にして中身を見えなくする。
 */
const HIDE_CSS = `
  :root { --sidebar-w: 0px !important; }
  .sidebar {
    visibility: hidden !important;
    width: 0 !important;
    min-width: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
  }
  .stage__controls, .stage__info { display: none !important; }
`

const only = process.argv.slice(2)
const slugs = readdirSync(`${ROOT}/src/examples`)
  .filter((s) => !s.startsWith('_'))
  .filter((s) => existsSync(`${ROOT}/src/examples/${s}/meta.json`))
  .filter((s) => only.length === 0 || only.includes(s))

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })

let ok = 0
for (const slug of slugs) {
  const meta = JSON.parse(readFileSync(`${ROOT}/src/examples/${slug}/meta.json`, 'utf8'))
  const hint = meta.thumb || {}
  const errors = []
  page.removeAllListeners('pageerror')
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))

  try {
    await page.goto(`${BASE}/examples/${slug}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.addStyleTag({ content: HIDE_CSS })
    // キャンバスが新しい幅に追いつくのを待つ。R3F は監視で気付く
    await page.waitForTimeout(500)

    /*
     * 変種を選べるようにしておく。既定が地味な例がある。
     * leva は隠してあるので、開く前に選んでから隠す…のではなく、
     * **隠す CSS は見た目だけ**なので、要素は生きていて選べる。
     */
    if (hint.variant != null) {
      const select = await page.$('.stage__controls select')
      if (select) await select.selectOption({ index: hint.variant })
    }

    if (hint.scroll) {
      const target = await page.$('.dws__scroll, .stage__canvas [data-scroll]')
      if (target) await target.evaluate((el, y) => el.scrollTo({ top: y, behavior: 'instant' }), hint.scroll)
      else await page.mouse.wheel(0, hint.scroll)
    }

    // 触れていないと何も起きない例がある。既定で中央に置く
    const [hx, hy] = hint.hover || [0.5, 0.5]
    await page.mouse.move(W * hx, H * hy)
    await page.waitForTimeout(hint.wait ?? DEFAULT_WAIT)
    // 少し動かす。静止したままだと軌跡や速度が 0 の例がある
    await page.mouse.move(W * hx + 40, H * hy + 24, { steps: 12 })
    await page.waitForTimeout(400)

    /*
     * ページ全体ではなく**本体の要素だけ**を撮る。ページを撮ると、
     * 隠した領域のぶんだけ余白が入る。
     */
    const main = await page.$('.shell__main')
    await (main || page).screenshot({ path: `${OUT}/${slug}.jpg`, type: 'jpeg', quality: 84 })
    ok++
    console.log(`${errors.length ? '!' : ' '} ${slug}${errors.length ? `  [${errors.length} error] ${errors[0]}` : ''}`)
  } catch (e) {
    console.log(`x ${slug}  ${String(e.message).slice(0, 120)}`)
  }
}

await browser.close()
console.log(`\n${ok}/${slugs.length} 枚`)
