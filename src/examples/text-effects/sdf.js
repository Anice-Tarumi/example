import * as THREE from 'three'

/**
 * 符号付き距離場（SDF）のフォントアトラスを**実行時に**焼く。
 *
 * ふつうは msdf-bmfont-xml などで事前に作った png + json を配る。
 * ここは外部アセットを増やさず、ブラウザにあるフォントをそのまま使う。
 *
 *   1. グリフを 1 文字ずつセルに `fillText` する
 *   2. アルファを 2 値化して内外のマスクにする
 *   3. 内側・外側それぞれに完全な距離変換を掛ける
 *   4. 差を取って符号付き距離にし、spread で正規化して 0..1 に詰める
 *
 * 距離変換は Felzenszwalb の 1 次元アルゴリズムを行と列に 2 回。
 * 近似ではなく厳密なユークリッド距離が O(n) で出る。
 *
 * 素直に「SDF」であって MSDF ではない。
 * MSDF はベクタ輪郭を 3 チャンネルに割り当てて角を保つ手法で、
 * ラスタ画像からは作れない。ここでは角がわずかに丸まる。
 */

const CELL = 128
const PAD = 16
/** 何 px ぶんの距離を 0..1 に写すか。太い縁取りを引くなら広く要る */
const SPREAD = 18
/**
 * 距離変換の「無限遠」。Infinity を使ってはいけない。
 * 行がまるごと未確定（グリフの無い行）のとき Infinity - Infinity = NaN になり、
 * 以降が全部 NaN になってテクスチャが真っ黒になる。
 */
const INF = 1e20

/** Felzenszwalb の 1 次元距離変換。f は二乗距離、結果も二乗距離 */
function edt1d(f, d, v, z, n) {
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
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
    z[k + 1] = Infinity
  }

  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

/** 2 次元。行 → 列の順に 1 次元変換を掛ける */
function edt2d(grid, w, h, scratch) {
  const { f, d, v, z } = scratch
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]
    edt1d(f, d, v, z, w)
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]
    edt1d(f, d, v, z, h)
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]
  }
}

/**
 * 文字列から SDF アトラスとグリフ情報を作る。
 * 同じ文字が何度出てきても 1 セルで済むよう、重複は除く。
 */
export function buildSdfAtlas(text, fontFamily = 'sans-serif', weight = '700') {
  const chars = [...new Set([...text].filter((c) => c !== ' '))]
  const cols = Math.ceil(Math.sqrt(chars.length)) || 1
  const rows = Math.ceil(chars.length / cols)

  const w = cols * CELL
  const h = rows * CELL

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  const fontSize = CELL - PAD * 2
  // 太さはフォント側の実ウェイトに合わせる。持っていない太さを指定すると
  // ブラウザが疑似ボールドを掛けて、輪郭が歪む
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'

  // 送り幅は実測。等幅に並べると単語に見えない
  const advance = {}
  chars.forEach((c, i) => {
    const cx = (i % cols) * CELL + CELL / 2
    const cy = ((i / cols) | 0) * CELL + CELL / 2
    ctx.fillText(c, cx, cy)
    advance[c] = ctx.measureText(c).width / fontSize
  })

  const img = ctx.getImageData(0, 0, w, h).data
  // 輪郭付近だけはアルファの被覆率から距離を取り直す（後述）
  const cover = new Float32Array(CELL * CELL)
  // キャンバスと同じ向き（上が行 0）で作り、最後に上下反転して転送する
  const raw = new Uint8Array(w * h)

  // セル単位で距離変換する。またいで計算すると隣のグリフの距離が漏れ込む
  const n = CELL * CELL
  const inside = new Float64Array(n)
  const outside = new Float64Array(n)
  const scratch = {
    f: new Float64Array(CELL),
    d: new Float64Array(CELL),
    v: new Int32Array(CELL),
    z: new Float64Array(CELL + 1),
  }

  for (let ci = 0; ci < chars.length; ci++) {
    const ox = (ci % cols) * CELL
    const oy = ((ci / cols) | 0) * CELL

    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const a = img[((oy + y) * w + ox + x) * 4 + 3] / 255
        const isIn = a > 0.5
        cover[y * CELL + x] = a
        // 距離変換の入力は「そこが種か（0）／そうでないか（∞）」
        inside[y * CELL + x] = isIn ? INF : 0
        outside[y * CELL + x] = isIn ? 0 : INF
      }
    }

    edt2d(inside, CELL, CELL, scratch)
    edt2d(outside, CELL, CELL, scratch)

    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const k = y * CELL + x
        // 外側 - 内側。内側が正になるよう符号を取る
        let signed = Math.sqrt(inside[k]) - Math.sqrt(outside[k])

        /*
         * 距離変換は格子点の距離しか出せないので、輪郭のすぐ際が階段状に量子化される。
         * 拡大して縁取りを引くとギザギザとして出る。
         * 輪郭に接する画素だけは、アンチエイリアスされたアルファの被覆率から
         * 부分画素の距離を取り直す。a = 0.5 がちょうど輪郭。
         */
        if (Math.abs(signed) <= 1.0) signed = cover[k] - 0.5

        const t = signed / SPREAD / 2 + 0.5
        raw[(oy + y) * w + ox + x] = Math.round(Math.min(1, Math.max(0, t)) * 255)
      }
    }
  }

  // DataTexture は行 0 が v=0（下端）。キャンバスは行 0 が上端なので反転する
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    out.set(raw.subarray(y * w, y * w + w), (h - 1 - y) * w)
  }

  const texture = new THREE.DataTexture(out, w, h, THREE.RedFormat, THREE.UnsignedByteType)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.unpackAlignment = 1
  texture.needsUpdate = true

  const uvRect = {}
  chars.forEach((c, i) => {
    const cx = i % cols
    const cy = (i / cols) | 0
    // three のテクスチャは下から上。行を反転して渡す
    uvRect[c] = [cx / cols, 1 - (cy + 1) / rows, 1 / cols, 1 / rows]
  })

  return { texture, uvRect, advance, cell: CELL, spread: SPREAD, cols, rows }
}

/**
 * 文字列を 1 文字 1 枚の板に並べたジオメトリ。
 *
 * グリフごとに動かしたいので、頂点属性に「その文字の番号」と
 * 「その文字の中心」を持たせる。頂点シェーダーはこれを見て文字単位で変形する。
 */
export function buildTextGeometry(text, atlas, letterSpacing = 0.06) {
  const glyphs = []
  let cursor = 0

  for (const c of text) {
    if (c === ' ') {
      cursor += 0.32
      continue
    }
    const adv = atlas.advance[c] ?? 0.5
    glyphs.push({ c, x: cursor + adv / 2, adv })
    cursor += adv + letterSpacing
  }

  const total = cursor - letterSpacing
  const count = glyphs.length
  const position = new Float32Array(count * 6 * 3)
  const uv = new Float32Array(count * 6 * 2)
  const aIndex = new Float32Array(count * 6)
  const aCenter = new Float32Array(count * 6 * 2)

  // セルは正方形なので、板も正方形にして UV をそのまま貼る
  const size = atlas.cell / (atlas.cell - 24)

  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ]

  glyphs.forEach((g, i) => {
    const [ux, uy, uw, uh] = atlas.uvRect[g.c]
    const cx = g.x - total / 2

    corners.forEach(([qx, qy], k) => {
      const o = (i * 6 + k) * 3
      position[o] = cx + qx * size
      position[o + 1] = qy * size
      position[o + 2] = 0

      const u = (i * 6 + k) * 2
      uv[u] = ux + (qx + 0.5) * uw
      uv[u + 1] = uy + (qy + 0.5) * uh

      aIndex[i * 6 + k] = i
      aCenter[u] = cx
      aCenter[u + 1] = 0
    })
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setAttribute('aIndex', new THREE.BufferAttribute(aIndex, 1))
  geo.setAttribute('aCenter', new THREE.BufferAttribute(aCenter, 2))
  geo.computeBoundingSphere()

  return { geometry: geo, count, width: total }
}
