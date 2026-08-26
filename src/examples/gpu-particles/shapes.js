import * as THREE from 'three'

/**
 * パーティクルの初期配置（＝目標形状）を Float の DataTexture に焼く。
 * RGB が位置、A は将来的な用途（固定粒子フラグなど）のための予約。
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 球殻上の一様分布。極が詰まらないよう cos で緯度を取る */
function sphere(rand, radius) {
  const theta = 2 * Math.PI * rand()
  const phi = Math.acos(2 * rand() - 1)
  const r = radius * (0.92 + rand() * 0.08)
  const s = Math.sin(phi)
  return [r * s * Math.cos(theta), r * Math.cos(phi), r * s * Math.sin(theta)]
}

/** 円盤。sqrt を取らないと中心に密集する */
function disc(rand, radius) {
  const t = 2 * Math.PI * rand()
  const r = Math.sqrt(rand()) * radius
  // 中心ほど厚く、外周ほど薄い
  const thickness = 0.16 * (1 - (r / radius) * 0.75)
  const y = (rand() + rand() + rand() - 1.5) * thickness
  return [r * Math.cos(t), y, r * Math.sin(t)]
}

/** 立方体の表面 */
function box(rand, radius) {
  const a = radius * 0.82
  const face = (rand() * 6) | 0
  const u = (rand() * 2 - 1) * a
  const v = (rand() * 2 - 1) * a
  if (face === 0) return [a, u, v]
  if (face === 1) return [-a, u, v]
  if (face === 2) return [u, a, v]
  if (face === 3) return [u, -a, v]
  if (face === 4) return [u, v, a]
  return [u, v, -a]
}

/** 二重らせん。他の形と見かけの大きさを揃えるため半径と高さを抑える */
function helix(rand, radius) {
  const strand = rand() < 0.5 ? 0 : Math.PI
  const t = rand()
  const turns = 4.2
  const a = t * turns * Math.PI * 2 + strand
  const r = radius * 0.78
  const jitter = 0.04
  return [
    Math.cos(a) * r + (rand() - 0.5) * jitter,
    (t - 0.5) * radius * 1.45 + (rand() - 0.5) * jitter,
    Math.sin(a) * r + (rand() - 0.5) * jitter,
  ]
}

const BUILDERS = { sphere, disc, box, helix }

export const SHAPES = Object.keys(BUILDERS)

/** shape 名と一辺のテクセル数から初期位置テクスチャを作る */
export function createShapeTexture(shape, side, radius = 1.15) {
  const build = BUILDERS[shape] || sphere
  const rand = makeRandom(0x9e3779b9)
  const count = side * side
  const data = new Float32Array(count * 4)

  for (let i = 0; i < count; i++) {
    const [x, y, z] = build(rand, radius)
    data[i * 4 + 0] = x
    data[i * 4 + 1] = y
    data[i * 4 + 2] = z
    data[i * 4 + 3] = 0
  }

  const tex = new THREE.DataTexture(data, side, side, THREE.RGBAFormat, THREE.FloatType)
  tex.needsUpdate = true
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return tex
}

/** インスタンスごとの属性（自分のテクセル座標と乱数） */
export function createInstanceAttributes(side) {
  const count = side * side
  const fboUv = new Float32Array(count * 2)
  const random = new Float32Array(count * 3)
  const rand = makeRandom(0x85ebca6b)

  for (let i = 0; i < count; i++) {
    const x = i % side
    const y = (i / side) | 0
    // テクセルの中心を指す
    fboUv[i * 2 + 0] = (x + 0.5) / side
    fboUv[i * 2 + 1] = (y + 0.5) / side
    random[i * 3 + 0] = rand()
    random[i * 3 + 1] = rand()
    random[i * 3 + 2] = rand()
  }

  return { count, fboUv, random }
}
