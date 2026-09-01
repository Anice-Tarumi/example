import * as THREE from 'three'

/**
 * 高さ場。
 *
 * 壁の隆起も、球が刻む溝も、すべてこの 1 枚の場に足し引きする。
 * 描画（法線・影）と物理（斜面の勾配）が**同じ場を読む**のが要点で、
 * 見えている隆起と球の挙動が食い違わない。
 *
 * ---
 *
 * **なぜ GPU の ping-pong ではなく CPU に置くか。**
 *
 * 球の物理は毎フレーム高さと勾配を読む。場が GPU にあると
 * `readRenderTargetPixels` で読み戻すことになり、そこで同期待ちが起きる。
 * 一方 256 角のラプラシアン拡散と減衰は 65,536 セル、JS でも 1ms を切る。
 * **読み戻しを避けるほうが速い。**
 *
 * 解像度が低いぶん法線は粗くなるが、表面には別途 石膏の微細な凹凸を
 * 重ねるので目立たない。
 */

export function createHeightField(size = 256) {
  const data = new Float32Array(size * size)
  const next = new Float32Array(size * size)

  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.FloatType)
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  /** uv（0..1）を中心にガウシアンで加算する。負を渡せば掘る */
  function stamp(u, v, radius, amount) {
    const cx = u * size
    const cy = v * size
    const r = radius * size
    if (r < 0.5) return

    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(size - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(size - 1, Math.ceil(cy + r))
    const inv = 1 / (r * r)

    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx
        const d2 = (dx * dx + dy * dy) * inv
        if (d2 >= 1) continue
        // 端で 0 に収まる滑らかな山。切り立った縁は法線が破綻する
        const f = 1 - d2
        data[y * size + x] += amount * f * f
      }
    }
  }

  /**
   * 2 点を結ぶ線でスタンプする。
   *
   * フレーム間でカーソルは飛ぶ。点だけを押すと、速く動かしたときに
   * **点線になる**。間を補間して初めて「なぞった」に見える。
   */
  function stampLine(u0, v0, u1, v1, radius, amount) {
    const dx = u1 - u0
    const dy = v1 - v0
    const dist = Math.hypot(dx, dy)
    // 半径の 1/3 刻み。粗いと数珠つなぎの玉に見える
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.33)))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      stamp(u0 + dx * t, v0 + dy * t, radius, amount / steps)
    }
  }

  /**
   * 拡散と減衰。
   *
   * 拡散が無いと、押した跡がそのままの形で残って粘土に見えない。
   * 係数は 0.25 が安定限界（5 点ラプラシアンの陽解法）。超えると振動する。
   */
  function step(dt, { diffuse = 0.18, decay = 0.35, cap = 1 } = {}) {
    const k = Math.min(0.24, diffuse)
    for (let y = 0; y < size; y++) {
      const yUp = y > 0 ? y - 1 : 0
      const yDn = y < size - 1 ? y + 1 : size - 1
      for (let x = 0; x < size; x++) {
        const xL = x > 0 ? x - 1 : 0
        const xR = x < size - 1 ? x + 1 : size - 1
        const i = y * size + x
        const lap =
          data[y * size + xL] + data[y * size + xR] + data[yUp * size + x] + data[yDn * size + x] - 4 * data[i]
        next[i] = data[i] + lap * k
      }
    }
    /*
     * 減衰は指数。線形だと消え際が急に止まって不自然。
     *
     * そのあと上限で切る。なぞり続けると場は青天井に伸びるので、
     * 「この高さより上は固い」というしきい値が意味を持たなくなるし、
     * 球が手前に飛び出して巨大に見える。
     *
     * **`v/(1+|v|/cap)` のような圧縮は使えない。** 上限未満の値まで縮むうえ、
     * 毎フレーム掛かるので実質的な減衰になり、カーソル直下しか残らなくなる。
     * 単純な clamp なら二度掛けても値が変わらない。
     */
    const f = Math.exp(-decay * dt)
    for (let i = 0; i < data.length; i++) {
      const v = next[i] * f
      data[i] = v > cap ? cap : v < -cap ? -cap : v
    }
    texture.needsUpdate = true
  }

  /** uv での高さ。双線形。物理とシェーダーで同じ値を読ませる */
  function height(u, v) {
    const fx = Math.min(size - 1.001, Math.max(0, u * size - 0.5))
    const fy = Math.min(size - 1.001, Math.max(0, v * size - 0.5))
    const x = Math.floor(fx)
    const y = Math.floor(fy)
    const tx = fx - x
    const ty = fy - y
    const i = y * size + x
    const a = data[i] * (1 - tx) + data[i + 1] * tx
    const b = data[i + size] * (1 - tx) + data[i + size + 1] * tx
    return a * (1 - ty) + b * ty
  }

  /**
   * uv での勾配（uv 空間あたり）。中心差分。
   *
   * 差分幅は呼び手が決める。球の半径で取ると、1 テクセルの荒れではなく
   * **球が実際に当たる面の傾き**が出る。テクセル幅だと粒に引っかかって震える。
   */
  function gradient(u, v, out, e = 1.5 / size) {
    out.x = (height(u + e, v) - height(u - e, v)) / (2 * e)
    out.y = (height(u, v + e) - height(u, v - e)) / (2 * e)
    return out
  }

  function clear() {
    data.fill(0)
    texture.needsUpdate = true
  }

  return { size, data, texture, stamp, stampLine, step, height, gradient, clear, dispose: () => texture.dispose() }
}
