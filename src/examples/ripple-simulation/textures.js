import * as THREE from 'three'

const SIZE = 1024

function makeCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  return [canvas, canvas.getContext('2d')]
}

function finish(canvas) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  return tex
}

/** 市松模様。波紋の歪みが最も読み取りやすい */
function checker() {
  const [canvas, ctx] = makeCanvas()
  const n = 16
  const c = SIZE / n
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#101418' : '#e8eef4'
      ctx.fillRect(x * c, y * c, c, c)
    }
  }
  return finish(canvas)
}

/** 細いラインのグリッド。屈折で線が波打つのが見える */
function grid() {
  const [canvas, ctx] = makeCanvas()
  ctx.fillStyle = '#0b0f14'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = '#4fd7ff'
  ctx.lineWidth = 2
  const step = SIZE / 24
  ctx.beginPath()
  for (let i = 0; i <= 24; i++) {
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, SIZE)
    ctx.moveTo(0, i * step)
    ctx.lineTo(SIZE, i * step)
  }
  ctx.stroke()
  return finish(canvas)
}

/** 斜めのカラーグラデーション。滑らかな面での屈折を見る用 */
function gradient() {
  const [canvas, ctx] = makeCanvas()
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  g.addColorStop(0.0, '#ff4d00')
  g.addColorStop(0.35, '#ff00a8')
  g.addColorStop(0.7, '#5b2bff')
  g.addColorStop(1.0, '#00e5ff')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)
  return finish(canvas)
}

/** ランダムなカラーブロック。エッジが多く歪みが派手に出る */
function blocks() {
  const [canvas, ctx] = makeCanvas()
  ctx.fillStyle = '#07090c'
  ctx.fillRect(0, 0, SIZE, SIZE)
  const palette = ['#ff5a3c', '#ffd23c', '#3cff9e', '#3cc4ff', '#b03cff', '#f5f5f5']
  const n = 22
  const c = SIZE / n
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (Math.random() < 0.42) continue
      ctx.fillStyle = palette[(Math.random() * palette.length) | 0]
      const pad = c * 0.12
      ctx.fillRect(x * c + pad, y * c + pad, c - pad * 2, c - pad * 2)
    }
  }
  return finish(canvas)
}

const BUILDERS = { checker, grid, gradient, blocks }

export const TEXTURE_NAMES = Object.keys(BUILDERS)

/** 名前からテクスチャを生成する。生成済みのものは使い回す。 */
const cache = new Map()
export function getTexture(name) {
  if (!cache.has(name)) {
    cache.set(name, (BUILDERS[name] || checker)())
  }
  return cache.get(name)
}

export function disposeTextures() {
  for (const tex of cache.values()) tex.dispose()
  cache.clear()
}
