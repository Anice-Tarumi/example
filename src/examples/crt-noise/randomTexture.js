import * as THREE from 'three'

/**
 * 乱数テクスチャ。
 *
 * チャンネル切替や砂嵐の量を、毎フレーム乱数ではなく**焼いた乱数列**から引く。
 * 毎フレーム引くと間隔が制御できないし、CPU に前フレームの値を持つ必要も出る。
 * テクスチャなら位相（時間）を渡すだけで、状態を持たずに同じ列を読める。
 *
 * 中身は素の白ノイズでよい。**Linear 補間**で読むので、隣接テクセルの間が
 * 勝手に繋がり、時間で舐めると滑らかに上下する 1 次元の信号になる。
 * わざわざ値ノイズを CPU で組む必要はない。
 *
 * RGBA の 4 チャンネルは**独立した 4 本の乱数列**。
 * 「切替は .y、砂嵐は .x」のように用途を分けられる。
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function createRandomTexture(size = 256, seed = 0x51a7) {
  const rand = makeRandom(seed)
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < data.length; i++) data[i] = rand() * 255

  const tex = new THREE.DataTexture(data, size, size)
  // 時間で無限に舐めるので繰り返し必須
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  // Nearest だと段差のまま飛ぶ。補間して初めて連続した信号になる
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}
