/**
 * メッシュから符号付き距離場（SDF）を焼く。
 *
 * 素朴に「全ボクセル × 全三角形」で最近傍を探すと、48³ × 1 万三角形で 11 億回になる。
 * 代わりに 3 段に分ける。
 *
 *   1. 三角形を点で撒いてボクセルに落とす（表面のボクセルを立てる）
 *   2. 表面ボクセルからの距離を**厳密な距離変換**で求める（Felzenszwalb, O(n)）
 *   3. 外側から塗りつぶして内外を判定し、符号を付ける
 *
 * 距離変換は 1 次元の厳密アルゴリズムを 3 軸に掛けるだけ。近似ではない。
 * 内外判定は境界からの塗りつぶしなので、多少の穴があっても致命傷にならない
 * （穴から漏れたぶんだけ内側が外側と判定される）。
 */

const INF = 1e20

/** Felzenszwalb の 1 次元距離変換。入出力とも二乗距離 */
function edt1d(f, d, v, z, n) {
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  let k = 0

  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }

  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

/** 3 軸に順に掛ける */
function edt3d(grid, n) {
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  const at = (x, y, zc) => (zc * n + y) * n + x

  for (let zc = 0; zc < n; zc++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) f[x] = grid[at(x, y, zc)]
      edt1d(f, d, v, z, n)
      for (let x = 0; x < n; x++) grid[at(x, y, zc)] = d[x]
    }
  }
  for (let zc = 0; zc < n; zc++) {
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) f[y] = grid[at(x, y, zc)]
      edt1d(f, d, v, z, n)
      for (let y = 0; y < n; y++) grid[at(x, y, zc)] = d[y]
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      for (let zc = 0; zc < n; zc++) f[zc] = grid[at(x, y, zc)]
      edt1d(f, d, v, z, n)
      for (let zc = 0; zc < n; zc++) grid[at(x, y, zc)] = d[zc]
    }
  }
}

/**
 * ジオメトリの位置配列から SDF を焼く。
 *
 * @param positions Float32Array（インデックス展開済みの三角形列）
 * @param n         1 辺のボクセル数
 * @returns { distance: Float32Array }  [-1, 1] 正規化した符号付き距離。内側が正
 */
export function bakeMeshSdf(positions, n = 48) {
  const total = n * n * n
  const surface = new Float64Array(total).fill(INF)

  // --- モデルを [-1, 1] の立方体へ正規化する ---
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i]
    if (positions[i] > maxX) maxX = positions[i]
    if (positions[i + 1] < minY) minY = positions[i + 1]
    if (positions[i + 1] > maxY) maxY = positions[i + 1]
    if (positions[i + 2] < minZ) minZ = positions[i + 2]
    if (positions[i + 2] > maxZ) maxZ = positions[i + 2]
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2
  // 端がグリッドに触れないよう少し縮める。触れると外側の塗りつぶしが入れない
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1
  const k = 1.72 / span

  const toVoxel = (x, y, z) => {
    const vx = ((x - cx) * k * 0.5 + 0.5) * (n - 1)
    const vy = ((y - cy) * k * 0.5 + 0.5) * (n - 1)
    const vz = ((z - cz) * k * 0.5 + 0.5) * (n - 1)
    return [vx, vy, vz]
  }

  const mark = (x, y, z) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    const iz = Math.round(z)
    if (ix < 0 || iy < 0 || iz < 0 || ix >= n || iy >= n || iz >= n) return
    surface[(iz * n + iy) * n + ix] = 0
  }

  // --- 1. 三角形を点で撒く。ボクセル 1 個より細かい間隔で刻む ---
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az] = toVoxel(positions[i], positions[i + 1], positions[i + 2])
    const [bx, by, bz] = toVoxel(positions[i + 3], positions[i + 4], positions[i + 5])
    const [cx2, cy2, cz2] = toVoxel(positions[i + 6], positions[i + 7], positions[i + 8])

    const e1 = Math.hypot(bx - ax, by - ay, bz - az)
    const e2 = Math.hypot(cx2 - ax, cy2 - ay, cz2 - az)
    const steps = Math.max(2, Math.ceil(Math.max(e1, e2) * 1.5))

    for (let u = 0; u <= steps; u++) {
      for (let v2 = 0; v2 <= steps - u; v2++) {
        const fu = u / steps
        const fv = v2 / steps
        const fw = 1 - fu - fv
        mark(ax * fw + bx * fu + cx2 * fv, ay * fw + by * fu + cy2 * fv, az * fw + bz * fu + cz2 * fv)
      }
    }
  }

  // --- 3. 内外判定。境界から塗りつぶして届いた場所が外側 ---
  const outside = new Uint8Array(total)
  const stack = []
  const push = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) return
    const idx = (z * n + y) * n + x
    if (outside[idx] || surface[idx] === 0) return
    outside[idx] = 1
    stack.push(idx)
  }
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      push(a, b, 0)
      push(a, b, n - 1)
      push(a, 0, b)
      push(a, n - 1, b)
      push(0, a, b)
      push(n - 1, a, b)
    }
  }
  while (stack.length) {
    const idx = stack.pop()
    const x = idx % n
    const y = ((idx / n) | 0) % n
    const z = (idx / (n * n)) | 0
    push(x + 1, y, z)
    push(x - 1, y, z)
    push(x, y + 1, z)
    push(x, y - 1, z)
    push(x, y, z + 1)
    push(x, y, z - 1)
  }

  // --- 2. 表面からの距離 ---
  edt3d(surface, n)

  const distance = new Float32Array(total)
  const half = (n - 1) * 0.5
  for (let i = 0; i < total; i++) {
    // ボクセル単位 → [-1, 1] 空間へ。立方体の半幅が half ボクセル
    const dist = Math.sqrt(surface[i]) / half
    distance[i] = outside[i] ? -dist : dist
  }
  return { distance, size: n }
}
