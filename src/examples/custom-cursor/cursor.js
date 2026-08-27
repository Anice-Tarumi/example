/**
 * canvas 2D のカスタムカーソル。
 *
 * DOM + CSS では作れないもの——手描きのブレた輪郭、紙テクスチャの塗り、
 * 任意パスへのモーフ——を 150×150 の canvas 1 枚でやる。負荷はほぼゼロ。
 *
 * 設計の型は 3 つ。
 *   1. 状態は**スタック**で持つ（push / release）。フラグの組み合わせで計算しない
 *   2. 全パラメータを「現在値 / 目標値 + 共通ダンピング」で持つ
 *   3. 形のモーフは SVG の getPointAtLength で等間隔サンプルして同数の点で lerp
 *
 * React には依存しない。素の class 2 つ。
 */

export const STATES = {
  DEFAULT: 'default',
  HOVER_UI: 'hover_ui',
  DRAG: 'drag',
  TEXT: 'text',
  HOLD: 'hold',
  VIEW: 'view',
}

/**
 * 状態スタック。
 *
 * 「シーンが DRAG」の上に「UI にホバーした（HOVER_UI）」が乗り、
 * ホバーを外すと release で**元の DRAG に自動的に戻る**。
 * フラグの組み合わせから最終状態を計算する方式より壊れにくい。
 */
export class CursorManager {
  constructor() {
    this.stateList = []
    this.text = ''
    this.locked = false
    this.listeners = new Set()
  }

  on(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit() {
    const s = this.getCurrentState()
    this.listeners.forEach((fn) => fn(s, this.text))
  }

  setText(t) {
    this.text = t
    this.emit()
  }

  pushState(s) {
    if (this.locked) return
    this.stateList.push(s)
    this.emit()
  }

  /** 同名が複数積まれていても、**最後の 1 件だけ**抜く。全部消すとネストが壊れる */
  releaseState(s) {
    if (this.locked) return
    let last = -1
    for (let i = 0; i < this.stateList.length; i++) {
      if (this.stateList[i] === s) last = i
    }
    if (last >= 0) {
      this.stateList.splice(last, 1)
      this.emit()
    }
  }

  getCurrentState() {
    return this.stateList[this.stateList.length - 1] || STATES.DEFAULT
  }

  /** 遷移アニメーション中は凍結する */
  lock() {
    this.locked = true
  }
  unlock() {
    this.locked = false
  }
  reset() {
    this.stateList = []
    this.emit()
  }
}

const lerp = (a, b, t) => a + (b - a) * t

/** 紙目のパターンを手続きで作る。外部画像を持たない */
function makePaperPattern(ctx, size = 96, tone = '#f4f1e8', grain = 12) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  g.fillStyle = tone
  g.fillRect(0, 0, size, size)

  const img = g.getImageData(0, 0, size, size)
  const d = img.data
  // 決定論的なノイズ。毎回同じ紙目にする
  let seed = 0x9e3779b9
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const n = ((seed / 4294967296) * 2 - 1) * grain
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n))
  }
  g.putImageData(img, 0, 0)
  return ctx.createPattern(c, 'repeat')
}

export class CursorController {
  constructor(canvas, opts = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.size = opts.size ?? 150
    this.subdiv = opts.subdiv ?? 50

    // 値はすべて「現在値 / 目標値」のペア。状態が変わったら目標値だけ書き換える
    this._scale = 0
    this.targetScale = 0
    this._morph = 0
    this.targetMorph = 0
    this._ring = 0
    this.targetRing = 0
    this._x = 0
    this._y = 0
    this.targetX = 0
    this.targetY = 0

    this.damping = opts.damping ?? 0.12
    this.holdProgress = 0
    this.ovalScale = opts.ovalScale ?? 0.65
    this.ovalPos = new Float32Array(this.subdiv * 2)

    this.setDpr(window.devicePixelRatio || 1)
    this.setTheme(opts)
  }

  setDpr(dpr) {
    this.dpr = Math.min(dpr, 2)
    this.canvas.width = this.size * this.dpr
    this.canvas.height = this.size * this.dpr
    this.canvas.style.width = `${this.size}px`
    this.canvas.style.height = `${this.size}px`
    this.pattern = null
  }

  setTheme({ stroke, paper, grain, lineWidth, fill }) {
    if (stroke) this.stroke = stroke
    if (paper) this.paper = paper
    if (grain !== undefined) this.grain = grain
    if (lineWidth !== undefined) this.lineWidth = lineWidth
    if (fill !== undefined) this.fill = fill
    this.pattern = null
  }

  /**
   * SVG のパスを等間隔にサンプルして、円と同じ頂点数の点列にする。
   * デザイナーが描いた任意の形へ、これだけで lerp できるようになる。
   */
  setPath(pathEl) {
    const total = pathEl.getTotalLength()
    if (!total) return
    for (let i = 0; i < this.subdiv; i++) {
      const p = pathEl.getPointAtLength((i / this.subdiv) * total)
      this.ovalPos[i * 2] = (p.x - this.size / 2) * this.dpr * this.ovalScale
      this.ovalPos[i * 2 + 1] = (p.y - this.size / 2) * this.dpr * this.ovalScale
    }
  }

  /**
   * 手描き風の輪郭。
   *
   * 頂点を微小にずらすが、`Math.random()` は使わない。
   * 巨大な係数を掛けた cos/sin で疑似乱数を作ると、**毎フレーム同じ位置に同じブレ**が出る。
   * 結果として「手で描いた線」に見えて、しかもチラつかない。
   */
  drawNoisyOutline(radius) {
    const c = this.ctx
    const n = this.subdiv
    const t = this._morph
    const d = this.dpr

    c.save()
    c.translate((this.size / 2) * d, (this.size / 2) * d)
    c.beginPath()

    const y0 = lerp(-radius * d, (-this.size / 2) * d * this.ovalScale, t)
    c.moveTo(0, y0)

    for (let i = 0; i < n; i++) {
      const a = ((i + 1) / n) * Math.PI * 2 - Math.PI * 0.5
      let x = Math.cos(a) * radius * d
      let y = Math.sin(a) * radius * d

      x += (0.35 * Math.cos(39847239487 * i) - 0.175) * d * this.wobble
      y += (0.35 * Math.sin(392847329847 * i) - 0.175) * d * this.wobble

      x = lerp(x, this.ovalPos[i * 2], t)
      y = lerp(y, this.ovalPos[i * 2 + 1], t)
      c.lineTo(x, y)
    }

    c.closePath()
    if (this.fill) {
      c.fillStyle = this.pattern || this.paper
      c.fill()
    }
    c.lineWidth = this.lineWidth * d
    c.strokeStyle = this.stroke
    c.stroke()
    c.restore()
  }

  /** 長押しの進捗リング */
  drawRing(radius, progress, width, color) {
    if (progress <= 0.001) return
    const c = this.ctx
    const d = this.dpr
    c.beginPath()
    c.lineWidth = width * d
    c.strokeStyle = color
    c.arc(
      (this.size / 2) * d,
      (this.size / 2) * d,
      radius * d,
      -Math.PI * 0.5,
      Math.PI * 2 * progress - Math.PI * 0.5,
    )
    c.stroke()
  }

  update(opts) {
    const c = this.ctx
    if (!this.pattern && this.fill) {
      this.pattern = makePaperPattern(c, 96, this.paper, this.grain)
    }

    this.wobble = opts.wobble

    // 共通ダンピング。状態が変わっても必ず滑らかに繋がる
    const k = this.damping
    this._scale = lerp(this._scale, this.targetScale, k)
    this._morph = lerp(this._morph, this.targetMorph, k)
    this._ring = lerp(this._ring, this.targetRing, k)
    this._x = lerp(this._x, this.targetX, opts.followDamping)
    this._y = lerp(this._y, this.targetY, opts.followDamping)

    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (this._scale < 0.01) return

    const radius = opts.radius * this._scale
    this.drawNoisyOutline(radius)
    this.drawRing(radius + 8, this.holdProgress * this._ring, 2.5, this.stroke)

    this.canvas.style.transform =
      `translate3d(${this._x - this.size / 2}px, ${this._y - this.size / 2}px, 0)`
  }
}
