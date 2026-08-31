import * as THREE from 'three'

/**
 * 切り口を作るためのテクスチャ。3 チャンネルに別々の役割を持たせる。
 *
 *   R … 割れ目（Worley の F2 - F1）。切り口の形そのもの
 *   G … 中周波ノイズ。切り口の前後で画を押しのける量
 *   B … 低周波ノイズ。切り取り線の傾きを揺らす
 *
 * igloo は実写のテクスチャを読んでいるが、ここは外部アセットを持たないので手続きで作る。
 * **役割ごとに周波数を変えるのが肝**で、1 枚のノイズを使い回すと
 * 割れ目・押しのけ・傾きが全部同じ形になって、平坦な演出になる。
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** タイル可能な特徴点を作る。端で繋がらないと切り口に継ぎ目が出る */
function makeCells(n, rand) {
  const pts = new Float32Array(n * n * 2)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 2
      pts[i] = (x + rand()) / n
      pts[i + 1] = (y + rand()) / n
    }
  }
  return pts
}

/** Worley。F2 - F1 が割れ目状になる */
function worley(px, py, pts, n) {
  let f1 = 10
  let f2 = 10
  const cx = Math.floor(px * n)
  const cy = Math.floor(py * n)

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = (cx + ox + n) % n
      const gy = (cy + oy + n) % n
      const i = (gy * n + gx) * 2

      // タイル境界をまたぐ距離を測る
      let dx = pts[i] - px
      let dy = pts[i + 1] - py
      if (dx > 0.5) dx -= 1
      if (dx < -0.5) dx += 1
      if (dy > 0.5) dy -= 1
      if (dy < -0.5) dy += 1

      const d = Math.hypot(dx, dy)
      if (d < f1) {
        f2 = f1
        f1 = d
      } else if (d < f2) {
        f2 = d
      }
    }
  }
  return f2 - f1
}

/** 周期を持つ値ノイズ。タイル可能 */
function makeValueNoise(n, rand) {
  const g = new Float32Array(n * n)
  for (let i = 0; i < g.length; i++) g[i] = rand()
  return (px, py) => {
    const fx = px * n
    const fy = py * n
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const wrap = (v) => ((v % n) + n) % n
    const at = (x, y) => g[wrap(y) * n + wrap(x)]
    const a = at(x0, y0)
    const b = at(x0 + 1, y0)
    const c = at(x0, y0 + 1)
    const d = at(x0 + 1, y0 + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
}

export function createScrollTexture({ size = 256, cells = 9, seed = 0x4c17 } = {}) {
  const rand = makeRandom(seed)
  const pts = makeCells(cells, rand)
  const midNoise = makeValueNoise(16, rand)
  const lowNoise = makeValueNoise(4, rand)

  const data = new Uint8Array(size * size * 4)
  let i = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size

      // 割れ目。細い線を残したいので少し持ち上げてから締める
      let crack = worley(u, v, pts, cells) * 3.2
      crack = Math.min(1, Math.max(0, crack))
      crack = Math.pow(crack, 0.75)

      // 中周波。2 オクターブ重ねる
      const mid = 0.65 * midNoise(u, v) + 0.35 * midNoise(u * 2.3 + 0.31, v * 2.3 + 0.77)
      const low = lowNoise(u, v)

      data[i++] = Math.round(crack * 255)
      data[i++] = Math.round(Math.min(1, Math.max(0, mid)) * 255)
      data[i++] = Math.round(Math.min(1, Math.max(0, low)) * 255)
      data[i++] = 255
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  // 数値として読むので sRGB 変換を掛けない
  tex.colorSpace = THREE.NoColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}
