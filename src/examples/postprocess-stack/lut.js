import * as THREE from 'three'

/**
 * 3D LUT を手続き的に焼く。
 *
 * 本来は .cube を読み込むところだが、ファイルを持たせずに済むよう
 * グレードを関数で書いて 32³ の格子に評価する。
 * 出来上がりは実物の LUT と同じ形式なので、シェーダー側は差し替えるだけで
 * カラリストの .cube を受け取れる。
 *
 * 入力・出力とも**表示色空間（sRGB）の 0..1**。リニア値を入れてはいけない。
 */

export const LUT_SIZE = 32

const lerp = (a, b, t) => a + (b - a) * t
const sat = (x) => Math.min(1, Math.max(0, x))

/** 中間調を持ち上げ下げせずに端だけ締める S 字 */
function contrast(x, amount, pivot = 0.5) {
  return sat(pivot + (x - pivot) * amount)
}

function luma(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

/** 明部・暗部それぞれに色を寄せる。カラーグレードの基本操作 */
function splitTone(rgb, shadow, highlight, balance) {
  const l = luma(rgb[0], rgb[1], rgb[2])
  const hi = sat((l - balance) / Math.max(1 - balance, 1e-3))
  const lo = sat((balance - l) / Math.max(balance, 1e-3))
  return [
    sat(rgb[0] + shadow[0] * lo + highlight[0] * hi),
    sat(rgb[1] + shadow[1] * lo + highlight[1] * hi),
    sat(rgb[2] + shadow[2] * lo + highlight[2] * hi),
  ]
}

function saturate(rgb, amount) {
  const l = luma(rgb[0], rgb[1], rgb[2])
  return [sat(lerp(l, rgb[0], amount)), sat(lerp(l, rgb[1], amount)), sat(lerp(l, rgb[2], amount))]
}

const GRADES = {
  /** 素通し。LUT の有無を比べるための基準 */
  neutral: (r, g, b) => [r, g, b],

  /** 定番のティール & オレンジ。暗部を青緑に、明部を橙に振る */
  tealOrange: (r, g, b) => {
    let c = [contrast(r, 1.14), contrast(g, 1.12), contrast(b, 1.1)]
    c = splitTone(c, [-0.03, 0.02, 0.09], [0.09, 0.02, -0.06], 0.45)
    return saturate(c, 1.12)
  },

  /** ブリーチバイパス。彩度を落として硬いコントラストを掛ける */
  bleach: (r, g, b) => {
    let c = saturate([r, g, b], 0.42)
    c = [contrast(c[0], 1.42), contrast(c[1], 1.42), contrast(c[2], 1.38)]
    return splitTone(c, [0.01, 0.0, 0.02], [0.05, 0.04, 0.0], 0.5)
  },

  /** デイフォーナイト。全体を沈めて青に寄せ、明部だけ残す */
  night: (r, g, b) => {
    let c = [r * 0.62, g * 0.68, b * 0.86]
    c = splitTone(c, [0.0, 0.01, 0.07], [0.02, 0.03, 0.06], 0.42)
    c = [contrast(c[0], 1.2, 0.36), contrast(c[1], 1.2, 0.36), contrast(c[2], 1.16, 0.4)]
    return saturate(c, 0.82)
  },
}

export const LUT_NAMES = Object.keys(GRADES)

/**
 * グレードを 3D テクスチャに評価する。
 *
 * 補間はシェーダー側でテトラヘドラルにやるので、フィルタは Nearest。
 * Linear にすると三線形補間が二重に掛かって意味がなくなる。
 */
export function buildLut(name) {
  const grade = GRADES[name] || GRADES.neutral
  const n = LUT_SIZE
  const data = new Uint8Array(n * n * n * 4)

  let i = 0
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const out = grade(x / (n - 1), y / (n - 1), z / (n - 1))
        data[i++] = Math.round(sat(out[0]) * 255)
        data[i++] = Math.round(sat(out[1]) * 255)
        data[i++] = Math.round(sat(out[2]) * 255)
        data[i++] = 255
      }
    }
  }

  const tex = new THREE.Data3DTexture(data, n, n, n)
  tex.format = THREE.RGBAFormat
  tex.type = THREE.UnsignedByteType
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.wrapR = THREE.ClampToEdgeWrapping
  tex.unpackAlignment = 1
  tex.needsUpdate = true
  return tex
}
