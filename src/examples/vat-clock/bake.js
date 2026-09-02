import * as THREE from 'three'
import { glyphCells, GLYPH_W, GLYPH_H } from '../../shared/bitFont'

/**
 * 数字 0〜9 の「粒の並び」を焼く。
 *
 * 焼くのは**到達点だけ**。途中の経過は焼かない。
 *
 * 経過まで焼くと「散った状態 → その数字」しか再生できず、桁が変わるたびに
 * 一度バラバラになる。**数字から数字へ直接寄せたい**なら、両端の並びを持って
 * 頂点シェーダーで混ぜるほうが素直で、テクスチャも 10 行で済む。
 */

export const DIGITS = 10

/** 1 桁あたりの粒子数。点群なので数万でも描ける */
export const DEFAULT_PIECES = 12000

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * テクスチャの横幅。
 *
 * 粒を横一列に並べると、数万個で幅が上限を超えてテクスチャの生成が黙って
 * 失敗する。全部が原点に落ちて、桁ごとに 1 点しか見えなくなる。
 * **折り返して 2 次元に詰める。**
 */
export const TEX_W = 512

/**
 * 位置をテクスチャへ。数字ごとに `ceil(粒数 / 幅)` 行を使う。
 *
 * 粒ごとの「セル内のどこに入るか」は**数字をまたいで固定**する。
 * 数字ごとに振り直すと、混ぜている最中に粒が入れ替わってざわつく。
 */
export function bakeDigits(pieces = DEFAULT_PIECES, seed = 0x2ba7) {
  const rand = makeRandom(seed)

  const jitter = []
  for (let i = 0; i < pieces; i++) {
    jitter.push({
      x: (rand() - 0.5) * 0.92,
      y: (rand() - 0.5) * 0.92,
      z: (rand() - 0.5) * 0.5,
      size: 0.6 + rand() * 0.8,
    })
  }

  const rowsPerDigit = Math.ceil(pieces / TEX_W)
  const height = rowsPerDigit * DIGITS
  const data = new Float32Array(TEX_W * height * 4)

  for (let d = 0; d < DIGITS; d++) {
    const cells = glyphCells(String(d))
    for (let p = 0; p < pieces; p++) {
      const row = d * rowsPerDigit + Math.floor(p / TEX_W)
      const i = (row * TEX_W + (p % TEX_W)) * 4
      const j = jitter[p]
      /*
       * 粒はセルへ**巡回で割り当てる**。セル数は数字ごとに違う
       * （8 は 17、1 は 10）が、巡回ならどの数字でも全部の粒が使われ、
       * 密度も揃う。余らせて畳む処理も要らない。
       */
      const cell = cells[p % cells.length]
      data[i] = cell[0] - (GLYPH_W - 1) / 2 + j.x
      // 字形は左上原点。y を反転して中央へ寄せる
      data[i + 1] = (GLYPH_H - 1) / 2 - cell[1] + j.y
      data[i + 2] = j.z
      data[i + 3] = j.size
    }
  }

  const tex = new THREE.DataTexture(data, TEX_W, height, THREE.RGBAFormat, THREE.FloatType)
  // 粒も数字も段で持つ。補間させると隣の粒や隣の数字と混ざる
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true

  return { texture: tex, pieces, digits: DIGITS, width: TEX_W, height, rowsPerDigit }
}
