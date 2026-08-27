import { useControls, folder } from 'leva'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CursorManager, CursorController, STATES } from './cursor'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/**
 * 状態スタック式のカスタムカーソル。
 *
 * ホットスポットは `pushState` / `releaseState` を呼ぶだけ。
 * 重なっても、外した順に元の状態へ戻る。
 *
 * OS のカーソルを消すのは**このデモ領域の中だけ**にする。
 * ページ全体で消すと、描画に失敗したときに操作不能になる。
 */

/** 状態ごとの見た目。目標値だけ書き換えればダンピングが繋いでくれる */
const LOOKS = {
  [STATES.DEFAULT]: { scale: 0.28, morph: 0, ring: 0, label: '' },
  [STATES.HOVER_UI]: { scale: 0.62, morph: 0, ring: 0, label: 'Click' },
  [STATES.DRAG]: { scale: 0.8, morph: 0, ring: 0, label: 'Drag' },
  [STATES.TEXT]: { scale: 0.34, morph: 1, ring: 0, label: '' },
  [STATES.HOLD]: { scale: 0.9, morph: 0, ring: 1, label: 'Hold' },
  [STATES.VIEW]: { scale: 1, morph: 1, ring: 0, label: 'View' },
}

/** 楕円のパス。デザイナーの SVG を置く想定の場所。ここでは手続きで作る */
function ovalPath(w, h) {
  const cx = w / 2
  const cy = h / 2
  const rx = w * 0.46
  const ry = h * 0.3
  return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`
}

function Hotspot({ manager, state, label, children, style, onHold }) {
  const enter = () => {
    if (label !== undefined) manager.setText(label)
    manager.pushState(state)
  }
  const leave = () => manager.releaseState(state)

  return (
    <div
      onPointerEnter={enter}
      onPointerLeave={leave}
      onPointerDown={onHold}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export default function CustomCursor() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Cursor: folder({
      radius: { value: DEFAULTS.radius, min: 10, max: 60, step: 1 },
      damping: { value: DEFAULTS.damping, min: 0.02, max: 0.6, step: 0.01, label: 'shape' },
      followDamping: {
        value: DEFAULTS.followDamping,
        min: 0.05,
        max: 1,
        step: 0.01,
        label: 'follow',
      },
      wobble: { value: DEFAULTS.wobble, min: 0, max: 6, step: 0.1 },
      subdiv: { value: DEFAULTS.subdiv, min: 8, max: 120, step: 1, label: 'points' },
      lineWidth: { value: DEFAULTS.lineWidth, min: 0.5, max: 6, step: 0.1, label: 'line' },
      holdTime: { value: DEFAULTS.holdTime, min: 0.3, max: 4, step: 0.1, label: 'hold sec' },
    }),
    Look: folder({
      stroke: { value: DEFAULTS.stroke },
      paper: { value: DEFAULTS.paper },
      grain: { value: DEFAULTS.grain, min: 0, max: 40, step: 1 },
      fill: { value: DEFAULTS.fill },
      background: { value: DEFAULTS.background, label: 'bg' },
      ink: { value: DEFAULTS.ink, label: 'text' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  const [manager] = useState(() => new CursorManager())
  const [label, setLabel] = useState('')
  const wrap = useRef(null)
  const canvasRef = useRef(null)
  const controller = useRef(null)
  const holding = useRef(false)
  const inside = useRef(false)
  const labelRef = useRef(null)

  // 状態が変わったら目標値を書き換えるだけ
  useEffect(() => {
    const off = manager.on((state, text) => {
      const look = LOOKS[state] || LOOKS[STATES.DEFAULT]
      const c = controller.current
      if (c) {
        c.targetScale = look.scale
        c.targetMorph = look.morph
        c.targetRing = look.ring
      }
      setLabel(text || look.label)
    })
    return off
  }, [manager])

  // コントローラ。頂点数と DPR が変わったら作り直す
  useEffect(() => {
    const c = new CursorController(canvasRef.current, {
      subdiv: params.subdiv,
      damping: params.damping,
      stroke: params.stroke,
      paper: params.paper,
      grain: params.grain,
      lineWidth: params.lineWidth,
      fill: params.fill,
    })

    // SVG のパスを DOM に作って getPointAtLength でサンプルする
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', ovalPath(150, 150))
    svg.appendChild(path)
    svg.style.position = 'absolute'
    svg.style.opacity = '0'
    svg.style.pointerEvents = 'none'
    document.body.appendChild(svg)
    c.setPath(path)
    document.body.removeChild(svg)

    controller.current = c
    return () => {
      controller.current = null
    }
    // 頂点数が変わったときだけ作り直す。他の見た目は下の effect で流し込む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.subdiv])

  useEffect(() => {
    const c = controller.current
    if (!c) return
    c.damping = params.damping
    c.setTheme(params)
  }, [params])

  // 追従と描画。共有の rAF に乗せる
  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const c = controller.current
      if (c) {
        if (holding.current) {
          c.holdProgress = Math.min(1, c.holdProgress + dt / params.holdTime)
        } else {
          c.holdProgress = Math.max(0, c.holdProgress - dt * 2.5)
        }
        c.update({
          radius: params.radius,
          wobble: params.wobble,
          followDamping: params.followDamping,
        })
        // ラベルも同じ追従位置に置く。render 時ではなく毎フレーム動かす
        if (labelRef.current) {
          labelRef.current.style.transform = `translate3d(${c._x + 16}px, ${c._y + 16}px, 0)`
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [params])

  const onMove = useCallback((e) => {
    const el = wrap.current
    const c = controller.current
    if (!el || !c) return
    const r = el.getBoundingClientRect()
    c.targetX = e.clientX - r.left
    c.targetY = e.clientY - r.top
    if (!inside.current) {
      // 初回は瞬間移動させる。中央から飛んでくるのを防ぐ
      c._x = c.targetX
      c._y = c.targetY
      inside.current = true
    }
  }, [])

  const onLeave = useCallback(() => {
    inside.current = false
    manager.reset()
  }, [manager])

  const panel = {
    borderRadius: 14,
    border: `1px solid ${params.ink}22`,
    background: `${params.ink}0a`,
    color: params.ink,
    font: '500 14px/1.5 ui-sans-serif, system-ui, sans-serif',
    letterSpacing: '0.04em',
  }

  return (
    <div
      ref={wrap}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerUp={() => (holding.current = false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: params.background,
        // OS のカーソルを消すのはこの領域だけ
        cursor: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          gap: 18,
          padding: 'clamp(24px, 6vh, 64px)',
        }}
      >
        <Hotspot
          manager={manager}
          state={STATES.HOVER_UI}
          label="Click"
          style={{ ...panel, flexDirection: 'column', gap: 8 }}
        >
          <span style={{ opacity: 0.55, fontSize: 11 }}>HOVER_UI</span>
          <span style={{ fontSize: 18 }}>ボタン</span>
        </Hotspot>

        <Hotspot
          manager={manager}
          state={STATES.DRAG}
          label="Drag"
          style={{ ...panel, flexDirection: 'column', gap: 8 }}
        >
          <span style={{ opacity: 0.55, fontSize: 11 }}>DRAG</span>
          <span style={{ fontSize: 18 }}>ドラッグ領域</span>
        </Hotspot>

        <Hotspot
          manager={manager}
          state={STATES.HOLD}
          label="Hold"
          onHold={() => (holding.current = true)}
          style={{ ...panel, flexDirection: 'column', gap: 8 }}
        >
          <span style={{ opacity: 0.55, fontSize: 11 }}>HOLD</span>
          <span style={{ fontSize: 18 }}>長押し（押すとリングが回る）</span>
        </Hotspot>

        <Hotspot
          manager={manager}
          state={STATES.TEXT}
          label=""
          style={{ ...panel, flexDirection: 'column', gap: 10, padding: 20 }}
        >
          <span style={{ opacity: 0.55, fontSize: 11 }}>TEXT</span>
          {/* インラインのホットスポットが div なので、ここは p にしない */}
          <div style={{ opacity: 0.8, textAlign: 'center', maxWidth: 320 }}>
            文字の上では細い楕円へモーフする。
            <br />
            この中の
            <Hotspot
              manager={manager}
              state={STATES.VIEW}
              label="View"
              style={{
                display: 'inline-flex',
                textDecoration: 'underline',
                padding: '0 4px',
              }}
            >
              リンク
            </Hotspot>
            に乗せると、状態が積み重なる。外すと文字の状態へ戻る。
          </div>
        </Hotspot>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          willChange: 'transform',
        }}
      />

      {/* ラベルはカーソルの下に DOM で出す。canvas に文字を描くより読みやすい */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          transform: 'translate3d(0,0,0)',
          font: '500 11px ui-monospace, monospace',
          letterSpacing: '0.12em',
          color: params.stroke,
          opacity: label ? 1 : 0,
          transition: 'opacity 0.18s',
        }}
        ref={labelRef}
      >
        {label}
      </div>
    </div>
  )
}
