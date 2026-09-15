import * as THREE from 'three'

/**
 * matcap をその場で焼く。
 *
 * matcap は「球に当たった光をそのまま撮った 1 枚」。だから素材として配るのが
 * 普通だが、**光の式が分かっているなら計算で作れる**。作れると、色も硬さも
 * 実行時に変えられるうえ、権利の話が要らない。
 *
 * ここでは 3 つの成分を**別々のチャンネルに詰める**。
 *
 *   R … 拡散（面の向きで緩やかに変わる）
 *   G … 粗い鏡面（広いハイライト）
 *   B … 鋭い鏡面（狭いハイライト）
 *
 * 1 枚に色まで焼き込むと、色を変えたいだけで焼き直しになる。**濃淡だけ焼いて
 * 色は実行時に掛ける。** 3 つに分けておけば、材質ごとに配合を変えられる。
 */

/**
 * 球の見た目を 1 枚に描く。
 *
 * 画素の位置から**その点の法線**を逆算するのが要点。matcap は正射影で見た
 * 単位球なので、uv から x, y が決まれば z は球の式で出る。
 */
export function bakeMatcap(size = 256, opts = {}) {
  const {
    lightA = [0.4, 0.75, 0.5],
    lightB = [-0.6, 0.2, 0.4],
    roughPower = 12,
    sharpPower = 120,
    fresnelPower = 3.2,
  } = opts

  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  const L1 = norm(lightA)
  const L2 = norm(lightB)

  const data = new Uint8Array(size * size * 4)

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size * 2 - 1
      const v = (py + 0.5) / size * 2 - 1
      const r2 = u * u + v * v
      const i = (py * size + px) * 4

      if (r2 > 1) {
        // 円の外。**捨てずに縁の値を伸ばす**。切ると輪郭に黒が出る
        const s = 1 / Math.sqrt(r2)
        const eu = u * s
        const ev = v * s
        writePixel(data, i, eu, ev, 0, L1, L2, roughPower, sharpPower, fresnelPower)
        continue
      }

      const z = Math.sqrt(1 - r2)
      writePixel(data, i, u, v, z, L1, L2, roughPower, sharpPower, fresnelPower)
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

function writePixel(data, i, nx, ny, nz, L1, L2, roughPower, sharpPower, fresnelPower) {
  // 視線は正射影なので常に +z
  const vx = 0
  const vy = 0
  const vz = 1

  const dot = (a, b, c, d, e, f) => a * d + b * e + c * f
  const ndl1 = Math.max(0, dot(nx, ny, nz, L1[0], L1[1], L1[2]))
  const ndl2 = Math.max(0, dot(nx, ny, nz, L2[0], L2[1], L2[2]))

  // 拡散。裏側も真っ黒にせず、弱い環境光を足す
  const diffuse = Math.min(1, 0.18 + ndl1 * 0.85 + ndl2 * 0.35)

  // 鏡面。半角ベクトルで 2 灯ぶん
  const spec = (L) => {
    const hx = L[0] + vx
    const hy = L[1] + vy
    const hz = L[2] + vz
    const hl = Math.hypot(hx, hy, hz) || 1
    return Math.max(0, dot(nx, ny, nz, hx / hl, hy / hl, hz / hl))
  }
  const h1 = spec(L1)
  const h2 = spec(L2)
  const rough = Math.min(1, h1 ** roughPower + h2 ** roughPower * 0.6)
  const sharp = Math.min(1, h1 ** sharpPower + h2 ** sharpPower * 0.5)

  /*
   * 縁の立ち上がり（フレネル）は**鋭い鏡面へ混ぜる**。別チャンネルに分けても
   * いいが、金属でもガラスでも「縁が光る」は鋭い側と一緒に動くことが多い。
   */
  const fres = (1 - Math.abs(nz)) ** fresnelPower

  data[i] = diffuse * 255
  data[i + 1] = rough * 255
  data[i + 2] = Math.min(1, sharp + fres * 0.8) * 255
  data[i + 3] = 255
}

/** 焼いた matcap をそのまま見せる板。仕組みの説明用 */
export function matcapPreviewMaterial(tex) {
  return new THREE.MeshBasicMaterial({ map: tex })
}
