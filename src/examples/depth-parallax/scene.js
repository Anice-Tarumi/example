import * as THREE from 'three'

/**
 * 色画像と深度マップを同じ形状から同時に描く。
 *
 * この手法は「写真 1 枚 + その深度マップ」で成立するので、本来は
 * Depth-Anything などで推定した深度を持ってくる。ここでは外部アセットを
 * 増やさないぶん、レイヤーごとに深度が既知の絵を手続きで描き、
 * 同じ描画コードを色モードと深度モードの 2 回走らせて整合を保証している。
 *
 * 深度は 白 = 手前 / 黒 = 奥。
 */

const W = 1280
const H = 800

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 深度値 0..1 をグレースケールに */
function depthColor(d) {
  const v = Math.round(THREE.MathUtils.clamp(d, 0, 1) * 255)
  return `rgb(${v},${v},${v})`
}

/** 山の稜線 */
function ridge(ctx, rand, baseY, amp, steps, fill) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.lineTo(0, baseY)
  let prevX = 0
  let prevY = baseY
  for (let i = 1; i <= steps; i++) {
    const x = (W / steps) * i
    const y = baseY - Math.sin((i / steps) * Math.PI) * amp * (0.55 + rand() * 0.7)
    ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2)
    prevX = x
    prevY = y
  }
  ctx.lineTo(W, baseY)
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
}

/** 針葉樹 */
function conifer(ctx, x, y, h, fill) {
  ctx.fillStyle = fill
  const w = h * 0.34
  ctx.fillRect(x - h * 0.03, y - h * 0.18, h * 0.06, h * 0.2)
  for (let i = 0; i < 3; i++) {
    const t = i / 3
    const yy = y - h * (0.16 + t * 0.62)
    const ww = w * (1 - t * 0.42)
    const hh = h * 0.34
    ctx.beginPath()
    ctx.moveTo(x, yy - hh)
    ctx.lineTo(x + ww * 0.5, yy)
    ctx.lineTo(x - ww * 0.5, yy)
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * mode: 'color' | 'depth'
 * 同じ座標・同じ形状を、塗りだけ変えて 2 度描く。
 */
function drawScene(ctx, mode) {
  const rand = makeRandom(0x5eed1234)
  const c = (color, depth) => (mode === 'color' ? color : depthColor(depth))

  // 空。奥なので深度は最小
  if (mode === 'color') {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.78)
    sky.addColorStop(0, '#0d1a3d')
    sky.addColorStop(0.4, '#2b4d94')
    sky.addColorStop(0.72, '#c96f5a')
    sky.addColorStop(1, '#f0a866')
    ctx.fillStyle = sky
  } else {
    ctx.fillStyle = depthColor(0.02)
  }
  ctx.fillRect(0, 0, W, H)

  // 月
  const moonX = W * 0.74
  const moonY = H * 0.2
  if (mode === 'color') {
    const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 200)
    glow.addColorStop(0, 'rgba(255,240,200,0.9)')
    glow.addColorStop(0.3, 'rgba(255,200,150,0.35)')
    glow.addColorStop(1, 'rgba(255,180,120,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(moonX, moonY, 200, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = c('#fff3cf', 0.05)
  ctx.beginPath()
  ctx.arc(moonX, moonY, 54, 0, Math.PI * 2)
  ctx.fill()

  // 山を 3 層。奥から手前へ深度を上げる
  ridge(ctx, rand, H * 0.6, 120, 12, c('#2a2f52', 0.16))
  ridge(ctx, rand, H * 0.68, 100, 10, c('#28405f', 0.26))
  ridge(ctx, rand, H * 0.78, 80, 9, c('#1e4a55', 0.36))

  // 湖面
  ctx.fillStyle = c('#132b3a', 0.44)
  ctx.fillRect(0, H * 0.78, W, H * 0.1)

  // 中景の森
  for (let i = 0; i < 26; i++) {
    const x = rand() * W
    const h = 90 + rand() * 50
    conifer(ctx, x, H * 0.84, h, c('#13322e', 0.55))
  }

  // 岸
  ctx.fillStyle = c('#123026', 0.66)
  ctx.beginPath()
  ctx.moveTo(0, H * 0.88)
  ctx.quadraticCurveTo(W * 0.5, H * 0.845, W, H * 0.89)
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fill()

  // 手前の森。ここが一番手前なので深度が最大
  for (let i = 0; i < 12; i++) {
    const x = (i / 11) * W + (rand() - 0.5) * 60
    const h = 240 + rand() * 170
    conifer(ctx, x, H * 1.02, h, c('#07160f', 0.88))
  }

  // 手前の草
  ctx.strokeStyle = c('#050f09', 0.96)
  ctx.lineWidth = 3
  for (let i = 0; i < 160; i++) {
    const x = rand() * W
    const y = H - rand() * 60
    const len = 20 + rand() * 46
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + (rand() - 0.5) * 18, y - len * 0.6, x + (rand() - 0.5) * 26, y - len)
    ctx.stroke()
  }
}

function render(mode) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  drawScene(canvas.getContext('2d'), mode)
  return canvas
}

let cached = null

export function getSceneTextures() {
  if (cached) return cached

  const color = new THREE.CanvasTexture(render('color'))
  color.colorSpace = THREE.SRGBColorSpace
  color.wrapS = color.wrapT = THREE.ClampToEdgeWrapping
  color.minFilter = THREE.LinearFilter
  color.magFilter = THREE.LinearFilter

  const depth = new THREE.CanvasTexture(render('depth'))
  depth.colorSpace = THREE.NoColorSpace
  depth.wrapS = depth.wrapT = THREE.ClampToEdgeWrapping
  depth.minFilter = THREE.LinearFilter
  depth.magFilter = THREE.LinearFilter

  cached = { color, depth, aspect: W / H }
  return cached
}
