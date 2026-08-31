/**
 * 球の衝突を解く。**焼く時に使う前提**の CPU 実装。
 *
 * 実行時に毎フレーム解くなら `physics-playground` の方（同じ設計）を使う。
 * こちらはベイク用で、フレーム数ぶん一度回すだけなので割り切って素直に書いてある。
 *
 * 総当たりは 1000 体で 50 万ペアになるので、一様グリッドのハッシュで近傍だけ見る。
 * 状態は Float64Array で外から渡す。オブジェクトの配列にすると GC が効いて遅くなる。
 */

const P1 = 73856093
const P2 = 19349663
const P3 = 83492791

/**
 * @param s     { px, py, pz, vx, vy, vz, radius, invMass, count } すべて TypedArray
 * @param opts  { cell, restitution, onHit }
 */
export function resolveSphereCollisions(s, { cell, restitution = 0.2, onHit }) {
  const { px, py, pz, vx, vy, vz, radius, invMass, count } = s
  const buckets = new Map()

  for (let i = 0; i < count; i++) {
    const key =
      (Math.floor(px[i] / cell) * P1) ^ (Math.floor(py[i] / cell) * P2) ^ (Math.floor(pz[i] / cell) * P3)
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
          const list = buckets.get(((cx + dx) * P1) ^ ((cy + dy) * P2) ^ ((cz + dz) * P3))
          if (!list) continue

          for (let k = 0; k < list.length; k++) {
            const j = list[k]
            // 同じペアを 2 度解かない
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
            if (ws <= 0) continue

            // めり込み解消
            const pen = (rr - d) / ws
            px[i] -= nx * pen * wi
            py[i] -= ny * pen * wi
            pz[i] -= nz * pen * wi
            px[j] += nx * pen * wj
            py[j] += ny * pen * wj
            pz[j] += nz * pen * wj

            // 離れていく方向なら撃力は要らない
            const rvn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny + (vz[j] - vz[i]) * nz
            if (rvn > 0) continue

            const jm = (-(1 + restitution) * rvn) / ws
            vx[i] -= nx * jm * wi
            vy[i] -= ny * jm * wi
            vz[i] -= nz * jm * wi
            vx[j] += nx * jm * wj
            vy[j] += ny * jm * wj
            vz[j] += nz * jm * wj

            if (onHit) onHit(i, j)
          }
        }
      }
    }
  }
}
