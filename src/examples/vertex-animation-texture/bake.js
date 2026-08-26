import * as THREE from 'three'

/**
 * 破砕アニメを事前計算して Float テクスチャに焼く。
 *
 * VAT の要点は「重い計算を実行時にやらない」こと。ここでは全フレームぶんの
 * 破片の位置と姿勢を CPU で一度だけ回し、
 *
 *   position テクスチャ : rgb = xyz
 *   orient   テクスチャ : rgba = quaternion
 *
 * の 2 枚（幅 = 破片数、高さ = フレーム数）へ詰める。
 * 実行時の GPU 側は (piece, frame) で引いて 2 フレーム補間するだけになる。
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * 壁をグリッドに割って破片を作る。
 * 実物は Voronoi で不規則に割るが、ここは格子に揺らぎを足して代用する。
 */
export function createPieces(cols, rows, width, height, seed = 0x51ce) {
  const rand = makeRandom(seed)
  const pieces = []

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const w = width / cols
      const h = height / rows
      const cx = -width / 2 + w * (x + 0.5)
      const cy = -height / 2 + h * (y + 0.5)

      pieces.push({
        // 破片の中心（＝静止時の位置）
        origin: new THREE.Vector3(cx, cy, 0),
        // 大きさに揺らぎを付けて格子感を消す
        size: new THREE.Vector3(
          w * (0.94 + rand() * 0.08),
          h * (0.94 + rand() * 0.08),
          w * (0.14 + rand() * 0.16),
        ),
        rand: [rand(), rand(), rand(), rand()],
      })
    }
  }
  return pieces
}

const MODES = {
  /** 中心から放射状に吹き飛ぶ */
  explode: (p, r) => {
    const dir = p.origin.clone().normalize()
    return {
      velocity: new THREE.Vector3(
        dir.x * (1.3 + r[0] * 1.5),
        dir.y * (1.3 + r[1] * 1.5) + 0.8,
        (0.4 + r[2] * 1.5),
      ),
      spin: new THREE.Vector3(r[0] - 0.5, r[1] - 0.5, r[2] - 0.5).multiplyScalar(6),
      gravity: -6.5,
    }
  },
  /** その場で崩れ落ちる */
  collapse: (p, r) => ({
    velocity: new THREE.Vector3((r[0] - 0.5) * 0.7, r[1] * 0.3, (r[2] - 0.5) * 0.7),
    spin: new THREE.Vector3(r[0] - 0.5, r[1] - 0.5, r[2] - 0.5).multiplyScalar(3.2),
    gravity: -9.2,
  }),
  /** Y 軸まわりに巻き上がる */
  swirl: (p, r) => {
    const tangent = new THREE.Vector3(-p.origin.y, p.origin.x, 0).normalize()
    return {
      velocity: tangent.multiplyScalar(1.5 + r[0] * 1.3).add(
        new THREE.Vector3(0, 1.1 + r[1] * 1.1, 0.3 + r[2] * 0.8),
      ),
      spin: new THREE.Vector3(r[0] - 0.5, 1.0, r[2] - 0.5).multiplyScalar(7),
      gravity: -3.4,
    }
  },
}

export const SHATTER_MODES = Object.keys(MODES)

/**
 * 全フレームぶんを回して DataTexture 2 枚に焼く。
 * frames は「焼くフレーム数」で、実行時のフレームレートとは無関係。
 */
export function bakeShatter({ pieces, frames, fps = 30, mode = 'explode', floorY = -1.4, hold = 0.16 }) {
  const build = MODES[mode] || MODES.explode
  const count = pieces.length
  // 最初の数フレームは壁のまま止めておく。いきなり散ると「何が砕けたか」が見えない
  const holdFrames = Math.max(1, Math.floor(frames * hold))

  const posData = new Float32Array(count * frames * 4)
  const oriData = new Float32Array(count * frames * 4)

  const pos = new THREE.Vector3()
  const vel = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const spinQuat = new THREE.Quaternion()
  const axis = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    const piece = pieces[i]
    const { velocity, spin, gravity } = build(piece, piece.rand)

    pos.set(0, 0, 0)
    vel.copy(velocity)
    quat.identity()

    const dt = 1 / fps

    for (let f = 0; f < frames; f++) {
      const idx = (f * count + i) * 4

      posData[idx + 0] = pos.x
      posData[idx + 1] = pos.y
      posData[idx + 2] = pos.z
      posData[idx + 3] = 1

      oriData[idx + 0] = quat.x
      oriData[idx + 1] = quat.y
      oriData[idx + 2] = quat.z
      oriData[idx + 3] = quat.w

      // 静止フェーズの間は動かさない
      if (f < holdFrames) continue

      // 積分。破片ごとに独立なので順序依存はない
      vel.y += gravity * dt
      pos.addScaledVector(vel, dt)

      // 床で跳ねる。減衰させて転がりを止める
      const worldY = piece.origin.y + pos.y
      if (worldY < floorY && vel.y < 0) {
        pos.y = floorY - piece.origin.y
        vel.y *= -0.32
        vel.x *= 0.72
        vel.z *= 0.72
        spin.multiplyScalar(0.6)
      }

      const spinLen = spin.length()
      if (spinLen > 1e-5) {
        axis.copy(spin).divideScalar(spinLen)
        spinQuat.setFromAxisAngle(axis, spinLen * dt)
        quat.premultiply(spinQuat)
      }
    }
  }

  const makeTex = (data) => {
    const tex = new THREE.DataTexture(data, count, frames, THREE.RGBAFormat, THREE.FloatType)
    // フレーム境界をぼかさない。補間はシェーダー側の mix で明示的にやる
    tex.minFilter = THREE.NearestFilter
    tex.magFilter = THREE.NearestFilter
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.needsUpdate = true
    return tex
  }

  return {
    positionTexture: makeTex(posData),
    orientTexture: makeTex(oriData),
    count,
    frames,
  }
}
