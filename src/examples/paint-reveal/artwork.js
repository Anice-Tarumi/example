import * as THREE from 'three'

/**
 * 下地の絵。
 *
 * 元サイト（ai-quest）は手描き調の絵本イラストを敷き、その彩度を
 * マスクで戻していく。ここでは外部アセットを持たないので Canvas2D で
 * 絵本風の風景を描く。彩度を落としたときと戻したときの差がはっきり出るよう、
 * 色相の離れた面を並べている。
 */
const W = 2048
const H = 1152

function makeCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  return [canvas, canvas.getContext('2d')]
}

/** 決定的な擬似乱数。毎回同じ絵になるようにする */
function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function hills(ctx, rand, baseY, amplitude, color, steps = 14) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.lineTo(0, baseY)
  const pts = []
  for (let i = 0; i <= steps; i++) {
    pts.push({
      x: (W / steps) * i,
      y: baseY - Math.sin((i / steps) * Math.PI) * amplitude * (0.6 + rand() * 0.6),
    })
  }
  // 制御点の中点を通す二次ベジェで丘のシルエットを滑らかにする
  ctx.lineTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const cur = pts[i]
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2)
  }
  ctx.lineTo(W, baseY)
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
}

function tree(ctx, x, y, scale, trunk, leaf) {
  ctx.fillStyle = trunk
  ctx.fillRect(x - 7 * scale, y - 60 * scale, 14 * scale, 62 * scale)
  ctx.fillStyle = leaf
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(x, y - (70 + i * 26) * scale, (44 - i * 9) * scale, 0, Math.PI * 2)
    ctx.fill()
  }
}

function buildScene() {
  const [canvas, ctx] = makeCanvas()
  const rand = makeRandom(20260826)

  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.8)
  sky.addColorStop(0, '#1b3a8f')
  sky.addColorStop(0.45, '#4f7ad6')
  sky.addColorStop(0.75, '#f2a65a')
  sky.addColorStop(1, '#f7d08a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // 太陽
  const sunX = W * 0.72
  const sunY = H * 0.42
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 340)
  glow.addColorStop(0, 'rgba(255,236,170,0.95)')
  glow.addColorStop(0.35, 'rgba(255,180,90,0.45)')
  glow.addColorStop(1, 'rgba(255,150,60,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(sunX, sunY, 340, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffe9a8'
  ctx.beginPath()
  ctx.arc(sunX, sunY, 88, 0, Math.PI * 2)
  ctx.fill()

  // 雲
  ctx.fillStyle = 'rgba(255,246,235,0.7)'
  for (let i = 0; i < 7; i++) {
    const cx = rand() * W
    const cy = H * 0.1 + rand() * H * 0.22
    const s = 0.6 + rand() * 0.9
    for (let j = 0; j < 4; j++) {
      ctx.beginPath()
      ctx.ellipse(cx + j * 42 * s, cy + Math.sin(j) * 12 * s, 58 * s, 26 * s, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 丘。奥から手前へ、彩度と明度を上げていく
  hills(ctx, rand, H * 0.66, 90, '#6d4d8f')
  hills(ctx, rand, H * 0.74, 110, '#2f6f6a')
  hills(ctx, rand, H * 0.84, 90, '#2b8c4f')
  hills(ctx, rand, H * 0.95, 70, '#1c6b33')

  // 木
  tree(ctx, W * 0.13, H * 0.9, 1.5, '#5a3418', '#20713a')
  tree(ctx, W * 0.24, H * 0.96, 2.1, '#5a3418', '#1a5f31')
  tree(ctx, W * 0.86, H * 0.92, 1.7, '#5a3418', '#24793f')

  // 花
  const petals = ['#ff5d5d', '#ffd23c', '#ff8ad1', '#fffbe8']
  for (let i = 0; i < 130; i++) {
    const x = rand() * W
    const y = H * 0.86 + rand() * H * 0.14
    const r = 5 + rand() * 7
    ctx.fillStyle = petals[(rand() * petals.length) | 0]
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  return canvas
}

let cached = null

export function getArtwork() {
  if (!cached) {
    const tex = new THREE.CanvasTexture(buildScene())
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    cached = tex
  }
  return cached
}

export const ARTWORK_ASPECT = W / H
