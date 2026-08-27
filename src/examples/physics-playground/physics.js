/**
 * 自前の剛体球ソルバ。外部の物理エンジンは使わない。
 *
 * 素朴に全ペアを見ると 1500 体で 112 万回/フレームになって回らない。
 * ここは **一様グリッドのブロードフェーズ** を挟む。
 *
 *   1. 各球をセル番号へ変換
 *   2. 計数ソートでセルごとの区間を作る（Map もリストも作らない）
 *   3. 自分のセルと隣接 26 セルだけを走査
 *
 * 半径が揃っていればセル幅を直径にできるので、隣接 27 セルで漏れなく拾える。
 * 配列は全部使い回して、フレーム内で 1 つも確保しない。
 */

const GRAVITY_EPS = 0.25

export function createSolver({ count, bounds, cell, seed = 0x9e37 }) {
  const dim = Math.max(1, Math.ceil((bounds * 2) / cell))
  const cellCount = dim * dim * dim

  const pos = new Float32Array(count * 3)
  const vel = new Float32Array(count * 3)
  const radius = new Float32Array(count)
  const invMass = new Float32Array(count)

  // ブロードフェーズ用。すべて事前確保
  const cellOf = new Int32Array(count)
  const cellStart = new Int32Array(cellCount + 1)
  const cursor = new Int32Array(cellCount)
  const sorted = new Int32Array(count)
  // 中身のあるセルだけを覚えておく。全セルを舐めると 5 万回/サブステップになる
  const occupied = new Int32Array(cellCount)
  let occupiedCount = 0

  let rng = seed >>> 0
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0
    return rng / 4294967296
  }

  /** 球殻状に撒く。真球に詰めると初期の重なりが多すぎて弾け飛ぶ */
  function reset(minR, maxR, shellInner, shellOuter, spin) {
    for (let i = 0; i < count; i++) {
      const r = minR + rand() * (maxR - minR)
      radius[i] = r
      invMass[i] = 1 / (r * r * r)

      const u = rand() * 2 - 1
      const a = rand() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      const d = shellInner + rand() * (shellOuter - shellInner)

      const x = Math.cos(a) * s * d
      const y = u * d
      const z = Math.sin(a) * s * d
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z

      // 中心のまわりを回る向きに初速を入れる。落ち込まずに殻を保つ
      vel[i * 3] = -z * spin + (rand() - 0.5) * 0.2
      vel[i * 3 + 1] = (rand() - 0.5) * 0.2
      vel[i * 3 + 2] = x * spin + (rand() - 0.5) * 0.2
    }
  }

  const cellIndex = (x, y, z) => {
    let ix = ((x + bounds) / cell) | 0
    let iy = ((y + bounds) / cell) | 0
    let iz = ((z + bounds) / cell) | 0
    if (ix < 0) ix = 0
    else if (ix >= dim) ix = dim - 1
    if (iy < 0) iy = 0
    else if (iy >= dim) iy = dim - 1
    if (iz < 0) iz = 0
    else if (iz >= dim) iz = dim - 1
    return (iz * dim + iy) * dim + ix
  }

  /** 計数ソート。セル c の中身は sorted[cellStart[c] .. cellStart[c+1]) */
  function buildGrid() {
    cellStart.fill(0)
    occupiedCount = 0
    for (let i = 0; i < count; i++) {
      const c = cellIndex(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
      cellOf[i] = c
      // 0 → 1 になった瞬間だけ記録すれば、占有セルを重複なく集められる
      if (cellStart[c + 1]++ === 0) occupied[occupiedCount++] = c
    }
    for (let c = 0; c < cellCount; c++) cellStart[c + 1] += cellStart[c]
    cursor.set(cellStart.subarray(0, cellCount))
    for (let i = 0; i < count; i++) sorted[cursor[cellOf[i]]++] = i
  }

  /** 2 体の衝突を解く。位置のめり込みを押し戻してから法線方向の撃力を与える */
  function resolvePair(i, j, restitution) {
    const ix = i * 3
    const jx = j * 3
    let nx = pos[jx] - pos[ix]
    let ny = pos[jx + 1] - pos[ix + 1]
    let nz = pos[jx + 2] - pos[ix + 2]
    const d2 = nx * nx + ny * ny + nz * nz
    const rr = radius[i] + radius[j]
    if (d2 >= rr * rr || d2 < 1e-12) return

    const d = Math.sqrt(d2)
    const inv = 1 / d
    nx *= inv
    ny *= inv
    nz *= inv

    const wi = invMass[i]
    const wj = invMass[j]
    const wsum = wi + wj
    if (wsum <= 0) return

    // めり込み解消
    const pen = (rr - d) / wsum
    pos[ix] -= nx * pen * wi
    pos[ix + 1] -= ny * pen * wi
    pos[ix + 2] -= nz * pen * wi
    pos[jx] += nx * pen * wj
    pos[jx + 1] += ny * pen * wj
    pos[jx + 2] += nz * pen * wj

    // 相対速度の法線成分。離れていく方向なら何もしない
    const rvn =
      (vel[jx] - vel[ix]) * nx + (vel[jx + 1] - vel[ix + 1]) * ny + (vel[jx + 2] - vel[ix + 2]) * nz
    if (rvn > 0) return

    const jImp = (-(1 + restitution) * rvn) / wsum
    vel[ix] -= nx * jImp * wi
    vel[ix + 1] -= ny * jImp * wi
    vel[ix + 2] -= nz * jImp * wi
    vel[jx] += nx * jImp * wj
    vel[jx + 1] += ny * jImp * wj
    vel[jx + 2] += nz * jImp * wj
  }

  /** 自分のセルと隣接 26 セル。同じペアを 2 度見ないよう j > i に限る */
  function collideAll(restitution) {
    for (let oi = 0; oi < occupiedCount; oi++) {
      const c = occupied[oi]
      const s = cellStart[c]
      const e = cellStart[c + 1]

      const cx = c % dim
      const cy = ((c / dim) | 0) % dim
      const cz = (c / (dim * dim)) | 0

      for (let dz = -1; dz <= 1; dz++) {
        const nz2 = cz + dz
        if (nz2 < 0 || nz2 >= dim) continue
        for (let dy = -1; dy <= 1; dy++) {
          const ny2 = cy + dy
          if (ny2 < 0 || ny2 >= dim) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx2 = cx + dx
            if (nx2 < 0 || nx2 >= dim) continue

            const nc = (nz2 * dim + ny2) * dim + nx2
            const ns = cellStart[nc]
            const ne = cellStart[nc + 1]
            for (let a = s; a < e; a++) {
              const i = sorted[a]
              for (let b = ns; b < ne; b++) {
                const j = sorted[b]
                if (j <= i) continue
                resolvePair(i, j, restitution)
              }
            }
          }
        }
      }
    }
  }

  /**
   * 1 ステップ進める。
   * opts: { dt, gravity, downward, damping, restitution, container, floor,
   *         pointer: {x,y,z,active}, pointerRadius, pointerForce }
   */
  function step(o) {
    const dt = o.dt
    const px = o.pointer.x
    const py = o.pointer.y
    const pz = o.pointer.z
    const pr2 = o.pointerRadius * o.pointerRadius

    for (let i = 0; i < count; i++) {
      const ix = i * 3
      const x = pos[ix]
      const y = pos[ix + 1]
      const z = pos[ix + 2]

      // 中心引力。近距離で発散しないよう距離に下限を置く
      if (o.gravity !== 0) {
        const d2 = x * x + y * y + z * z + GRAVITY_EPS
        const f = (-o.gravity * dt) / (d2 * Math.sqrt(d2))
        vel[ix] += x * f
        vel[ix + 1] += y * f
        vel[ix + 2] += z * f
      }

      // 下向き重力
      if (o.downward !== 0) vel[ix + 1] -= o.downward * dt

      // カーソルの押しのけ。距離の二乗で減衰
      if (o.pointer.active && o.pointerForce !== 0) {
        const dx = x - px
        const dy = y - py
        const dz = z - pz
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 < pr2 && d2 > 1e-6) {
          const fall = 1 - d2 / pr2
          const f = (o.pointerForce * dt * fall * fall) / Math.sqrt(d2)
          vel[ix] += dx * f
          vel[ix + 1] += dy * f
          vel[ix + 2] += dz * f
        }
      }

      const damp = Math.exp(-o.damping * dt)
      vel[ix] *= damp
      vel[ix + 1] *= damp
      vel[ix + 2] *= damp

      pos[ix] = x + vel[ix] * dt
      pos[ix + 1] = y + vel[ix + 1] * dt
      pos[ix + 2] = z + vel[ix + 2] * dt
    }

    buildGrid()
    collideAll(o.restitution)

    // 容器。球殻の内側 or 床
    for (let i = 0; i < count; i++) {
      const ix = i * 3
      const r = radius[i]

      if (o.container > 0) {
        const x = pos[ix]
        const y = pos[ix + 1]
        const z = pos[ix + 2]
        const d = Math.sqrt(x * x + y * y + z * z)
        const lim = o.container - r
        if (d > lim && d > 1e-6) {
          const nx = x / d
          const ny = y / d
          const nz = z / d
          pos[ix] = nx * lim
          pos[ix + 1] = ny * lim
          pos[ix + 2] = nz * lim
          const vn = vel[ix] * nx + vel[ix + 1] * ny + vel[ix + 2] * nz
          if (vn > 0) {
            const k = (1 + o.restitution) * vn
            vel[ix] -= nx * k
            vel[ix + 1] -= ny * k
            vel[ix + 2] -= nz * k
          }
        }
      }

      if (o.floor !== null && pos[ix + 1] - r < o.floor) {
        pos[ix + 1] = o.floor + r
        if (vel[ix + 1] < 0) vel[ix + 1] *= -o.restitution
        // 床の摩擦
        vel[ix] *= 0.94
        vel[ix + 2] *= 0.94
      }
    }
  }

  // cellStart はグリッド可視化から読む（占有セルだけ描くため）
  return {
    pos,
    vel,
    radius,
    count,
    dim,
    cell,
    bounds,
    cellStart,
    // グリッド可視化から読む
    occupied,
    occupiedCount: () => occupiedCount,
    reset,
    step,
  }
}
