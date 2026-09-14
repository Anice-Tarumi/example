/**
 * 布のソルバ。XPBD（拡張位置ベース動力学）。
 *
 * 力を積分せず、**位置を直接直す**。ばねで組むと、硬くしたい布ほど剛性を
 * 上げる必要があり、時間刻みを小さくしないと発散する。位置を直す方式なら
 * 発散しない。伸びが残るだけで済む。
 *
 * ふつうの PBD は「反復回数を増やすほど硬くなる」ので、硬さが刻みと反復数に
 * 依存してしまう。XPBD は**コンプライアンス（柔らかさ）を物理量として持ち**、
 * λ を貯めて反復で割り戻すので、反復数を変えても硬さが変わらない。
 *
 *   Δλ = (-C - α̃λ) / (w₁ + w₂ + α̃),   α̃ = compliance / dt²
 *
 * 反復を増やすより**部分刻み（substep）を増やすほうが効く**のも XPBD の要点。
 * 同じ計算量なら、1 刻み 10 反復より 10 刻み 1 反復のほうが硬く安定する。
 *
 * three に依存しない。node でそのまま回して挙動を確かめられる。
 */

/** 拘束の種類ごとの既定の柔らかさ。0 は完全剛体 */
export const COMPLIANCE = {
  structural: 0,
  shear: 1e-6,
  bend: 5e-5,
}

/**
 * 布を作る。
 *
 * `flat` は寝かせて置く向き。**掛け布は縦のままでは球を外す。** 縦面の布を
 * 落としても、球の横を刃のようにすり抜けるだけで被さらない。
 */
export function createCloth({ cols = 40, rows = 40, size = 4, flat = false, height = 1.6 }) {
  const n = cols * rows
  const pos = new Float32Array(n * 3)
  const prev = new Float32Array(n * 3)
  const vel = new Float32Array(n * 3)
  const invMass = new Float32Array(n)

  const dx = size / (cols - 1)
  const dy = size / (rows - 1)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 3
      pos[i] = (x - (cols - 1) / 2) * dx
      if (flat) {
        pos[i + 1] = height
        pos[i + 2] = ((rows - 1) / 2 - y) * dy
      } else {
        pos[i + 1] = ((rows - 1) / 2 - y) * dy
        pos[i + 2] = 0
      }
      prev[i] = pos[i]
      prev[i + 1] = pos[i + 1]
      prev[i + 2] = pos[i + 2]
      invMass[y * cols + x] = 1
    }
  }

  /*
   * 拘束は 3 種。
   *
   *   structural … 縦横。伸びを止める
   *   shear      … 斜め。平行四辺形に潰れるのを止める
   *   bend       … 2 つ飛ばし。折れ曲がりに腰を与える
   *
   * shear と bend が無いと、布ではなく**鎖帷子**になる。四角が自由に潰れ、
   * どんな形にもぺしゃんこに畳める。
   */
  const ia = []
  const ib = []
  const rest = []
  const kind = []

  const add = (a, b, k) => {
    const d = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2])
    ia.push(a)
    ib.push(b)
    rest.push(d)
    kind.push(k)
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (x + 1 < cols) add(i, i + 1, 0)
      if (y + 1 < rows) add(i, i + cols, 0)
      if (x + 1 < cols && y + 1 < rows) {
        add(i, i + cols + 1, 1)
        add(i + 1, i + cols, 1)
      }
      if (x + 2 < cols) add(i, i + 2, 2)
      if (y + 2 < rows) add(i, i + cols * 2, 2)
    }
  }

  return {
    cols,
    rows,
    size,
    pos,
    prev,
    vel,
    invMass,
    ia: Int32Array.from(ia),
    ib: Int32Array.from(ib),
    rest: Float32Array.from(rest),
    kind: Uint8Array.from(kind),
    // 切れた拘束は 0。ジオメトリ側は破れた四角を落とす
    alive: new Uint8Array(ia.length).fill(1),
    lambda: new Float32Array(ia.length),
    grabbed: -1,
    grabTarget: [0, 0, 0],
    torn: false,

    /*
     * 自己衝突用の空間ハッシュ。**毎フレーム作り直すが、確保は 1 回だけ。**
     * Map を毎回作ると、粒より割り当ての方が高くつく。
     */
    hashSize: 1 << Math.ceil(Math.log2(Math.max(16, n * 2))),
    cellStart: null,
    cellEntry: new Int32Array(n),
  }
}

/**
 * 自己衝突。
 *
 * 布は面だが、ここでは**点どうしの押し退け**で代用する。三角形と点の判定は
 * 正確だが桁違いに高い。点の間隔より細かく畳まない限り、点どうしで足りる。
 *
 * 格子の上で隣り合う点は除く。隣を押し退けると、辺の拘束と綱引きになって
 * 布全体が震える。
 */
function selfCollide(c, thickness) {
  const { pos, invMass, cols, cellEntry, hashSize } = c
  const n = invMass.length
  if (!c.cellStart) c.cellStart = new Int32Array(hashSize + 1)
  const start = c.cellStart
  const inv = 1 / thickness

  // 空間ハッシュ。セルの大きさは押し退ける距離に合わせる
  const hash = (x, y, z) => {
    const h = (x * 92837111) ^ (y * 689287499) ^ (z * 283923481)
    return (h < 0 ? -h : h) % hashSize
  }

  start.fill(0)
  for (let i = 0; i < n; i++) {
    const o = i * 3
    const h = hash(Math.floor(pos[o] * inv), Math.floor(pos[o + 1] * inv), Math.floor(pos[o + 2] * inv))
    start[h]++
  }
  // 累積和にして詰める。数え上げソート
  let sum = 0
  for (let i = 0; i < hashSize; i++) {
    sum += start[i]
    start[i] = sum
  }
  start[hashSize] = sum
  for (let i = 0; i < n; i++) {
    const o = i * 3
    const h = hash(Math.floor(pos[o] * inv), Math.floor(pos[o + 1] * inv), Math.floor(pos[o + 2] * inv))
    cellEntry[--start[h]] = i
  }

  const t2 = thickness * thickness
  for (let i = 0; i < n; i++) {
    const wi = invMass[i]
    const io = i * 3
    const xi = i % cols
    const yi = (i / cols) | 0
    const gx = Math.floor(pos[io] * inv)
    const gy = Math.floor(pos[io + 1] * inv)
    const gz = Math.floor(pos[io + 2] * inv)

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const h = hash(gx + ox, gy + oy, gz + oz)
          for (let k = start[h]; k < start[h + 1]; k++) {
            const j = cellEntry[k]
            if (j <= i) continue
            // 格子の上で近い相手は拘束が持っている。触らない
            const dxg = Math.abs(xi - (j % cols))
            const dyg = Math.abs(yi - ((j / cols) | 0))
            if (dxg + dyg <= 2) continue

            const jo = j * 3
            const dx = pos[jo] - pos[io]
            const dy = pos[jo + 1] - pos[io + 1]
            const dz = pos[jo + 2] - pos[io + 2]
            const d2 = dx * dx + dy * dy + dz * dz
            if (d2 > t2 || d2 < 1e-12) continue

            const wj = invMass[j]
            const w = wi + wj
            if (w === 0) continue
            const d = Math.sqrt(d2)
            const f = ((thickness - d) / d) / w
            pos[io] -= dx * f * wi
            pos[io + 1] -= dy * f * wi
            pos[io + 2] -= dz * f * wi
            pos[jo] += dx * f * wj
            pos[jo + 1] += dy * f * wj
            pos[jo + 2] += dz * f * wj
          }
        }
      }
    }
  }
}

/** 端の留め方。留めた点は質量を無限にする（invMass = 0） */
export const PINS = {
  'Two corners': 'corners2',
  'Top edge': 'top',
  'Four corners': 'corners4',
  Free: 'free',
}

/**
 * 端を留める。留めた点は質量を無限にする（invMass = 0）。
 *
 * `slack` は留め幅を布幅より狭める割合。**これが無いとひだが出ない。**
 * 留め点の間隔が布幅ちょうどだと、辺の拘束は伸びないので上端は張った直線に
 * なり、面全体が板のまま垂れる（物理としては正しい）。実際の掛け布は、
 * 幅より狭い所に留めるから余った生地が折り重なる。
 */
export function applyPins(c, mode, slack = 0) {
  const { cols, rows, invMass, pos } = c
  invMass.fill(1)
  const at = (x, y) => y * cols + x
  const pin = (x, y) => { invMass[at(x, y)] = 0 }

  if (mode === 'corners2') {
    pin(0, 0)
    pin(cols - 1, 0)
  } else if (mode === 'top') {
    for (let x = 0; x < cols; x++) pin(x, 0)
  } else if (mode === 'corners4') {
    pin(0, 0)
    pin(cols - 1, 0)
    pin(0, rows - 1)
    pin(cols - 1, rows - 1)
  }

  if (slack <= 0) return
  // 留めた点だけを中心へ寄せる。留めていない点は寄せない（生地は縮まない）
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = at(x, y)
      if (invMass[i] !== 0) continue
      const o = i * 3
      pos[o] *= 1 - slack
      c.prev[o] = pos[o]
    }
  }
}

/**
 * 1 フレーム進める。
 *
 * `substeps` に刻んで、各刻みで拘束を 1 回ずつ解く。
 * **λ は刻みごとに 0 に戻す。** 持ち越すと柔らかさが刻み数に依存する。
 */
export function step(c, dt, p) {
  const sub = Math.max(1, p.substeps | 0)
  /*
   * 刻みに下限を置く。
   *
   * **最初のフレームは delta が 0 で来る。** そのまま割ると α̃ = 柔らかさ/h²
   * が無限大になり、`Inf × λ(=0)` が NaN を生んで、以降すべての座標が
   * NaN のまま固まる。
   */
  const h = Math.max(1e-5, dt / sub)
  const { pos, prev, vel, invMass, ia, ib, rest, kind, alive, lambda } = c
  const n = invMass.length
  const m = ia.length

  const compliance = [
    p.structural ?? COMPLIANCE.structural,
    p.shear ?? COMPLIANCE.shear,
    p.bend ?? COMPLIANCE.bend,
  ]

  for (let s = 0; s < sub; s++) {
    const h2 = h * h
    lambda.fill(0)

    // --- 予測 ---
    for (let i = 0; i < n; i++) {
      const w = invMass[i]
      const o = i * 3
      if (w === 0) {
        prev[o] = pos[o]
        prev[o + 1] = pos[o + 1]
        prev[o + 2] = pos[o + 2]
        continue
      }
      /*
       * 風は面に対して働く。速度差の法線成分で押すのが正しいが、
       * ここでは**位置で位相をずらした一様な力**で代用する。
       * 一様に押すと板が平行移動するだけで、はためきが出ない。
       */
      const gust = Math.sin(pos[o] * 1.7 + p.time * 2.3) * Math.cos(pos[o + 1] * 1.3 - p.time * 1.7)
      vel[o] += (p.windX * (0.6 + gust * 0.8)) * h
      vel[o + 1] += p.gravity * h
      vel[o + 2] += (p.windZ * (0.6 + gust * 0.8)) * h

      // 減衰。速度に掛ける。位置に掛けると刻み数で効きが変わる
      const d = Math.max(0, 1 - p.damping * h)
      vel[o] *= d
      vel[o + 1] *= d
      vel[o + 2] *= d

      prev[o] = pos[o]
      prev[o + 1] = pos[o + 1]
      prev[o + 2] = pos[o + 2]
      pos[o] += vel[o] * h
      pos[o + 1] += vel[o + 1] * h
      pos[o + 2] += vel[o + 2] * h
    }

    /*
     * --- 掴んでいる点を連れていく ---
     *
     * カーソルの位置へ**瞬間移動させない**。速く振ると、掴んだ点が 1 刻みで
     * 布の厚みより遠くへ飛び、面を跨いで反対側へ出る。点どうしの押し退けは
     * すり抜けた後には効かないので、そのまま絡まって戻らない。
     *
     * 上限を付けて、近づける速さを抑える。掴み心地はほとんど変わらない。
     */
    if (c.grabbed >= 0) {
      const o = c.grabbed * 3
      let dx = c.grabTarget[0] - pos[o]
      let dy = c.grabTarget[1] - pos[o + 1]
      let dz = c.grabTarget[2] - pos[o + 2]
      const d = Math.hypot(dx, dy, dz)
      const max = (p.grabSpeed ?? 1e9) * h
      if (d > max && d > 1e-9) {
        const f = max / d
        dx *= f
        dy *= f
        dz *= f
      }
      pos[o] += dx
      pos[o + 1] += dy
      pos[o + 2] += dz
    }

    // --- 拘束 ---
    for (let k = 0; k < m; k++) {
      if (!alive[k]) continue
      const a = ia[k]
      const b = ib[k]
      const wa = invMass[a]
      const wb = invMass[b]
      const w = wa + wb
      if (w === 0) continue

      const ao = a * 3
      const bo = b * 3
      let ex = pos[ao] - pos[bo]
      let ey = pos[ao + 1] - pos[bo + 1]
      let ez = pos[ao + 2] - pos[bo + 2]
      const len = Math.hypot(ex, ey, ez)
      if (len < 1e-9) continue

      const r = rest[k]
      const C = len - r

      // 伸びすぎたら切る。四角の辺が 1 本でも切れれば、その面は落ちる
      if (p.tear && kind[k] === 0 && C > r * p.tearStrain) {
        alive[k] = 0
        c.torn = true
        continue
      }

      const at = compliance[kind[k]] / h2
      const dl = (-C - at * lambda[k]) / (w + at)
      lambda[k] += dl

      const s2 = dl / len
      ex *= s2
      ey *= s2
      ez *= s2
      if (wa > 0) {
        pos[ao] += ex * wa
        pos[ao + 1] += ey * wa
        pos[ao + 2] += ez * wa
      }
      if (wb > 0) {
        pos[bo] -= ex * wb
        pos[bo + 1] -= ey * wb
        pos[bo + 2] -= ez * wb
      }
    }

    /*
     * --- 移動量の頭打ち ---
     *
     * 1 刻みで厚みを越えて動く点があると、押し退ける前に相手を通り抜ける。
     * **押し退けは通り抜けた後には効かない。** 動ける距離を厚みより内側に
     * 抑えておけば、そもそも跨げない。
     */
    if (p.thickness > 0 && p.maxMove > 0) {
      const cap = p.thickness * p.maxMove
      for (let i = 0; i < n; i++) {
        if (invMass[i] === 0) continue
        const o = i * 3
        const dx = pos[o] - prev[o]
        const dy = pos[o + 1] - prev[o + 1]
        const dz = pos[o + 2] - prev[o + 2]
        const d = Math.hypot(dx, dy, dz)
        if (d <= cap || d < 1e-12) continue
        const f = cap / d
        pos[o] = prev[o] + dx * f
        pos[o + 1] = prev[o + 1] + dy * f
        pos[o + 2] = prev[o + 2] + dz * f
      }
    }

    /*
     * --- 自己衝突 ---
     *
     * 引っ張って折り返した布は、放っておくと**自分をすり抜けて重なる**。
     * 重なった層は面の向きが打ち消し合って、癒着したように見える。
     *
     * 刻みごとに掛けると計算が倍になる（32×32 で 3.3ms → 7.1ms）。
     * **最後の刻みだけで足りる。** 1 フレームに 1 回押し退ければ、目に見える
     * 貫通は起きない。細かく畳む場面だけ `selfEvery` を上げる。
     */
    if (p.thickness > 0 && (p.selfEvery || s === sub - 1)) selfCollide(c, p.thickness)

    /*
     * --- ひずみ制限 ---
     *
     * 拘束を 1 回解くだけでは、荷重が端から端へ伝わりきらない。**縦に長い
     * 布ほど伸びが残り**、刻みを増やして潰そうとすると計算が跳ね上がる
     * （40×40 で伸び 1.0 倍に収めるのに 30 刻み = 12ms）。
     *
     * 伸びの上限を決めて、超えたぶんだけ直接引き戻す。これは物理ではなく
     * 後処理だが、布は本来ほとんど伸びないので**制限の方が実物に近い**。
     *
     * **1 回では足りない。** 直した辺の隣がまた伸びる。とくに留め点の隣は
     * 荷重が集まるので、1 回だと 1.3 倍のまま残る。数回まわす。structural
     * だけなので 1 回は安い。
     */
    for (let pass = 0; p.maxStrain > 0 && pass < (p.strainPasses || 1); pass++) {
      const limit = 1 + p.maxStrain
      for (let k = 0; k < m; k++) {
        if (!alive[k] || kind[k] !== 0) continue
        const a = ia[k]
        const b = ib[k]
        const wa = invMass[a]
        const wb = invMass[b]
        const w = wa + wb
        if (w === 0) continue
        const ao = a * 3
        const bo = b * 3
        const ex = pos[ao] - pos[bo]
        const ey = pos[ao + 1] - pos[bo + 1]
        const ez = pos[ao + 2] - pos[bo + 2]
        const len = Math.hypot(ex, ey, ez)
        const max = rest[k] * limit
        if (len <= max || len < 1e-9) continue
        const f = ((len - max) / len) / w
        if (wa > 0) {
          pos[ao] -= ex * f * wa
          pos[ao + 1] -= ey * f * wa
          pos[ao + 2] -= ez * f * wa
        }
        if (wb > 0) {
          pos[bo] += ex * f * wb
          pos[bo + 1] += ey * f * wb
          pos[bo + 2] += ez * f * wb
        }
      }
    }

    /*
     * --- 障害物と床 ---
     *
     * 押し出すだけでは足りない。**摩擦が無いと布は球を滑り落ちる。**
     * 掛けた布が留まるのは摩擦のおかげで、押し出しだけだと必ず床まで落ちる。
     *
     * 接している点は、この刻みで面に沿って動いたぶんを削る。前の位置へ
     * 引き戻すので、速度の取り直しにもそのまま効く。
     */
    const fr = Math.min(1, Math.max(0, p.friction ?? 0))
    for (let i = 0; i < n; i++) {
      if (invMass[i] === 0) continue
      const o = i * 3

      if (p.sphereR > 0) {
        const dx = pos[o] - p.sphere[0]
        const dy = pos[o + 1] - p.sphere[1]
        const dz = pos[o + 2] - p.sphere[2]
        const d = Math.hypot(dx, dy, dz)
        // 少し余裕を持たせる。ぴったりだと布が球に食い込んで縞が出る
        const r = p.sphereR + 0.02
        if (d < r && d > 1e-6) {
          const s3 = (r - d) / d
          pos[o] += dx * s3
          pos[o + 1] += dy * s3
          pos[o + 2] += dz * s3

          if (fr > 0) {
            // 面に沿った移動ぶんだけ戻す。法線方向は触らない
            const nx = dx / d
            const ny = dy / d
            const nz = dz / d
            let mx = pos[o] - prev[o]
            let my = pos[o + 1] - prev[o + 1]
            let mz = pos[o + 2] - prev[o + 2]
            const dot = mx * nx + my * ny + mz * nz
            mx -= nx * dot
            my -= ny * dot
            mz -= nz * dot
            pos[o] -= mx * fr
            pos[o + 1] -= my * fr
            pos[o + 2] -= mz * fr
          }
        }
      }

      if (pos[o + 1] < p.floor) {
        pos[o + 1] = p.floor
        if (fr > 0) {
          pos[o] -= (pos[o] - prev[o]) * fr
          pos[o + 2] -= (pos[o + 2] - prev[o + 2]) * fr
        }
      }
    }

    // --- 速度を位置から取り直す ---
    for (let i = 0; i < n; i++) {
      const o = i * 3
      if (invMass[i] === 0) {
        vel[o] = vel[o + 1] = vel[o + 2] = 0
        continue
      }
      vel[o] = (pos[o] - prev[o]) / h
      vel[o + 1] = (pos[o + 1] - prev[o + 1]) / h
      vel[o + 2] = (pos[o + 2] - prev[o + 2]) / h
    }
  }
}

/** 最も近い点。掴む相手を探す */
export function nearest(c, x, y, z) {
  let best = -1
  let bd = Infinity
  for (let i = 0; i < c.invMass.length; i++) {
    const o = i * 3
    const d = (c.pos[o] - x) ** 2 + (c.pos[o + 1] - y) ** 2 + (c.pos[o + 2] - z) ** 2
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return { index: best, dist: Math.sqrt(bd) }
}
