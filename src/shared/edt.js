/**
 * 厳密なユークリッド距離変換（Felzenszwalb）。
 *
 * 1 次元の変換を行と列に 2 回掛けるだけで、近似ではない厳密な距離が O(n) で出る。
 * SDF フォントアトラス、マスクからのベベル生成、メッシュの SDF 焼きなど、
 * 「マスクから滑らかな距離場を作る」場面で共通に使う。
 */

/**
 * 距離変換の「無限遠」。**`Infinity` を使ってはいけない。**
 * 行がまるごと未確定のとき `Infinity - Infinity = NaN` になり、
 * 以降が全部 NaN に伝播してテクスチャが真っ黒になる。
 */
export const EDT_INF = 1e20

/** Felzenszwalb の 1 次元距離変換。f は二乗距離、結果も二乗距離 */
export function edt1d(f, d, v, z, n) {
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  let k = 0

  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }

  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

/** 1 次元変換の作業領域。使い回して確保を避ける */
export function createEdtScratch(size) {
  return {
    f: new Float64Array(size),
    d: new Float64Array(size),
    v: new Int32Array(size),
    z: new Float64Array(size + 1),
  }
}

/** 2 次元。行 → 列の順に 1 次元変換を掛ける。grid は二乗距離で入出力 */
export function edt2d(grid, w, h, scratch = createEdtScratch(Math.max(w, h))) {
  const { f, d, v, z } = scratch
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]
    edt1d(f, d, v, z, w)
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]
    edt1d(f, d, v, z, h)
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]
  }
  return grid
}

/**
 * 二値マスクから「内側の境界までの距離（px）」を出す。
 * マスクの外は 0。ベベルを作るのに使う。
 */
export function insideDistance(mask, w, h, scratch) {
  const grid = new Float64Array(w * h)
  for (let i = 0; i < grid.length; i++) grid[i] = mask[i] ? EDT_INF : 0
  edt2d(grid, w, h, scratch)
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(grid[i])
  return out
}
