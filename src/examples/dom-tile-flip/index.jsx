import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import frontUrl from '../../assets/photos/scene-a.jpg'
import backUrl from '../../assets/photos/scene-b.jpg'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'
import './styles.css'

const MODES = { 'Hover each tile': 'hover', 'Auto sweep': 'auto' }
const AXES = { 'Horizontal axis': 'x', 'Vertical axis': 'y' }
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

/** タイルの背景位置。1 枚の画像を cols×rows に割って各パネルへ配る */
function tileStyle(url, col, row, cols, rows) {
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    // 端の 1 枚は 0% / 100% に収める。cols-1 で割るのはそのため
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
      duration: { value: DEFAULTS.duration, min: 0.15, max: 2, step: 0.05, label: 'duration (s)' },
      perspective: { value: DEFAULTS.perspective, min: 200, max: 4000, step: 50 },
      depth: { value: DEFAULTS.depth, min: -200, max: 0, step: 5, label: 'grid z (px)' },
      sweepOrder: { value: DEFAULTS.sweepOrder, options: ORDERS, label: 'order' },
      sweepSpeed: { value: DEFAULTS.sweepSpeed, min: 0.1, max: 3, step: 0.05, label: 'sweep speed' },
    }),
    Overlay: folder({
      title: { value: DEFAULTS.title },
      lead: { value: DEFAULTS.lead },
      blend: { value: DEFAULTS.blend, label: 'difference blend' },
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

  const gridRef = useRef(null)

  /*
   * めくりは React の state ではなく **DOM 属性を直に書き換える**。
   * 100 枚のうち 1 枚が変わるたびに再レンダリングすると、
   * 変わっていない 99 枚まで作り直すことになる。
   */
  const flip = (el) => {
    if (!el) return
    el.dataset.flipped = el.dataset.flipped === 'true' ? 'false' : 'true'
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

  // モードを切り替えたら全部戻す
  useEffect(() => {
    if (!gridRef.current) return
    for (const el of gridRef.current.children) el.dataset.flipped = 'false'
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
    '--dtf-ax': params.axis === 'x' ? 1 : 0,
    '--dtf-ay': params.axis === 'x' ? 0 : 1,
  }

  return (
    <div className="dtf" style={style}>
      <div className="dtf__stage">
        <div className="dtf__grid" ref={gridRef}>
          {tiles.map(({ col, row }) => (
            <div
              key={`${col}-${row}`}
              className="dtf__panel"
              data-flipped="false"
>
              <div className="dtf__face dtf__face--front" style={tileStyle(frontUrl, col, row, cols, rows)} />
              <div className="dtf__face dtf__face--back" style={tileStyle(backUrl, col, row, cols, rows)} />
            </div>
          ))}
        </div>
      </div>

      {/* 当たり判定。3D の外に置くのでめくり途中でも判定がずれない */}
      {params.mode === 'hover' && (
        <div className="dtf__hits">
          {tiles.map(({ col, row }, i) => (
            <div
              key={`hit-${col}-${row}`}
              className="dtf__hit"
              onPointerEnter={() => flip(gridRef.current?.children[i])}
            />
          ))}
        </div>
      )}

      <div className="dtf__overlay" data-blend={params.blend ? 'true' : 'false'}>
        <p className="dtf__lead">{params.lead}</p>
        <h1 className="dtf__title">{params.title}</h1>
      </div>

      <div className="dtf__hint">{params.mode === 'hover' ? 'MOVE THE CURSOR' : 'AUTO'}</div>
    </div>
  )
}
