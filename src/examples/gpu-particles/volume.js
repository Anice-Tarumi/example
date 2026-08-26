import * as THREE from 'three'

/**
 * 吸着先のボリューム。
 *
 * 元実装（igloo）は VDB を焼いた 3D テクスチャを読み、
 *   RGB = 表面への勾配（0..1 に詰めたもの）
 *   A   = 符号付き距離（0.5 が表面）
 * という形式で持っている。ここでは VDB を持たないので、
 * 同じ形式を手続き SDF から生成する。中身が同じなら仕組みはそのまま動く。
 */

const SIZE = 48

// ---- SDF ----

function sdSphere(x, y, z, r) {
  return Math.hypot(x, y, z) - r
}

function sdTorus(x, y, z, R, r) {
  const q = Math.hypot(x, z) - R
  return Math.hypot(q, y) - r
}

function sdRoundBox(x, y, z, b, r) {
  const qx = Math.abs(x) - b
  const qy = Math.abs(y) - b
  const qz = Math.abs(z) - b
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  const oz = Math.max(qz, 0)
  const outside = Math.hypot(ox, oy, oz)
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0)
  return outside + inside - r
}

/** 3 軸のカプセルを重ねた十字 */
function sdCross(x, y, z, r) {
  const a = Math.hypot(y, z) - r
  const b = Math.hypot(x, z) - r
  const c = Math.hypot(x, y) - r
  return Math.min(a, Math.min(b, c))
}

/** ねじれたトーラス。表面が複雑なので吸着の挙動が見やすい */
function sdTwist(x, y, z, R, r) {
  const a = Math.atan2(z, x)
  const k = Math.sin(a * 3 + y * 4) * 0.06
  const q = Math.hypot(x, z) - R
  return Math.hypot(q, y) - (r + k)
}

const FIELDS = {
  sphere: (x, y, z) => sdSphere(x, y, z, 0.62),
  torus: (x, y, z) => sdTorus(x, y, z, 0.5, 0.2),
  box: (x, y, z) => sdRoundBox(x, y, z, 0.42, 0.1),
  cross: (x, y, z) => sdCross(x, y, z, 0.17),
  twist: (x, y, z) => sdTwist(x, y, z, 0.48, 0.16),
}

export const VOLUMES = Object.keys(FIELDS)

const cache = new Map()

/**
 * SDF を 3D テクスチャに焼く。勾配は中心差分。
 * texel の中心が [-1, 1] の立方体に収まるようにサンプルする。
 */
export function getVolumeTexture(name) {
  if (cache.has(name)) return cache.get(name)

  const f = FIELDS[name] || FIELDS.sphere
  const data = new Uint8Array(SIZE * SIZE * SIZE * 4)
  const h = 1.5 / SIZE

  let i = 0
  for (let z = 0; z < SIZE; z++) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const px = (x / (SIZE - 1)) * 2 - 1
        const py = (y / (SIZE - 1)) * 2 - 1
        const pz = (z / (SIZE - 1)) * 2 - 1

        const d = f(px, py, pz)

        // 表面へ向かう向き（内側からも外側からも表面を指す）
        let gx = f(px + h, py, pz) - f(px - h, py, pz)
        let gy = f(px, py + h, pz) - f(px, py - h, pz)
        let gz = f(px, py, pz + h) - f(px, py, pz - h)
        const len = Math.hypot(gx, gy, gz) || 1
        gx /= len
        gy /= len
        gz /= len

        data[i++] = Math.round((gx * 0.5 + 0.5) * 255)
        data[i++] = Math.round((gy * 0.5 + 0.5) * 255)
        data[i++] = Math.round((gz * 0.5 + 0.5) * 255)
        // 距離は [-0.5, 0.5] を [0, 1] に詰める。読み出し側で戻す
        data[i++] = Math.round(THREE.MathUtils.clamp(d + 0.5, 0, 1) * 255)
      }
    }
  }

  const tex = new THREE.Data3DTexture(data, SIZE, SIZE, SIZE)
  tex.format = THREE.RGBAFormat
  tex.type = THREE.UnsignedByteType
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.wrapR = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true

  cache.set(name, tex)
  return tex
}

export function disposeVolumes() {
  for (const t of cache.values()) t.dispose()
  cache.clear()
}

/** テクスチャ一辺のテクセル数。元実装と同じ丸め方 */
export function getTextureSize(count) {
  return Math.max(Math.ceil(Math.sqrt(count) / 4) * 4, 4)
}

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * 初期位置。元実装は円柱状の領域に撒いて、そこから表面へ吸い寄せる。
 * position.w は wrap diffuse の陰影値として使われるので 0.5 で初期化する。
 */
export function createInitialData(side, radius = 0.5, height = 0.34) {
  const count = side * side
  const pos = new Float32Array(count * 4)
  const vel = new Float32Array(count * 4)
  const rand = makeRandom(0x2545f491)

  for (let i = 0; i < count; i++) {
    const t = 2 * Math.PI * rand()
    const r = Math.sqrt(rand()) * radius
    pos[i * 4 + 0] = Math.cos(t) * r
    pos[i * 4 + 1] = (rand() * 2 - 1) * height
    pos[i * 4 + 2] = Math.sin(t) * r
    pos[i * 4 + 3] = 0.5
  }

  const posTex = new THREE.DataTexture(pos, side, side, THREE.RGBAFormat, THREE.FloatType)
  posTex.needsUpdate = true
  posTex.minFilter = THREE.NearestFilter
  posTex.magFilter = THREE.NearestFilter

  const velTex = new THREE.DataTexture(vel, side, side, THREE.RGBAFormat, THREE.FloatType)
  velTex.needsUpdate = true
  velTex.minFilter = THREE.NearestFilter
  velTex.magFilter = THREE.NearestFilter

  return { count, posTex, velTex }
}

/** インスタンス（点）ごとのテクセル座標と乱数 */
export function createPointAttributes(side) {
  const count = side * side
  const texuv = new Float32Array(count * 2)
  const rand = new Float32Array(count * 4)
  const r = makeRandom(0xc2b2ae35)

  for (let i = 0; i < count; i++) {
    texuv[i * 2 + 0] = ((i % side) + 0.5) / side
    texuv[i * 2 + 1] = (((i / side) | 0) + 0.5) / side
    rand[i * 4 + 0] = r()
    rand[i * 4 + 1] = r()
    rand[i * 4 + 2] = r()
    rand[i * 4 + 3] = r()
  }

  return { count, texuv, rand }
}
