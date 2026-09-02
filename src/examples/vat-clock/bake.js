import * as THREE from 'three'
import { glyphCells, GLYPH_W, GLYPH_H } from '../../shared/bitFont'

/**
 * 数字 0〜9 の「散った状態 → その数字の形」を焼く。
 *
 * 桁が変わるたびに物理を回すやり方だと、桁数を増やしただけ費用が増える。
 * 時計は同じ変形を延々と繰り返すので、**焼いて再生する**のが噛み合う。
 * 再生は頂点シェーダーがテクスチャを引くだけなので、桁を増やしても変わらない。
 *
 * **散った状態は全数字で共通にする。** 数字ごとに別々の散り方を焼くと、
 * 逆再生から順再生へ移る瞬間に破片が飛ぶ。
 */

export const DIGITS = 10
export const FRAMES = 48
/** 1 数字あたりの破片の上限。5×7 の数字で最大 19 */
export const PIECES = 20

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 破片が散った状態。数字をまたいで共通 */
function scatterPose(rand) {
  const out = []
  for (let i = 0; i < PIECES; i++) {
    const a = rand() * Math.PI * 2
    const r = 2.4 + rand() * 2.6
    out.push({
      pos: new THREE.Vector3(
        Math.cos(a) * r,
        Math.sin(a) * r * 0.7,
        (rand() - 0.5) * 3.4,
      ),
      quat: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rand() * 7, rand() * 7, rand() * 7),
      ),
    })
  }
  return out
}

const easeOut = (t) => 1 - (1 - t) ** 3

/**
 * 位置と姿勢を 2 枚のテクスチャへ。
 *
 * 横 = 破片、縦 = 数字 × フレーム。
 * 位置のアルファに「この破片が使われているか」を入れる。数字ごとに
 * 点灯セルの数が違うので、余った破片は畳んでおく必要がある。
 */
export function bakeDigits(seed = 0x2ba7) {
  const rand = makeRandom(seed)
  const scatter = scatterPose(rand)

  const rowCount = DIGITS * FRAMES
  const pos = new Float32Array(PIECES * rowCount * 4)
  const rot = new Float32Array(PIECES * rowCount * 4)

  const tmpQ = new THREE.Quaternion()
  const idQ = new THREE.Quaternion()

  for (let d = 0; d < DIGITS; d++) {
    const cells = glyphCells(String(d))
    for (let f = 0; f < FRAMES; f++) {
      const t = FRAMES > 1 ? f / (FRAMES - 1) : 1
      const e = easeOut(t)
      const row = d * FRAMES + f

      for (let p = 0; p < PIECES; p++) {
        const i = (row * PIECES + p) * 4
        const cell = cells[p]
        const s = scatter[p]

        if (!cell) {
          // 使わない破片。散った位置に置いたまま畳む
          pos[i] = s.pos.x; pos[i + 1] = s.pos.y; pos[i + 2] = s.pos.z; pos[i + 3] = 0
          rot[i] = s.quat.x; rot[i + 1] = s.quat.y; rot[i + 2] = s.quat.z; rot[i + 3] = s.quat.w
          continue
        }

        // 目標は文字の点灯セル。左上原点なので y を反転して中央へ寄せる
        const tx = cell[0] - (GLYPH_W - 1) / 2
        const ty = (GLYPH_H - 1) / 2 - cell[1]

        // 弧を描いて寄る。直線だと束になって刺さるように見える
        const arc = Math.sin(t * Math.PI) * 0.9
        pos[i] = s.pos.x + (tx - s.pos.x) * e
        pos[i + 1] = s.pos.y + (ty - s.pos.y) * e + arc
        pos[i + 2] = s.pos.z + (0 - s.pos.z) * e
        pos[i + 3] = 1

        // 姿勢は散った向きから正面へ
        tmpQ.copy(s.quat).slerp(idQ, e)
        rot[i] = tmpQ.x; rot[i + 1] = tmpQ.y; rot[i + 2] = tmpQ.z; rot[i + 3] = tmpQ.w
      }
    }
  }

  const make = (data) => {
    const tex = new THREE.DataTexture(data, PIECES, rowCount, THREE.RGBAFormat, THREE.FloatType)
    // 破片もフレームも段で持つ。補間させると隣の数字と混ざる
    tex.minFilter = tex.magFilter = THREE.NearestFilter
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.needsUpdate = true
    return tex
  }

  return { position: make(pos), rotation: make(rot), pieces: PIECES, frames: FRAMES, digits: DIGITS }
}
