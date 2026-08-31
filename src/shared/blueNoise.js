import * as THREE from 'three'

/**
 * ブルーノイズを void-and-cluster 法で生成する。
 *
 * ディザや、効果の量を画素ごとにばらつかせる用途では**ブルーノイズを使う**。
 * 交互勾配ノイズ（IGN, Jimenez 2014）は安いが、
 * `fract(52.98 * fract(0.0671x + 0.00584y))` という線形式なので構造を持つ。
 * Bart Wronski の計測でも「hatching パターンが見える」「パターンは依然として目立ち、
 * エイリアスし得る」とされている。**量そのものに掛けると画面に縞として出る。**
 *
 * ブルーノイズは低周波成分を持たないので、同じ用途でも構造が見えない。
 * 生成は 64×64 で数十ミリ秒。一度作れば使い回せる。
 *
 * 手順（Ulichney 1993）:
 *   1. 疎な二値パターンから始め、最密クラスタを最大ボイドへ移し続けて安定させる
 *   2. そこから点を抜きながら順位を下へ振る
 *   3. 点を足しながら順位を上へ振る
 *   4. 順位を 0..1 に正規化する
 *
 * 「最密クラスタ」「最大ボイド」はガウシアンで畳み込んだエネルギー場の最大・最小。
 * 点を 1 つ足し引きするたびに場を差分更新するので、全走査し直さない。
 */

const SIGMA = 1.9

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 巡回するガウシアン核。端で繋がらないとタイルしたとき継ぎ目が出る */
function buildKernel(n) {
  const r = Math.min(Math.floor(n / 2), 7)
  const size = r * 2 + 1
  const k = new Float32Array(size * size)
  let i = 0
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      k[i++] = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA))
    }
  }
  return { k, r, size }
}

export function generateBlueNoise(n = 64, seed = 0x1f3b) {
  const rand = makeRandom(seed)
  const total = n * n
  const { k, r } = buildKernel(n)

  const binary = new Uint8Array(total)
  const energy = new Float32Array(total)

  const splat = (idx, sign) => {
    const cx = idx % n
    const cy = (idx / n) | 0
    let ki = 0
    for (let dy = -r; dy <= r; dy++) {
      const y = (((cy + dy) % n) + n) % n
      for (let dx = -r; dx <= r; dx++) {
        const x = (((cx + dx) % n) + n) % n
        energy[y * n + x] += sign * k[ki++]
      }
    }
  }

  // 1. 初期二値パターン。10% ほど点を置く
  const initial = Math.max(1, Math.round(total * 0.1))
  let placed = 0
  while (placed < initial) {
    const idx = Math.floor(rand() * total) % total
    if (binary[idx]) continue
    binary[idx] = 1
    splat(idx, 1)
    placed++
  }

  const tightestCluster = () => {
    let best = -1
    let bestE = -Infinity
    for (let i = 0; i < total; i++) {
      if (binary[i] && energy[i] > bestE) {
        bestE = energy[i]
        best = i
      }
    }
    return best
  }

  const largestVoid = () => {
    let best = -1
    let bestE = Infinity
    for (let i = 0; i < total; i++) {
      if (!binary[i] && energy[i] < bestE) {
        bestE = energy[i]
        best = i
      }
    }
    return best
  }

  // 最密クラスタを最大ボイドへ移し続ける。同じ位置に戻ったら安定
  for (let guard = 0; guard < total * 4; guard++) {
    const c = tightestCluster()
    binary[c] = 0
    splat(c, -1)
    const v = largestVoid()
    if (v === c) {
      binary[c] = 1
      splat(c, 1)
      break
    }
    binary[v] = 1
    splat(v, 1)
  }

  const rank = new Int32Array(total).fill(-1)
  const snapshot = binary.slice()

  // 2. 点を抜きながら順位を下へ
  let count = placed
  for (let i = count - 1; i >= 0; i--) {
    const c = tightestCluster()
    binary[c] = 0
    splat(c, -1)
    rank[c] = i
  }

  // 3. 元に戻してから、点を足しながら順位を上へ
  binary.set(snapshot)
  energy.fill(0)
  for (let i = 0; i < total; i++) if (binary[i]) splat(i, 1)

  for (let i = count; i < total; i++) {
    const v = largestVoid()
    binary[v] = 1
    splat(v, 1)
    rank[v] = i
  }

  // 4. 0..255 へ
  const data = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    data[i] = Math.min(255, Math.max(0, Math.round((rank[i] / (total - 1)) * 255)))
  }
  return { data, size: n }
}

/** そのまま three のテクスチャにする。数値として読むので色空間変換は掛けない */
export function createBlueNoiseTexture(n = 64, seed = 0x1f3b) {
  const { data, size } = generateBlueNoise(n, seed)
  const rgba = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = data[i]
    rgba[i * 4 + 1] = data[(i * 7 + 13) % (size * size)]
    rgba[i * 4 + 2] = data[(i * 11 + 29) % (size * size)]
    rgba[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.colorSpace = THREE.NoColorSpace
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}
