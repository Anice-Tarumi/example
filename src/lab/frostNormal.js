import * as THREE from 'three'

/**
 * 繰り返せる法線マップをその場で焼く。
 *
 * 本家の `GlobalComposite.fs` は、画面全体の UV を**繰り返しの法線マップ**で
 * ずらしている（`damaged_road_normal.png` を `uNormalScale = 3` で敷く）。
 * これが「ガラス越しに見ている」感じの正体で、無いと後処理がただの
 * 色補正になる。
 *
 * 配布物は使えないので計算で作る。要点は 2 つ。
 *
 *   1. **継ぎ目を作らない。** 端で値が合わないと、画面に格子状の線が出る。
 *      周期を持つ雑音（格子点を wrap させた値ノイズ）で作る
 *   2. **高さから法線を出す。** 法線を直接ばらまくと平面の凹凸にならない
 */

/** 周期 p で折り返す整数ハッシュ */
function hash(x, y, p) {
  const xi = ((x % p) + p) % p
  const yi = ((y % p) + p) % p
  let h = xi * 374761393 + yi * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967296
}

/** 周期を持つ値ノイズ。端が必ず繋がる */
function valueNoise(x, y, p) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi, p)
  const b = hash(xi + 1, yi, p)
  const c = hash(xi, yi + 1, p)
  const d = hash(xi + 1, yi + 1, p)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

function fbm(x, y, base) {
  let v = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < 4; i++) {
    v += valueNoise(x * freq, y * freq, base * freq) * amp
    amp *= 0.5
    freq *= 2
  }
  return v
}

export function bakeFrostNormal(size = 256, strength = 2.2) {
  const base = 8
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      height[y * size + x] = fbm((x / size) * base, (y / size) * base, base)
    }
  }

  const data = new Uint8Array(size * size * 4)
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 中央差分で傾きを取る。端も wrap して読むので継ぎ目が出ない
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}
