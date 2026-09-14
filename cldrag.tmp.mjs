import { chromium } from 'playwright'
const [out, tag, thick] = process.argv.slice(2)
const br = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await br.newPage({ viewport:{width:1280,height:800} })
p.on('console', m => { if (m.type()==='error') console.log(m.text().slice(0,140)) })
await p.goto('http://localhost:5173/examples/cloth-xpbd', { waitUntil:'networkidle' })
await p.waitForTimeout(4000)
if (thick === '0') {
  // self collide を 0 にする（比較用）
  await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.stage__controls div')]
    return rows.length
  })
}
// 中央を掴んで大きく振り回す
const cx = 640, cy = 400
await p.mouse.move(cx, cy); await p.mouse.down()
for (const [x,y] of [[cx+240,cy-120],[cx-260,cy+40],[cx+300,cy+140],[cx-150,cy-160],[cx+120,cy+200]]) {
  await p.mouse.move(x, y, { steps: 18 }); await p.waitForTimeout(120)
}
await p.mouse.move(cx+40, cy-40, { steps: 20 })
await p.waitForTimeout(1500)
await p.mouse.up()
await p.waitForTimeout(1200)
await p.screenshot({ path: `${out}/drag_${tag}.png` })
await br.close()
