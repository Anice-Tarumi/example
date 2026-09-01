import { useControls, folder } from 'leva'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import frontUrl from '../../assets/photos/scene-a.jpg'
import backUrl from '../../assets/photos/scene-b.jpg'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'
import './styles.css'

const MODES = { 'Hover each tile': 'hover', 'Auto sweep': 'auto' }
const AXES = { 'Horizontal axis': 'x', 'Vertical axis': 'y' }
const LOOKS = { 'Plate (flat colour)': 'plate', 'Photo (two images)': 'photo' }
const ORDERS = { Diagonal: 'diagonal', Row: 'row', Column: 'column', Radial: 'radial', Random: 'random' }

/**
 * DOM だけで組むタイルめくり。
 *
 * 2D の UI に載せるならこちらが正解。文字を重ねられるし、選択もコピーもできる。
 * 画像はブラウザがそのまま描くので、テクスチャに焼き直す必要もない。
 *
 * WebGL 版（tile-flip）との使い分けは枚数と絡み。
 * 数百枚を超える、背後の 3D とライティングや depth を共有したい、
 * ポストエフェクトを掛けたい、のいずれかなら WebGL。
 * キービジュアル単体で完結するなら DOM のほうが軽くて速い。
 */

/** 1 枚の画像を cols×rows に割って各パネルへ配る */
function photoStyle(url, col, row, cols, rows) {
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    // 端の 1 枚を 0% / 100% に収めるため cols-1 で割る
    backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 50}% ${rows > 1 ? (row / (rows - 1)) * 100 : 50}%`,
  }
}

function order(col, row, cols, rows, kind, seed) {
  if (kind === 'row') return row / Math.max(1, rows - 1)
  if (kind === 'column') return col / Math.max(1, cols - 1)
  if (kind === 'radial') {
    return Math.hypot(col - (cols - 1) / 2, row - (rows - 1) / 2) / (Math.hypot(cols, rows) * 0.5)
  }
  if (kind === 'random') return seed
  return (col + row) / Math.max(1, cols + rows - 2)
}

export default function DomTileFlip() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Grid: folder({
      cols: { value: DEFAULTS.cols, min: 2, max: 32, step: 1 },
      rows: { value: DEFAULTS.rows, min: 2, max: 24, step: 1 },
      gap: { value: DEFAULTS.gap, min: 0, max: 24, step: 1, label: 'gap (px)' },
      radius: { value: DEFAULTS.radius, min: 0, max: 40, step: 1, label: 'radius (px)' },
      inset: { value: DEFAULTS.inset, min: 0, max: 20, step: 0.5, label: 'inset (%)' },
    }),
    Flip: folder({
      mode: { value: DEFAULTS.mode, options: MODES },
      axis: { value: DEFAULTS.axis, options: AXES },
      duration: { value: DEFAULTS.duration, min: 0.3, max: 2.5, step: 0.05, label: 'duration (s)' },
      perspective: { value: DEFAULTS.perspective, min: 200, max: 4000, step: 50 },
      depth: { value: DEFAULTS.depth, min: -200, max: 0, step: 5, label: 'grid z (px)' },
      sweepOrder: { value: DEFAULTS.sweepOrder, options: ORDERS, label: 'order' },
      sweepSpeed: { value: DEFAULTS.sweepSpeed, min: 0.1, max: 3, step: 0.05, label: 'sweep speed' },
    }),
    Look: folder({
      look: { value: DEFAULTS.look, options: LOOKS },
      bg: { value: DEFAULTS.bg },
      plateFront: { value: DEFAULTS.plateFront, label: 'front' },
      plateBack: { value: DEFAULTS.plateBack, label: 'back' },
      ink: { value: DEFAULTS.ink, label: 'text' },
    }),
    Overlay: folder({
      title: { value: DEFAULTS.title },
      lead: { value: DEFAULTS.lead },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  const cols = Math.round(params.cols)
  const rows = Math.round(params.rows)

  const tiles = useMemo(() => {
    const list = []
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // 乱数は生成時に 1 回。毎フレーム引くと順番が毎回変わる
        const seed = ((col * 73856093) ^ (row * 19349663)) % 997 / 997
        list.push({ col, row, delay: order(col, row, cols, rows, params.sweepOrder, seed) })
      }
    }
    return list
  }, [cols, rows, params.sweepOrder])

  const rootRef = useRef(null)
  const gridRef = useRef(null)
  const rect = useRef(null)
  const lastHit = useRef(-1)

  /*
   * 格子の矩形はキャッシュする。
   *
   * `getBoundingClientRect` は同期的にレイアウトを確定させる。pointermove
   * ごとに呼ぶと、カーソルを速く動かしたときだけ反応が重くなる。
   * 変わるのは寸法かパラメータが変わったときだけなので、その時に取り直す。
   */
  const measure = useCallback(() => {
    rect.current = gridRef.current?.getBoundingClientRect() ?? null
  }, [])

  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (rootRef.current) ro.observe(rootRef.current)
    return () => ro.disconnect()
  }, [measure, cols, rows, params.inset, params.gap, params.perspective, params.depth])

  /*
   * ひとめくりは transition ではなく animation。
   *
   * 回っている最中でも**必ず頭から回し直す**。「もう回っているから無視」に
   * すると、animationend を取りこぼした瞬間にそのタイルが二度と反応しなく
   * なる。属性を落として強制的にレイアウトを読み、立て直すと再生し直せる。
   */
  const spin = (el) => {
    if (!el) return
    el.dataset.spin = 'false'
    // 読むだけで再計算が走り、アニメーションの再適用が別の変化として扱われる
    void el.offsetWidth
    el.dataset.spin = 'true'
  }

  const onAnimationEnd = (e) => {
    const panel = e.currentTarget.parentElement
    if (panel?.dataset.spin === 'true') panel.dataset.spin = 'false'
  }

  /*
   * どのタイルの上にいるかは**射影後の矩形から計算する**。
   *
   * 判定用の板を重ねる手は使えない。格子は `translateZ` されていて
   * `perspective` で縮んで描かれるので、変形しない板とは必ずずれる。
   * `getBoundingClientRect` は射影後の矩形を返すので、そこから割れば
   * 見えている位置とそのまま一致する。z を変えても追従する。
   */
  const onMove = (e) => {
    if (params.mode !== 'hover') return
    const r = rect.current
    if (!r || !gridRef.current) return

    const fx = (e.clientX - r.x) / r.width
    const fy = (e.clientY - r.y) / r.height
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) { lastHit.current = -1; return }

    const i = Math.min(rows - 1, Math.floor(fy * rows)) * cols + Math.min(cols - 1, Math.floor(fx * cols))
    // 同じタイルの上で動かしている間は撃ち続けない
    if (i === lastHit.current) return
    lastHit.current = i
    spin(gridRef.current.children[i])
  }

  // 自動掃き。順番どおりに表裏を往復する
  useEffect(() => {
    if (params.mode !== 'auto' || !gridRef.current) return
    const panels = [...gridRef.current.children]
    let raf = 0
    let t = 0
    let dir = 1
    let last = performance.now()

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dir * dt * params.sweepSpeed
      if (t >= 1.35) { t = 1.35; dir = -1 }
      if (t <= -0.35) { t = -0.35; dir = 1 }

      panels.forEach((el, i) => {
        const want = t > tiles[i].delay ? 'true' : 'false'
        if (el.dataset.flipped !== want) el.dataset.flipped = want
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [params.mode, params.sweepSpeed, tiles])

  // モードやタイル数を変えたら全部戻す
  useEffect(() => {
    if (!gridRef.current) return
    for (const el of gridRef.current.children) {
      el.dataset.flipped = 'false'
      el.dataset.spin = 'false'
    }
    lastHit.current = -1
  }, [params.mode, cols, rows])

  const style = {
    '--dtf-cols': cols,
    '--dtf-rows': rows,
    '--dtf-gap': `${params.gap}px`,
    '--dtf-radius': `${params.radius}px`,
    '--dtf-inset': `${params.inset}%`,
    '--dtf-perspective': `${params.perspective}px`,
    '--dtf-depth': `${params.depth}px`,
    '--dtf-duration': `${params.duration}s`,
    '--dtf-bg': params.bg,
    '--dtf-ink': params.ink,
  }

  const photo = params.look === 'photo'
  const faceStyle = (side, col, row) => {
    if (photo) return photoStyle(side === 'front' ? frontUrl : backUrl, col, row, cols, rows)
    return { background: side === 'front' ? params.plateFront : params.plateBack }
  }

  return (
    <div
      ref={rootRef}
      className="dtf"
      style={style}
      data-axis={params.axis}
      data-mode={params.mode}
      onPointerMove={onMove}
      onPointerLeave={() => { lastHit.current = -1 }}
    >
      <div className="dtf__stage">
        <div className="dtf__grid" ref={gridRef}>
          {tiles.map(({ col, row }) => (
            <div key={`${col}-${row}`} className="dtf__panel" data-flipped="false" data-spin="false">
              <div
                className="dtf__face dtf__face--front"
                style={faceStyle('front', col, row)}
                onAnimationEnd={onAnimationEnd}
              />
              <div className="dtf__face dtf__face--back" style={faceStyle('back', col, row)} />
            </div>
          ))}
        </div>
      </div>

      <div className="dtf__overlay">
        <p className="dtf__lead">{params.lead}</p>
        <h1 className="dtf__title">{params.title}</h1>
      </div>

      <div className="dtf__hint">{params.mode === 'hover' ? 'MOVE THE CURSOR' : 'AUTO SWEEP'}</div>
    </div>
  )
}
