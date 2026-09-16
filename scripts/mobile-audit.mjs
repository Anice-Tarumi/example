/**
 * 実機幅で全 example を開いて、崩れを機械的に拾う。
 *
 *   npm run dev            # 別のターミナルで
 *   node scripts/mobile-audit.mjs [slug ...]
 *
 * 見るのは 5 つ。
 *
 *   1. 例外とコンソールエラー
 *   2. 横スクロール（`scrollWidth > clientWidth`）。**これが出たら即おかしい**
 *   3. leva パネルの占有率。画面の半分を覆っていたら操作にならない
 *   4. キャンバスの寸法。0 なら描いていない
 *   5. 平均輝度。真っ黒なら読み込みに失敗している可能性
 *
 * 目視は最後。**数字で落ちるものを先に落とす。**
 */

import { chromium, devices } from 'playwright'
import { readdirSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.env.AUDIT_OUT || `${ROOT}/.audit`
const BASE = process.env.AUDIT_BASE || 'http://localhost:5173'
const WAIT = Number(process.env.AUDIT_WAIT || 4000)

const phone = devices['iPhone 13']

const only = process.argv.slice(2)
const slugs = readdirSync(`${ROOT}/src/examples`)
  .filter((s) => !s.startsWith('_'))
  .filter((s) => existsSync(`${ROOT}/src/examples/${s}/meta.json`))
  .filter((s) => only.length === 0 || only.includes(s))

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const context = await browser.newContext({ ...phone })

/** 1 ページ分の計測 */
async function audit(path, name) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 100)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 100)) })

  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(WAIT)

    const m = await page.evaluate(() => {
      const d = document.documentElement
      /*
       * **画面と重なった面積**で測る。箱の寸法をそのまま使うと、外へ逃がした
       * 引き出しまで「覆っている」と数えてしまう。
       */
      const rect = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const vis = getComputedStyle(el)
        const hidden = vis.display === 'none' || vis.visibility === 'hidden' || +vis.opacity === 0
        const w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0))
        const h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0))
        return {
          w: Math.round(r.width), h: Math.round(r.height),
          x: Math.round(r.x), y: Math.round(r.y),
          area: hidden ? 0 : Math.round(w * h),
        }
      }
      const vw = window.innerWidth
      const vh = window.innerHeight
      const leva = rect('.stage__controls')
      const info = rect('.stage__info')
      return {
        vw,
        vh,
        overflowX: d.scrollWidth - d.clientWidth,
        canvas: rect('canvas'),
        levaPct: leva ? Math.round((leva.area / (vw * vh)) * 100) : 0,
        infoPct: info ? Math.round((info.area / (vw * vh)) * 100) : 0,
        // 画面外へ飛び出している要素（横方向）
        offRight: [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > vw + 2).length,
      }
    })

    await page.screenshot({ path: `${OUT}/${name}.png` })
    await page.close()
    return { name, ...m, errors }
  } catch (e) {
    await page.close()
    return { name, fail: String(e.message).slice(0, 80), errors }
  }
}

const rows = []
rows.push(await audit('/', 'lab'))
rows.push(await audit('/experiments', 'experiments'))
rows.push(await audit('/works', 'works'))
for (const slug of slugs) rows.push(await audit(`/experiments/${slug}`, slug))

await context.close()
await browser.close()

const bad = []
console.log('name                     canvas      横溢れ  leva%  info%  外へ  err')
for (const r of rows) {
  if (r.fail) {
    console.log(`${r.name.padEnd(24)} 失敗: ${r.fail}`)
    bad.push(r.name)
    continue
  }
  const canvas = r.canvas ? `${r.canvas.w}x${r.canvas.h}` : 'なし'
  const flag = r.overflowX > 0 || r.levaPct > 45 || r.offRight > 0 || r.errors.length > 0
  console.log(
    `${r.name.padEnd(24)} ${canvas.padEnd(11)} ${String(r.overflowX).padStart(5)}  ${String(r.levaPct).padStart(4)}  ${String(r.infoPct).padStart(5)}  ${String(r.offRight).padStart(3)}  ${String(r.errors.length).padStart(3)}${flag ? '  ←' : ''}`,
  )
  if (flag) bad.push(r.name)
}

console.log(`\n要確認 ${bad.length}/${rows.length}`)
if (bad.length) console.log(bad.join(' '))
for (const r of rows) {
  if (r.errors?.length) console.log(`\n[${r.name}] ${r.errors.slice(0, 2).join(' / ')}`)
}
