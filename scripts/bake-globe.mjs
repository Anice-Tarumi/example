/**
 * 地球儀の素材を焼く。
 *
 * 出力は 2 つ。
 *
 *   land-dots.bin  … 陸地の上だけに置いた点。単位球の座標を Int16 に量子化
 *   coastlines.json … 海岸線の折れ線。緯度経度のまま持つ
 *
 * 元データは Natural Earth の 110m 陸地ポリゴン（パブリックドメイン）。
 * 公開する例なので、他所のサイトが作った派生物は使わない。
 *
 *   node scripts/bake-globe.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/examples/hologram-globe/assets')

/** 撒く点の総数。陸に当たったものだけ残るので、実際はこの 3 割ほど */
const SAMPLES = 90000
/** 海岸線を間引く角度（度）。細かすぎると線が潰れて塊に見える */
const SIMPLIFY = 0.55

/** リング（経度緯度の列）を境界箱付きで持つ。全点判定は総当たりだと重い */
function toRings(geojson) {
  const rings = []
  for (const f of geojson.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const poly of polys) {
      // [0] が外周、以降は穴（湖）。穴も同じ判定に混ぜると内外が反転して抜ける
      poly.forEach((ring, i) => {
        let minX = 180
        let maxX = -180
        let minY = 90
        let maxY = -90
        for (const [x, y] of ring) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
        rings.push({ ring, hole: i > 0, minX, maxX, minY, maxY })
      })
    }
  }
  return rings
}

/** 交差数判定。境界箱で弾いてから数える */
function inside(rings, x, y) {
  let hit = false
  for (const r of rings) {
    if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) continue
    let c = false
    const pts = r.ring
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
    // 穴の中は陸ではない。外周と穴で打ち消し合わせる
    if (c) hit = r.hole ? false : true
  }
  return hit
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const res = await fetch(SRC)
if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
const rings = toRings(await res.json())
console.log(`rings: ${rings.length}`)

/*
 * 点は黄金角のらせんで撒く。緯度経度の格子で撒くと極に密集する。
 */
const pts = []
const golden = Math.PI * (3 - Math.sqrt(5))
for (let i = 0; i < SAMPLES; i++) {
  const y = 1 - (i / (SAMPLES - 1)) * 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const th = golden * i
  const x = Math.cos(th) * r
  const z = Math.sin(th) * r

  const lat = (Math.asin(y) * 180) / Math.PI
  /*
   * 経度の符号は `latLngToVec3` の逆写像に合わせる。**片方だけ符号が違うと、
   * 点と海岸線が東西反転して重ならない。** あちらは z = -cos(lat) sin(lng)。
   */
  const lng = (Math.atan2(-z, x) * 180) / Math.PI
  if (!inside(rings, lng, lat)) continue
  pts.push([x, y, z])
}
console.log(`land dots: ${pts.length} / ${SAMPLES}`)

/*
 * 並びを混ぜる。**らせんの順のままだと、前から N 個取ったときに
 * 南半球だけが残る。** 混ぜてあれば、どこで切っても全球に散る。
 */
const rand = mulberry32(0x51fe)
for (let i = pts.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[pts[i], pts[j]] = [pts[j], pts[i]]
}

// 単位球なので -1..1。Int16 に収めて容量を半分にする
const buf = new Int16Array(pts.length * 3)
pts.forEach(([x, y, z], i) => {
  buf[i * 3] = Math.round(x * 32767)
  buf[i * 3 + 1] = Math.round(y * 32767)
  buf[i * 3 + 2] = Math.round(z * 32767)
})

/** 角度で間引く。近すぎる点は落とす */
function simplify(ring) {
  const out = []
  let last = null
  for (const [x, y] of ring) {
    if (last && Math.abs(x - last[0]) < SIMPLIFY && Math.abs(y - last[1]) < SIMPLIFY) continue
    out.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100])
    last = [x, y]
  }
  // 閉じる。開いたままだと最後の一辺が抜ける
  if (out.length > 2) out.push(out[0])
  return out
}

const lines = rings.map((r) => simplify(r.ring)).filter((r) => r.length > 3)
console.log(`coastlines: ${lines.length} rings, ${lines.reduce((a, r) => a + r.length, 0)} points`)

mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/land-dots.bin`, Buffer.from(buf.buffer))
writeFileSync(`${OUT}/coastlines.json`, JSON.stringify(lines))
console.log('done')
