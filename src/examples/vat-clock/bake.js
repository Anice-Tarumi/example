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
/**
 * 1 桁あたりの粒子数。
 *
 * 点灯セルは最大 19 個しかないが、**1 セルに 1 個だとブロックの寄せ集め**に
 * しか見えない。セルの中へ何十個も散らして初めて「粒が集まって字になる」。
 */
export const PIECES = 288

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * 粒子が散った状態。数字をまたいで共通。
 *
 * **遠くへ飛ばさない。** 環状に散らすと切り替えのたびに字が消えて、
 * 時計として読めなくなる。字の枠より少しだけ広い箱の中に散らす程度にすると、
 * 崩れている最中も「その桁に何かある」ことが保たれる。
 *
 * 粒ごとに大きさと遅れも持たせる。全部が同じ速さで同じ大きさだと、
 * 集まる瞬間が一枚の板に見えて雲にならない。
 */
function scatterPose(rand, spread = 1) {
  const out = []
  // 字の枠は 5×7。そこへ余白を少し足した箱に収める
  const bx = (GLYPH_W / 2 + 0.9) * spread
  const by = (GLYPH_H / 2 + 0.7) * spread
  for (let i = 0; i < PIECES; i++) {
    out.push({
      pos: new THREE.Vector3(
        (rand() - 0.5) * 2 * bx,
        (rand() - 0.5) * 2 * by,
        (rand() - 0.5) * 2.2 * spread,
      ),
      quat: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rand() * 7, rand() * 7, rand() * 7),
      ),
      size: 0.6 + rand() * 0.7,
      lag: rand() * 0.3,
      // セルの中のどこへ入るか。粒ごとに固定しないと毎フレーム震える
      jx: (rand() - 0.5) * 0.86,
      jy: (rand() - 0.5) * 0.86,
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
export function bakeDigits(spread = 1, seed = 0x2ba7) {
  const rand = makeRandom(seed)
  const scatter = scatterPose(rand, spread)

  const rowCount = DIGITS * FRAMES
  const pos = new Float32Array(PIECES * rowCount * 4)
  const rot = new Float32Array(PIECES * rowCount * 4)

  const tmpQ = new THREE.Quaternion()
  const idQ = new THREE.Quaternion()

  for (let d = 0; d < DIGITS; d++) {
    const cells = glyphCells(String(d))
    for (let f = 0; f < FRAMES; f++) {
      const t = FRAMES > 1 ? f / (FRAMES - 1) : 1
      const row = d * FRAMES + f

      for (let p = 0; p < PIECES; p++) {
        const i = (row * PIECES + p) * 4
        const s = scatter[p]

        /*
         * 粒は点灯セルへ**巡回で割り当てる**。
         * セル数は数字ごとに違う（8 は 17、1 は 10）が、巡回なら
         * どの数字でも全部の粒が使われ、密度も自然に揃う。
         */
        const cell = cells[p % cells.length]
        // 目標は文字の点灯セル。左上原点なので y を反転して中央へ寄せる
        const tx = cell[0] - (GLYPH_W - 1) / 2 + s.jx
        const ty = (GLYPH_H - 1) / 2 - cell[1] + s.jy

        // 粒ごとに遅れる。全部が同時に着くと一枚の板に見える
        const local = Math.min(1, Math.max(0, (t - s.lag) / (1 - s.lag)))
        const le = easeOut(local)

        // 弧を描いて寄る。直線だと束になって刺さるように見える
        const arc = Math.sin(local * Math.PI) * 0.35 * spread
        pos[i] = s.pos.x + (tx - s.pos.x) * le
        pos[i + 1] = s.pos.y + (ty - s.pos.y) * le + arc
        pos[i + 2] = s.pos.z + (0 - s.pos.z) * le
        // 大きさを w に持たせる。散っている間は少し小さく
        pos[i + 3] = s.size * (0.65 + 0.35 * le)

        // 姿勢は散った向きから正面へ
        tmpQ.copy(s.quat).slerp(idQ, le)
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
