import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { generateBlueNoise } from '../../shared/blueNoise'
import { stampText, measure, GLYPH_H } from './font'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

const MODES = { Clock: 'clock', Date: 'date', Countdown: 'count', Text: 'text' }
const ORDERS = { Sweep: 'sweep', Radial: 'radial', 'Blue noise': 'blue', Instant: 'instant' }

const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()

const two = (n) => String(n).padStart(2, '0')
const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** いま盤に出したい文字列 */
function textFor(mode, custom, target) {
  const now = new Date()
  if (mode === 'date') {
    return `${WEEK[now.getDay()]} ${two(now.getMonth() + 1)}/${two(now.getDate())}`
  }
  if (mode === 'count') {
    const left = Math.max(0, Math.floor((target - now.getTime()) / 1000))
    return `${two(Math.floor(left / 3600))}:${two(Math.floor(left / 60) % 60)}:${two(left % 60)}`
  }
  if (mode === 'text') return (custom || '').toUpperCase().slice(0, 24)
  return `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`
}

/**
 * フリップドットの盤。
 *
 * 機構の核は**変化した画素だけを裏返す**こと。毎秒すべて裏返すと、
 * 掲示板ではなく点滅する板になる。差分だけ動かすから、秒は数個、
 * 分は十数個、というリズムが自然に出る。
 *
 * 1 マスは薄い箱で、回転は CPU で組む。数百枚なら行列計算は問題にならないし、
 * 頂点シェーダーを書かずに済むぶん、影も環境光もそのまま効く。
 */
function Board({ params }) {
  const cols = Math.round(params.cols)
  const rows = Math.round(params.rows)
  const count = cols * rows

  const mesh = useRef(null)
  const geo = useMemo(() => new THREE.BoxGeometry(0.86, 0.86, 0.14), [])
  useEffect(() => () => geo.dispose(), [geo])

  /** 目標のビット、いまの進行度、めくり始める順番 */
  const bits = useMemo(() => new Uint8Array(count), [count])
  const prog = useMemo(() => new Float32Array(count), [count])
  const delay = useMemo(() => new Float32Array(count), [count])
  const pending = useRef(0)

  const noise = useMemo(() => generateBlueNoise(Math.max(8, Math.max(cols, rows))), [cols, rows])

  const orderOf = (x, y) => {
    if (params.order === 'instant') return 0
    if (params.order === 'sweep') return x / Math.max(1, cols - 1)
    if (params.order === 'radial') {
      return Math.hypot(x - (cols - 1) / 2, y - (rows - 1) / 2) / (Math.hypot(cols, rows) * 0.5)
    }
    // data は 0..255。0..1 のつもりで掛けると 255 倍の待ちになる
    return noise.data[(y % noise.size) * noise.size + (x % noise.size)] / 255
  }

  const lastText = useRef('')
  // カウントダウンの締切。描画中に時刻を読まないよう、最初のフレームで決める
  const target = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    if (!target.current) target.current = Date.now() + 1000 * 60 * 10
    const text = textFor(params.mode, params.text, target.current)

    if (text !== lastText.current) {
      lastText.current = text
      const next = new Uint8Array(count)
      // 入りきらないときは切る。盤を作り直すと桁ごとに全部組み直しになる
      stampText(next, cols, rows, text, { spacing: params.spacing })

      /*
       * **違うところだけ**予約する。同じ画素は触らない。
       * ここを省いて毎回全部めくると、掲示板ではなく点滅板になる。
       */
      let changed = 0
      for (let i = 0; i < count; i++) {
        if (next[i] === bits[i]) continue
        bits[i] = next[i]
        const x = i % cols
        const y = (i / cols) | 0
        delay[i] = orderOf(x, y) * params.stagger
        changed++
      }
      pending.current = changed
    }

    // 進行度を目標へ寄せる
    const speed = dt / Math.max(0.02, params.flipTime)
    for (let i = 0; i < count; i++) {
      if (delay[i] > 0) { delay[i] = Math.max(0, delay[i] - dt); continue }
      const want = bits[i]
      const d = want - prog[i]
      if (d === 0) continue
      prog[i] += Math.sign(d) * Math.min(Math.abs(d), speed)
    }

    // --- 描画 ---
    const m = mesh.current
    if (!m) return
    const halfX = (cols - 1) / 2
    const halfY = (rows - 1) / 2
    for (let i = 0; i < count; i++) {
      const x = i % cols
      const y = (i / cols) | 0
      const p = prog[i]
      dummy.position.set((x - halfX) * params.pitch, (y - halfY) * params.pitch, 0)
      dummy.rotation.set(p * Math.PI, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      // 半分を越えた瞬間に色が入れ替わる。回転と一致するので板に見える
      tmpColor.set(p > 0.5 ? params.onColor : params.offColor)
      m.setColorAt(i, tmpColor)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[geo, undefined, count]} castShadow receiveShadow key={count}>
      <meshStandardMaterial roughness={0.5} metalness={0.05} />
    </instancedMesh>
  )
}

/** 盤の大きさに合わせて引く。正射影なので zoom だけで足りる */
function Rig({ cols, rows, pitch }) {
  const camera = useThree((s) => s.camera)
  const viewport = useThree((s) => s.size)

  useEffect(() => {
    const w = (cols + 2) * pitch
    const h = (rows + 3) * pitch
    const aspect = viewport.width / viewport.height
    const zoom = Math.min(viewport.width / w, viewport.height / h) * (aspect > 1 ? 1 : 0.9)
    camera.zoom = zoom
    camera.position.set(0, 0, 30)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, cols, rows, pitch, viewport.width, viewport.height])

  return null
}

export default function FlipClock() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    mode: { value: DEFAULTS.mode, options: MODES },
    text: { value: DEFAULTS.text, label: 'text (Text mode)' },
    Board: folder({
      cols: { value: DEFAULTS.cols, min: 16, max: 80, step: 1 },
      rows: { value: DEFAULTS.rows, min: 7, max: 32, step: 1 },
      pitch: { value: DEFAULTS.pitch, min: 0.9, max: 1.4, step: 0.02, label: 'spacing' },
      spacing: { value: DEFAULTS.spacing, min: 1, max: 4, step: 1, label: 'letter gap' },
    }),
    Flip: folder({
      flipTime: { value: DEFAULTS.flipTime, min: 0.05, max: 0.8, step: 0.01, label: 'flip (s)' },
      stagger: { value: DEFAULTS.stagger, min: 0, max: 1.2, step: 0.02 },
      order: { value: DEFAULTS.order, options: ORDERS },
    }),
    Look: folder({
      onColor: { value: DEFAULTS.onColor, label: 'lit' },
      offColor: { value: DEFAULTS.offColor, label: 'dark' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  // 文字が入りきる幅を保証する。切れた時計は時計として成立しない
  const need = useMemo(() => measure('00:00:00', params.spacing) + 2, [params.spacing])
  const cols = Math.max(Math.round(params.cols), need)
  const rows = Math.max(Math.round(params.rows), GLYPH_H + 2)

  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 30], zoom: 18, near: -100, far: 200 }}
      dpr={[1, 2]}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <color attach="background" args={[params.background]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 10]} intensity={1.5} />
      <directionalLight position={[-6, -3, 4]} intensity={0.4} />

      <Board params={{ ...params, cols, rows }} />
      <Rig cols={cols} rows={rows} pitch={params.pitch} />
    </Canvas>
  )
}
