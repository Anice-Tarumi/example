import * as THREE from 'three'

/**
 * 織り目の法線マップを作る。
 *
 * 平らな面に単色を塗ると、どれだけ揺れても**紙かゴム**に見える。布に見える
 * かどうかは、面の細かい凹凸が拾う光で決まる。素材は持たず、経糸と緯糸の
 * 高さ場をその場で作って法線へ落とす。
 *
 * 繰り返しは必ず**継ぎ目のない周期**にする。sin の周期をタイルの整数分の 1 に
 * 合わせないと、貼ったときに縦横の線が出る。
 */
export function makeWeaveNormal(size = 128, threads = 8, depth = 1) {
  const data = new Uint8Array(size * size * 4)

  const height = (x, y) => {
    const u = (x / size) * Math.PI * 2 * threads
    const v = (y / size) * Math.PI * 2 * threads
    // 経糸と緯糸。互い違いに浮き沈みさせると綾になる
    const warp = Math.sin(u) * 0.5 + 0.5
    const weft = Math.sin(v) * 0.5 + 0.5
    const over = Math.sin(u) * Math.sin(v) > 0 ? 1 : 0.55
    return (warp * 0.5 + weft * 0.5) * over
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 中央差分。端は周期で回り込ませる
      const xm = (x - 1 + size) % size
      const xp = (x + 1) % size
      const ym = (y - 1 + size) % size
      const yp = (y + 1) % size
      const dx = (height(xp, y) - height(xm, y)) * depth
      const dy = (height(x, yp) - height(x, ym)) * depth

      const nx = -dx
      const ny = -dy
      const nz = 1
      const len = Math.hypot(nx, ny, nz)

      const i = (y * size + x) * 4
      data[i] = ((nx / len) * 0.5 + 0.5) * 255
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(14, 14)
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}
