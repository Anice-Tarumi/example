/**
 * 壁を落ちていく金属球。2 次元。
 *
 * 壁は垂直なので、重力は面内（-y）に働く。奥行きは描画のためだけに使う。
 * つまり解くべきは平面上の円の運動で、3 次元の剛体は要らない。
 *
 * ---
 *
 * **隆起を「力」ではなく「障害物」として扱う。**
 *
 * 勾配に比例した横向きの力を足すだけだと、球は盛り上がりをすり抜けて滑る。
 * 見えている壁を無視して動くので、どれだけ数値を触っても物理に見えない。
 *
 * そこで高さ場をしきい値で切って**固い領域**とみなす。
 * `f = h - hSolid` が正なら球はめり込んでいる。滑らかな場なので
 * `f / |∇f|` が符号付き距離のよい近似になり、SDF と同じ扱いができる。
 * めり込みぶんだけ法線方向へ押し戻し、法線速度を反発させ、接線を摩擦で削る。
 *
 * これで球は隆起に「乗る」「弾かれる」「尾根を伝って落ちる」ようになる。
 */

/** 落下の間隔は焼いた乱数列から引く。毎フレーム rand() だと間隔が制御できない */
function bakeRandom(n, seed) {
  let s = seed >>> 0
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    out[i] = s / 4294967296
  }
  return out
}

export function createBalls({
  count = 40,
  halfWidth = 1.6,
  top = 1.35,
  bottom = -1.35,
  spawnHalf = halfWidth * 0.6,
  spawnTop = top,
  seed = 0x2f19,
} = {}) {
  const x = new Float32Array(count)
  const y = new Float32Array(count)
  const vx = new Float32Array(count)
  const vy = new Float32Array(count)
  const alive = new Uint8Array(count)

  // 転がりの姿勢。クォータニオン。three に依存させないので自前で掛ける
  const qx = new Float32Array(count)
  const qy = new Float32Array(count)
  const qz = new Float32Array(count)
  const qw = new Float32Array(count).fill(1)

  const rnd = bakeRandom(count * 8, seed)
  let cursor = 0
  let timer = 0

  const grad = { x: 0, y: 0 }

  const toU = (wx) => wx / (halfWidth * 2) + 0.5
  const toV = (wy) => wy / (top - bottom) + 0.5

  function spawn(i) {
    // 生む範囲は板ではなく**見えている範囲**。外で落とすと画面に出てこない
    x[i] = (rnd[cursor++ % rnd.length] - 0.5) * spawnHalf * 2
    y[i] = spawnTop
    vx[i] = (rnd[cursor++ % rnd.length] - 0.5) * 0.15
    vy[i] = 0
    qx[i] = qy[i] = qz[i] = 0
    qw[i] = 1
    alive[i] = 1
  }

  /** 転がりを姿勢へ積む。接触点は壁側（-z）なので ω = (vy, -vx) / r */
  function roll(i, dt, radius) {
    const wxx = vy[i] / radius
    const wyy = -vx[i] / radius
    const len = Math.hypot(wxx, wyy)
    if (len < 1e-4) return

    const half = len * dt * 0.5
    const s = Math.sin(half) / len
    const dqx = wxx * s
    const dqy = wyy * s
    const dqw = Math.cos(half)

    // dq * q
    const ax = qx[i]
    const ay = qy[i]
    const az = qz[i]
    const aw = qw[i]
    qx[i] = dqw * ax + dqx * aw + dqy * az
    qy[i] = dqw * ay + dqy * aw - dqx * az
    qz[i] = dqw * az + dqx * ay - dqy * ax
    qw[i] = dqw * aw - dqx * ax - dqy * ay

    const n = Math.hypot(qx[i], qy[i], qz[i], qw[i]) || 1
    qx[i] /= n; qy[i] /= n; qz[i] /= n; qw[i] /= n
  }

  /**
   * 隆起との接触。
   *
   * 中心が固い領域に入ってから押し返すと、**半径ぶんめり込んでから**
   * 反応することになり、すり抜けたように見える。
   * `f / |∇f|` が境界までの符号付き距離なので、**半径ぶん外側**で当てる。
   */
  function contact(i, field, p, dt) {
    const u = toU(x[i])
    const v = toV(y[i])

    // 差分幅は球の大きさで。テクセル幅だと表面の粒に引っかかって震える
    const e = Math.max(1.5 / field.size, p.radius / (halfWidth * 2) * 0.8)
    const f = field.height(u, v) - p.solid
    field.gradient(u, v, grad, e)

    const gx = grad.x / (halfWidth * 2)
    const gy = grad.y / (top - bottom)
    const gl = Math.hypot(gx, gy)
    if (gl < 1e-4) return

    // 正なら面の外。半径より近ければ接触
    const dist = -f / gl
    const pen = p.radius - dist
    if (pen <= 0) return

    /*
     * 固い領域は h > solid なので、**外向きは -∇h**。
     * 符号を間違えると押し返しが山の中心へ向き、球がカーソルに吸い寄せられる。
     */
    const nx = -gx / gl
    const ny = -gy / gl

    // 一度に全部戻すと弾かれて震える。少し残して次のフレームに任せる
    const push = Math.min(pen, p.radius) * 0.7
    x[i] += nx * push
    y[i] += ny * push

    const vn = vx[i] * nx + vy[i] * ny
    if (vn >= 0) return

    // 法線方向は反発、接線方向は摩擦で削る
    const tx = vx[i] - vn * nx
    const ty = vy[i] - vn * ny
    const k = Math.max(0, 1 - p.surfaceFriction * dt * 60)
    vx[i] = tx * k - vn * nx * p.restitution
    vy[i] = ty * k - vn * ny * p.restitution
  }

  function step(dt, field, p) {
    // --- 供給 ---
    timer -= dt
    if (timer <= 0) {
      const idx = alive.indexOf(0)
      if (idx >= 0) spawn(idx)
      // 間隔にも乱数を混ぜる。等間隔だとメトロノームに見える
      timer = p.spawnInterval * (0.6 + rnd[cursor++ % rnd.length] * 0.8)
    }

    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue

      vy[i] -= p.gravity * dt
      // 空気抵抗。接触の摩擦とは別
      const drag = Math.exp(-p.drag * dt)
      vx[i] *= drag
      vy[i] *= drag

      /*
       * 落下が速いと 1 フレームで半径ぶん以上進み、隆起を飛び越す。
       * 進む距離が半径の半分を超えるなら刻む。
       */
      const speed = Math.hypot(vx[i], vy[i])
      const sub = Math.min(4, Math.max(1, Math.ceil((speed * dt) / (p.radius * 0.5))))
      const sdt = dt / sub

      for (let k = 0; k < sub; k++) {
        x[i] += vx[i] * sdt
        y[i] += vy[i] * sdt
        contact(i, field, p, sdt)
      }

      const sp = Math.hypot(vx[i], vy[i])
      if (sp > p.maxSpeed) {
        vx[i] *= p.maxSpeed / sp
        vy[i] *= p.maxSpeed / sp
      }

      roll(i, dt, p.radius)

      // 横は壁。跳ね返す
      const lim = spawnHalf + 0.35 - p.radius
      if (x[i] < -lim) { x[i] = -lim; vx[i] = Math.abs(vx[i]) * 0.4 }
      if (x[i] > lim) { x[i] = lim; vx[i] = -Math.abs(vx[i]) * 0.4 }

      if (y[i] < bottom) alive[i] = 0
    }

    // --- 球どうし ---
    const d = p.radius * 2
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue
      for (let j = i + 1; j < count; j++) {
        if (!alive[j]) continue
        const dx = x[j] - x[i]
        const dy = y[j] - y[i]
        const dist = Math.hypot(dx, dy)
        if (dist >= d || dist < 1e-5) continue
        const nx = dx / dist
        const ny = dy / dist
        const push = (d - dist) * 0.5
        x[i] -= nx * push; y[i] -= ny * push
        x[j] += nx * push; y[j] += ny * push
        // 法線方向の相対速度だけ反発させる。接線は残して転がりを保つ
        const rel = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny
        if (rel < 0) {
          const imp = rel * p.restitution
          vx[i] += nx * imp; vy[i] += ny * imp
          vx[j] -= nx * imp; vy[j] -= ny * imp
        }
      }
    }

    // --- 溝を刻む ---
    if (p.carve > 0) {
      for (let i = 0; i < count; i++) {
        if (!alive[i]) continue
        const sp = Math.hypot(vx[i], vy[i])
        // 止まっている球は掘らない。転がった跡だけが轍になる
        const amount = p.carve * dt * Math.min(1, sp / 0.6)
        if (amount > 1e-6) field.stamp(toU(x[i]), toV(y[i]), p.radius * 0.7, -amount)
      }
    }
  }

  return { count, x, y, vx, vy, alive, qx, qy, qz, qw, step, toU, toV }
}
