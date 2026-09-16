import * as THREE from 'three'

/**
 * 等距円筒の環境マップをその場で焼く。
 *
 * 本家の `WorkItemShader` は板の地をこう作っている。
 *
 *   color += envColorEquiRGB(tEnv, vRefraction, 0.2, 0.05) * 0.08;
 *
 * `tEnv` は `assets/images/work/env1.jpg`。**これが板の地の明るさ**で、
 * 無いと板は真っ黒から始まり、粒子が後ろに来た所だけ光る「穴」になる
 * （実際そうなった）。
 *
 * 配布物は使えないので計算で焼く。スタジオの環境を模す。
 *
 *   - 上は明るい（天井の面光源）
 *   - 水平に細い明るい帯（機材の列）
 *   - 下は暗い（床）
 *   - 光源を 2 つ、柔らかく
 *
 * 色は置かない。冷たい側へわずかに振るだけ。
 */
export function bakeEnvMap(width = 256) {
  const height = width / 2
  const data = new Uint8Array(width * height * 4)

  /** 方向ベクトルから明るさを出す */
  const sample = (dx, dy, dz) => {
    // 天井。上を向くほど明るい
    let v = 0.06 + Math.max(0, dy) ** 1.6 * 0.42

    // 床。下はほぼ落とす
    v *= 1 - Math.max(0, -dy) * 0.55

    /*
     * 水平の帯。**これが縁のハイライトになる。**
     * 帯が無いと、どの角度から見ても同じ明るさで、
     * ガラスが回っているのが分からない。
     */
    v += Math.exp(-((dy / 0.10) ** 2)) * 0.30

    // 柔らかい光源を 2 つ。向きが変わると流れるハイライトが出る
    const soft = (lx, ly, lz, s, g) => {
      const d = dx * lx + dy * ly + dz * lz
      return Math.max(0, d) ** s * g
    }
    v += soft(0.45, 0.72, 0.52, 22, 0.85)
    v += soft(-0.72, 0.18, -0.36, 12, 0.32)

    /*
     * 縦の帯光。**これが無いと板が一様な灰色になる。**
     * 板は平らなので環境を引く向きがほとんど変わらず、環境側に細かい
     * 構造が無いと、面のどこを見ても同じ明るさになる。
     * 立てた光を何本か置くと、角度が変わるたびにハイライトが面を横切る。
     */
    const phi = Math.atan2(dz, dx)
    const strip = Math.cos(phi * 5.0) * 0.5 + 0.5
    v += Math.pow(strip, 14) * 0.55 * Math.exp(-((dy / 0.55) ** 2))

    return v
  }

  for (let y = 0; y < height; y++) {
    const theta = (y + 0.5) / height * Math.PI
    /*
     * **上下を取り違えない。** `envColorEquiRGB` は `asin(dir.y)*0.318+0.5`
     * で v を出すので、**v = 1 が上**。テクスチャの最初の行が v = 0 なので、
     * 行を上から下へ回すなら符号を反転させる。逆に焼くと、板が床を
     * 映しているのに天井の明るさが出る。
     */
    const sy = -Math.cos(theta)
    const st = Math.sin(theta)
    for (let x = 0; x < width; x++) {
      const phi = ((x + 0.5) / width) * Math.PI * 2 - Math.PI
      const sx = st * Math.cos(phi)
      const sz = st * Math.sin(phi)
      const v = sample(sx, sy, sz)
      const i = (y * width + x) * 4
      // 冷たい側へ。彩度は乗せない
      data[i] = Math.min(255, v * 232)
      data[i + 1] = Math.min(255, v * 243)
      data[i + 2] = Math.min(255, v * 255)
      data[i + 3] = 255
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}
