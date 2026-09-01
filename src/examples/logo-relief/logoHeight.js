import { insideDistance, createEdtScratch } from '../../shared/edt'

/**
 * ロゴ画像から**高さ場**を焼く。
 *
 * マスクをそのまま高さにすると、縁が垂直に切り立って法線が破綻し、
 * 「紙を貼った」ように見える。石膏のレリーフに見せるには**ベベル**が要る。
 *
 * 距離変換で「境界からの距離」を出し、それを立ち上がりに使う。
 * 数 px ぶんで滑らかに 0 → 1 へ持ち上げると、縁が丸まって彫刻になる。
 *
 *   円盤 … 外形。持ち上げる
 *   文字 … 円盤より明るい部分。彫り込む（負の高さ）
 *
 * 高さ場は正方形ではなく**板の縦横比に合わせた矩形**に置く。
 * uv は等方ではないので、正方形のまま貼ると横に伸びる。
 */

export async function bakeLogoHeight(url, {
  size = 256,
  aspect = 1,          // 板の 横 / 縦
  scale = 0.62,        // 板の高さに対するロゴの大きさ
  offsetY = 0,
  bevel = 0.055,       // ロゴの大きさに対するベベル幅
  engrave = 0.55,      // 文字を彫る深さ
  super: ss = 2,       // 何倍で焼いてから縮めるか
  smooth = 1 / 24,     // 二値化する前にぼかす量（ロゴの大きさに対する比）
} = {}) {
  const img = new Image()
  img.src = url
  await img.decode()

  /*
   * **拡大して焼いてから縮める。**
   * マスクを二値化して距離変換に掛けると、境界はテクセル単位で階段になる。
   * ベベル幅が数テクセルしかないので、その階段がそのまま法線に出て、
   * 彫刻ではなくドット絵の押し出しに見える。
   * 2 倍で焼いて平均すれば、境界が半テクセル単位まで滑らかになる。
   */
  const big = size * ss

  // ロゴを置く矩形。uv の異方性をここで吸収する
  const boxH = Math.round(big * scale)
  const boxW = Math.round((boxH / aspect))
  const x0 = Math.round((big - boxW) / 2)
  const y0 = Math.round((big - boxH) / 2 - offsetY * big)

  const canvas = document.createElement('canvas')
  canvas.width = big
  canvas.height = big
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, big, big)
  // canvas は上下が逆。テクスチャに合わせて反転して描く
  ctx.translate(0, big)
  ctx.scale(1, -1)
  ctx.drawImage(img, x0, y0, boxW, boxH)

  const px = ctx.getImageData(0, 0, big, big).data
  const n = big * big

  /*
   * **二値化する前にぼかす。**
   *
   * 元画像が低解像度を引き伸ばしたものだと、輪郭がソース画素そのままの
   * 階段になっている。距離変換は入力に忠実なので、階段はそのまま
   * ベベルに乗り、彫刻ではなくドット絵の押し出しに見える。
   * 連続値のうちにぼかしてから 0.5 で切ると、輪郭が半画素単位で滑らかになる。
   */
  const alpha = new Float32Array(n)
  const lum = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    alpha[i] = px[i * 4 + 3] / 255
    lum[i] = (px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722) / 255
  }
  const blurR = Math.round(smooth * boxH)
  if (blurR > 0) {
    boxBlur(alpha, big, blurR)
    boxBlur(alpha, big, blurR)
    boxBlur(lum, big, blurR)
    boxBlur(lum, big, blurR)
  }

  const solid = new Uint8Array(n)
  const bright = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (alpha[i] < 0.5) continue
    solid[i] = 1
    // 地の色より明るい部分は文字。彫り込む側に回す
    if (lum[i] > 0.72) bright[i] = 1
  }

  const scratch = createEdtScratch(big)
  const dSolid = insideDistance(solid, big, big, scratch)
  const dBright = insideDistance(bright, big, big, scratch)

  const bevelPx = Math.max(1.5 * ss, bevel * boxH)
  const hi = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (!solid[i]) continue
    // 境界からの距離で立ち上げる。smoothstep で縁を丸める
    const t = Math.min(1, dSolid[i] / bevelPx)
    const disc = t * t * (3 - 2 * t)
    /*
     * 文字は細い。円盤と同じベベル幅で立ち上げると、線の太さが
     * ベベル 2 本ぶんに満たず、彫りが最後まで届かないまま潰れる。
     */
    const s = Math.min(1, dBright[i] / (bevelPx * 0.45))
    const letter = s * s * (3 - 2 * s)
    hi[i] = disc - letter * engrave
  }

  // 平均して縮める。ここで境界のジャギが均される
  const out = new Float32Array(size * size)
  const inv = 1 / (ss * ss)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0
      for (let j = 0; j < ss; j++) {
        const row = (y * ss + j) * big + x * ss
        for (let k = 0; k < ss; k++) sum += hi[row + k]
      }
      out[y * size + x] = sum * inv
    }
  }
  return out
}

/** 分離型のボックスぼかし。2 回掛ければガウシアンの近似になる */
function boxBlur(data, size, r) {
  const tmp = new Float32Array(data.length)
  const w = r * 2 + 1

  for (let y = 0; y < size; y++) {
    let sum = 0
    for (let x = -r; x <= r; x++) sum += data[y * size + Math.min(size - 1, Math.max(0, x))]
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = sum / w
      const out = Math.min(size - 1, Math.max(0, x - r))
      const inn = Math.min(size - 1, Math.max(0, x + r + 1))
      sum += data[y * size + inn] - data[y * size + out]
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(size - 1, Math.max(0, y)) * size + x]
    for (let y = 0; y < size; y++) {
      data[y * size + x] = sum / w
      const out = Math.min(size - 1, Math.max(0, y - r))
      const inn = Math.min(size - 1, Math.max(0, y + r + 1))
      sum += tmp[inn * size + x] - tmp[out * size + x]
    }
  }
}
