/**
 * 盤に何を出すかを決める 3 つのモード。
 *
 * どれも「0/1 の格子」に落ちるので、盤の描画は 1 つで足りる。
 * ここが持つのは**ビットの作り方**だけ。
 */

/**
 * 秩序ディザ（Bayer）。
 *
 * 誤差拡散のほうが綺麗だが、**フレーム間で結果が安定しない**。
 * 盤は差分だけ裏返すので、静止画なのに毎フレーム散発的にパタパタすると
 * 壊れて見える。閾値表なら同じ入力から常に同じ結果が出る。
 */
const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

// 使い回す。呼ぶたびに canvas を作ると、毎フレーム走らせたときに効いてくる
let sharedCanvas = null

/** 画像を 1 ビットへ。gain で明暗の寄せ方を触れる */
export function ditherImage(image, cols, rows, out, gain = 1, bias = 0) {
  if (!sharedCanvas) sharedCanvas = document.createElement('canvas')
  const canvas = sharedCanvas
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  // 盤の縦横比に合わせて切り出す（cover）
  const src = image.width / image.height
  const dst = cols / rows
  let sw = image.width
  let sh = image.height
  if (src > dst) sw = image.height * dst
  else sh = image.width / dst
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, cols, rows)

  const px = ctx.getImageData(0, 0, cols, rows).data
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const l = (px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722) / 255
      const v = Math.min(1, Math.max(0, (l - 0.5) * gain + 0.5 + bias))
      const th = (BAYER8[y % 8][x % 8] + 0.5) / 64
      // 上下が逆になるので詰めるときに反転する
      out[(rows - 1 - y) * cols + x] = v > th ? 1 : 0
    }
  }
  return out
}

/**
 * ライフゲームを 1 世代進める。
 *
 * 端は巡回させる。閉じると縁で必ず死んで、模様が中央へ縮んでいくだけになる。
 */
export function lifeStep(bits, cols, rows, next) {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = (x + dx + cols) % cols
          const ny = (y + dy + rows) % rows
          n += bits[ny * cols + nx]
        }
      }
      const alive = bits[y * cols + x]
      next[y * cols + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0)
    }
  }
  return next
}

/** 適当な初期配置。密度が高すぎるとすぐ飽和して止まる */
export function seedLife(bits, cols, rows, density = 0.28, seed = 0x51a7) {
  let s = seed >>> 0
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  for (let i = 0; i < cols * rows; i++) bits[i] = rand() < density ? 1 : 0
  return bits
}

/**
 * シーケンサーの音。
 *
 * 行が音程、列が拍。五音音階にすると、どこを押しても濁らない。
 * 半音を含む音階だと、適当に置いた時点で不協和になって「触ると楽しい」が消える。
 */
export const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26]

export function noteHz(row, rows, base = 220) {
  const idx = SCALE[(rows - 1 - row) % SCALE.length]
  const oct = Math.floor((rows - 1 - row) / SCALE.length)
  return base * 2 ** ((idx + oct * 24) / 12)
}
