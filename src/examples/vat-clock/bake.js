import * as THREE from 'three'

/**
 * 数字とコロンの「粒の並び」を焼く。
 *
 * 字形はビットフォントではなく**実際の字**から取る。5×7 の点で作ると、
 * どれだけ粒を増やしてもセグメント表示の角ばった形にしかならない。
 * 一度キャンバスへ描いて、塗られている画素の中から粒の行き先を拾う。
 *
 * 焼くのは**到達点だけ**。経過まで焼くと「散った状態 → その字」しか
 * 再生できず、桁が変わるたびに一度バラける。両端の並びだけ持って
 * 頂点シェーダーで混ぜれば、字から字へ直接寄せられる。
 */

/** 0〜9 とコロン。コロンも同じ仕組みで置く */
export const GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':']
export const COLON_INDEX = 10

/**
 * テクスチャの横幅。
 *
 * 粒を横一列に並べると、数万個で幅が上限を超えてテクスチャの生成が黙って
 * 失敗する。全部が原点に落ちて、桁ごとに 1 点しか見えなくなる。
 * **折り返して 2 次元に詰める。**
 */
export const TEX_W = 512

/** 字を置く枠。以前のビットフォントと同じ大きさに合わせてある */
const UNIT_W = 5
const UNIT_H = 7

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 1 字ぶんの塗られている画素を拾う */
function glyphPixels(ch, res = 128) {
  const w = Math.round(res * (UNIT_W / UNIT_H))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = res
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, w, res)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  /*
   * 字体は環境のサンセリフに任せる。**キャンバスは未読み込みのフォントを
   * 黙って代替する**ので、特定の書体を当てにするなら読み込み完了を待つ必要が
   * ある。数字の輪郭を粒で埋めるだけなので、そこまでの精度は要らない。
   */
  if (ch === ':') {
    /*
     * コロンだけは字ではなく円で描く。
     * 書体によって四角い点だったり細かったりして、環境ごとに形が変わる。
     * 2 つの丸は自分で描いたほうが確実。
     */
    const r = res * 0.075
    for (const cy of [res * 0.36, res * 0.66]) {
      ctx.beginPath()
      ctx.arc(w / 2, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.font = `600 ${Math.round(res * 0.82)}px "Helvetica Neue", Arial, sans-serif`
    ctx.fillText(ch, w / 2, res * 0.52)
  }

  const px = ctx.getImageData(0, 0, w, res).data
  const out = []
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 128) out.push([x, y])
    }
  }
  return { pixels: out, w, h: res }
}

/**
 * 位置をテクスチャへ。字ごとに `ceil(粒数 / 幅)` 行を使う。
 *
 * 粒の「その字の中での相対位置」は**字をまたいで同じ順**にする。
 * 字ごとに割り当てを振り直すと、混ぜている最中に粒が入れ替わってざわつく。
 */
export function bakeGlyphs(pieces, seed = 0x2ba7) {
  const rand = makeRandom(seed)

  // 粒ごとに固定の「面積の何割目か」と揺らぎ。字が変わっても使い回す
  const pick = new Float32Array(pieces)
  const jx = new Float32Array(pieces)
  const jy = new Float32Array(pieces)
  const jz = new Float32Array(pieces)
  const size = new Float32Array(pieces)
  for (let i = 0; i < pieces; i++) {
    pick[i] = rand()
    jx[i] = (rand() - 0.5) * 1.6
    jy[i] = (rand() - 0.5) * 1.6
    jz[i] = (rand() - 0.5) * 0.45
    size[i] = 0.6 + rand() * 0.8
  }

  const rowsPerGlyph = Math.ceil(pieces / TEX_W)
  const height = rowsPerGlyph * GLYPHS.length
  const data = new Float32Array(TEX_W * height * 4)

  GLYPHS.forEach((ch, g) => {
    const { pixels, w, h } = glyphPixels(ch)
    const n = pixels.length || 1
    for (let p = 0; p < pieces; p++) {
      const row = g * rowsPerGlyph + Math.floor(p / TEX_W)
      const i = (row * TEX_W + (p % TEX_W)) * 4

      const [gx, gy] = pixels[Math.min(n - 1, Math.floor(pick[p] * n))] ?? [w / 2, h / 2]
      // 画素 → 枠の座標。y は上下が逆
      data[i] = ((gx + 0.5 + jx[p]) / w - 0.5) * UNIT_W
      data[i + 1] = (0.5 - (gy + 0.5 + jy[p]) / h) * UNIT_H
      data[i + 2] = jz[p]
      data[i + 3] = size[p]
    }
  })

  const tex = new THREE.DataTexture(data, TEX_W, height, THREE.RGBAFormat, THREE.FloatType)
  // 粒も字も段で持つ。補間させると隣の粒や隣の字と混ざる
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true

  return { texture: tex, pieces, width: TEX_W, height, rowsPerGlyph }
}
