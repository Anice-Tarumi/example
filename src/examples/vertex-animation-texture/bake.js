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
/**
 * 全フレームぶんを回して DataTexture 2 枚に焼く。
 * frames は「焼くフレーム数」で、実行時のフレームレートとは無関係。
 *
 * **破片同士の衝突もここで解く。** 独立に積分するだけだと互いにすり抜けて
 * 均等に散り、積み重ならないので崩落に見えない。
 *
 * 実行時にやるなら 1000 体の総当たりは重すぎるが、**焼く時なら一度で済む**。
 * 一様グリッドのブロードフェーズを挟んで、破片を包む球として解く。
 * これが「焼く」方式の利点そのもの。実行時のコストは 1 ミリ秒も増えない。
 */
export function bakeShatter({
  pieces,
  frames,
  fps = 30,
  mode = 'explode',
  floorY = -1.4,
  hold = 0.16,
  collide = true,
  restitution = 0.16,
  friction = 0.86,
  substeps = 2,
}) {
  const build = MODES[mode] || MODES.explode
  const count = pieces.length
  // 最初の数フレームは壁のまま止めておく。いきなり散ると「何が砕けたか」が見えない
  const holdFrames = Math.max(1, Math.floor(frames * hold))

  const posData = new Float32Array(count * frames * 4)
  const oriData = new Float32Array(count * frames * 4)
  const restPos = new Float32Array(count * 3)
  const restQuat = new Float32Array(count * 4)

  // --- 状態。破片ごとではなくフレームごとに回すので、全部まとめて持つ ---
  const px = new Float64Array(count)
  const py = new Float64Array(count)
  const pz = new Float64Array(count)
  const vx = new Float64Array(count)
  const vy = new Float64Array(count)
  const vz = new Float64Array(count)
  const radius = new Float64Array(count)
  const invMass = new Float64Array(count)
  const gravity = new Float64Array(count)
  const quats = []
  const spins = []

  let maxR = 0
  for (let i = 0; i < count; i++) {
    const piece = pieces[i]
    const built = build(piece, piece.rand)
    // 世界座標で持つ。衝突は origin 込みで見る必要がある
    px[i] = piece.origin.x
    py[i] = piece.origin.y
    pz[i] = piece.origin.z
    vx[i] = built.velocity.x
    vy[i] = built.velocity.y
    vz[i] = built.velocity.z
    gravity[i] = built.gravity
    // 破片を包む球。角は多少めり込むが、積み上がり方は十分それらしくなる
    const r = 0.5 * Math.hypot(piece.size.x, piece.size.y, piece.size.z) * 0.78
    radius[i] = r
    invMass[i] = 1 / (r * r * r)
    if (r > maxR) maxR = r
    quats.push(new THREE.Quaternion())
    spins.push(built.spin.clone())
  }

  // --- 一様グリッド。実行時ではないが、総当たりだと 1000 体で 50 万ペアになる ---
  const cell = Math.max(maxR * 2, 1e-3)
  const cellOf = new Int32Array(count)
  const buckets = new Map()

  function collideAll(rest) {
    buckets.clear()
    for (let i = 0; i < count; i++) {
      const key =
        (Math.floor(px[i] / cell) * 73856093) ^
        (Math.floor(py[i] / cell) * 19349663) ^
        (Math.floor(pz[i] / cell) * 83492791)
      cellOf[i] = key
      let list = buckets.get(key)
      if (!list) buckets.set(key, (list = []))
      list.push(i)
    }

    for (let i = 0; i < count; i++) {
      const cx = Math.floor(px[i] / cell)
      const cy = Math.floor(py[i] / cell)
      const cz = Math.floor(pz[i] / cell)

      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const key =
              ((cx + dx) * 73856093) ^ ((cy + dy) * 19349663) ^ ((cz + dz) * 83492791)
            const list = buckets.get(key)
            if (!list) continue

            for (let k = 0; k < list.length; k++) {
              const j = list[k]
              if (j <= i) continue

              let nx = px[j] - px[i]
              let ny = py[j] - py[i]
              let nz = pz[j] - pz[i]
              const d2 = nx * nx + ny * ny + nz * nz
              const rr = radius[i] + radius[j]
              if (d2 >= rr * rr || d2 < 1e-12) continue

              const d = Math.sqrt(d2)
              nx /= d
              ny /= d
              nz /= d

              const wi = invMass[i]
              const wj = invMass[j]
              const ws = wi + wj

              // めり込み解消
              const pen = (rr - d) / ws
              px[i] -= nx * pen * wi
              py[i] -= ny * pen * wi
              pz[i] -= nz * pen * wi
              px[j] += nx * pen * wj
              py[j] += ny * pen * wj
              pz[j] += nz * pen * wj

              const rvn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny + (vz[j] - vz[i]) * nz
              if (rvn > 0) continue

              const jm = (-(1 + rest) * rvn) / ws
              vx[i] -= nx * jm * wi
              vy[i] -= ny * jm * wi
              vz[i] -= nz * jm * wi
              vx[j] += nx * jm * wj
              vy[j] += ny * jm * wj
              vz[j] += nz * jm * wj

              // ぶつかったら回転も鈍る。ぶつかっても回り続けると氷の上に見える
              spins[i].multiplyScalar(0.92)
              spins[j].multiplyScalar(0.92)
            }
          }
        }
      }
    }
  }

  const spinQuat = new THREE.Quaternion()
  const axis = new THREE.Vector3()
  const dtFrame = 1 / fps

  for (let f = 0; f < frames; f++) {
    // 書き出しは常にフレーム頭の状態
    for (let i = 0; i < count; i++) {
      const idx = (f * count + i) * 4
      const o = pieces[i].origin
      posData[idx + 0] = px[i] - o.x
      posData[idx + 1] = py[i] - o.y
      posData[idx + 2] = pz[i] - o.z
      posData[idx + 3] = 1

      const q = quats[i]
      oriData[idx + 0] = q.x
      oriData[idx + 1] = q.y
      oriData[idx + 2] = q.z
      oriData[idx + 3] = q.w
    }

    if (f < holdFrames) continue

    const sub = Math.max(1, substeps)
    const dt = dtFrame / sub

    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < count; i++) {
        vy[i] += gravity[i] * dt
        px[i] += vx[i] * dt
        py[i] += vy[i] * dt
        pz[i] += vz[i] * dt
      }

      if (collide) collideAll(restitution)

      // 床。位置を直接丸める。力でやると振動する
      for (let i = 0; i < count; i++) {
        const limit = floorY + radius[i]
        if (py[i] < limit) {
          py[i] = limit
          if (vy[i] < 0) vy[i] *= -restitution
          vx[i] *= friction
          vz[i] *= friction
          spins[i].multiplyScalar(0.7)
        }
      }
    }

    for (let i = 0; i < count; i++) {
      const spin = spins[i]
      const len = spin.length()
      if (len > 1e-5) {
        axis.copy(spin).divideScalar(len)
        spinQuat.setFromAxisAngle(axis, len * dtFrame)
        quats[i].premultiply(spinQuat)
      }
    }
  }

  for (let i = 0; i < count; i++) {
    const o = pieces[i].origin
    restPos[i * 3] = px[i] - o.x
    restPos[i * 3 + 1] = py[i] - o.y
    restPos[i * 3 + 2] = pz[i] - o.z
    const q = quats[i]
    restQuat[i * 4] = q.x
    restQuat[i * 4 + 1] = q.y
    restQuat[i * 4 + 2] = q.z
    restQuat[i * 4 + 3] = q.w
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
    restPos,
    restQuat,
    count,
    frames,
  }
}
