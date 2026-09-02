import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder, button } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import photoUrl from '../../assets/photos/scene-a.jpg'
import iconUrl from '../../assets/brand/icon.png'
import { FlipDots, FlipPicker, FLIP_ORDERS } from '../../shared/FlipDots'
import { ditherImage, lifeStep, seedLife, noteHz } from './modes'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

const MODES = { 'Flip-dot image': 'dots', 'Game of Life': 'life', Sequencer: 'seq' }
const SOURCES = { Photo: 'photo', Logo: 'logo' }

/**
 * 1 枚の盤で 3 つ遊ぶ。
 *
 * 共通しているのは「0/1 の格子が物理的に裏返る」ことだけ。
 * 絵を出す・生死を進める・拍を鳴らす、はどれもビットの作り方が違うだけで、
 * 盤の描画は 1 つで足りる。
 */
function Stage({ params, audio }) {
  const cols = Math.round(params.cols)
  const rows = Math.round(params.rows)
  const count = cols * rows

  const bits = useMemo(() => new Uint8Array(count), [count])
  const scratch = useMemo(() => new Uint8Array(count), [count])
  const acc = useRef(0)
  const step = useRef(0)
  const images = useRef({})
  const ready = useRef(false)

  // 画像は 1 度だけ読む。モードを行き来するたびに読み直さない
  useEffect(() => {
    let alive = true
    const load = (url) => new Promise((res) => {
      const img = new Image()
      img.onload = () => res(img)
      img.src = url
    })
    Promise.all([load(photoUrl), load(iconUrl)]).then(([photo, logo]) => {
      if (!alive) return
      images.current = { photo, logo }
      ready.current = false
    })
    return () => { alive = false }
  }, [])

  // モードや盤の大きさが変わったら組み直す
  useEffect(() => { ready.current = false }, [params.mode, params.source, params.gain, cols, rows])

  /*
   * 画像の目標は焼いて持つ。**毎フレーム作り直さない。**
   * 出典と諧調と盤の大きさが変わったときだけ焼き直せば足りる。
   */
  const goal = useMemo(() => new Uint8Array(count), [count])

  const rebuild = () => {
    if (params.mode === 'dots') {
      const img = images.current[params.source]
      if (!img) return false
      ditherImage(img, cols, rows, goal, params.gain)
      bits.set(goal)
      return true
    }
    if (params.mode === 'life') {
      seedLife(bits, cols, rows, params.density)
      return true
    }
    bits.fill(0)
    return true
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    if (!ready.current) ready.current = rebuild()
    if (!ready.current) return

    if (params.mode === 'life') {
      acc.current += dt
      if (acc.current >= params.lifeRate) {
        acc.current = 0
        lifeStep(bits, cols, rows, scratch)
        bits.set(scratch)
      }
      return
    }

    if (params.mode === 'seq') {
      acc.current += dt
      const beat = 60 / Math.max(40, params.bpm) / 2 // 8 分音符
      if (acc.current >= beat) {
        acc.current -= beat
        step.current = (step.current + 1) % cols
        /*
         * 再生ヘッドは**盤とは別に持つ**。ビットに焼き込むと、
         * 通過したあとに音符が消えてしまう。
         */
        for (let y = 0; y < rows; y++) {
          if (bits[y * cols + step.current]) audio.play(noteHz(y, rows, params.base), params.decay)
        }
      }
    }
  })

  /** 触った所を書き換える。モードで意味が変わる */
  const onCell = (x, y, e) => {
    const i = y * cols + x
    if (params.mode === 'seq') {
      // 置く / 消すはボタンを押している間だけ。なぞるだけで置けると事故る
      if (e.buttons) bits[i] = e.shiftKey ? 0 : 1
      return
    }
    if (params.mode === 'life') {
      if (e.buttons) bits[i] = 1
      return
    }
    // 画像は乱してよい。放っておけば元へ戻る
    if (e.buttons) bits[i] = bits[i] ? 0 : 1
  }

  // 乱された所を少しずつ元へ戻す。焼いた目標と比べるだけ
  useFrame((_, delta) => {
    if (params.mode !== 'dots' || !ready.current || params.heal <= 0) return
    let budget = Math.ceil(count * 0.01 * params.heal * Math.min(delta, 1 / 20) * 60)
    for (let i = 0; i < count && budget > 0; i++) {
      if (bits[i] === goal[i]) continue
      bits[i] = goal[i]
      budget--
    }
  })

  const head = params.mode === 'seq' ? step.current : -1

  return (
    <>
      <FlipDots
        cols={cols}
        rows={rows}
        bits={bits}
        pitch={params.pitch}
        flipTime={params.flipTime}
        stagger={params.stagger}
        order={params.order}
        onColor={params.onColor}
        offColor={params.offColor}
      />

      {/* 再生ヘッド。盤の手前に細い板を置くだけ */}
      {head >= 0 && (
        <mesh position={[(head - (cols - 1) / 2) * params.pitch, 0, 0.12]}>
          <planeGeometry args={[params.pitch * 0.96, rows * params.pitch]} />
          <meshBasicMaterial color={params.onColor} transparent opacity={0.16} depthWrite={false} />
        </mesh>
      )}

      <FlipPicker cols={cols} rows={rows} pitch={params.pitch} onCell={onCell} />
    </>
  )
}

/** 盤が収まる位置まで引く。正射影なので zoom だけでよい */
function Rig({ cols, rows, pitch }) {
  const camera = useThree((s) => s.camera)
  const viewport = useThree((s) => s.size)
  useEffect(() => {
    const zoom = Math.min(viewport.width / ((cols + 2) * pitch), viewport.height / ((rows + 2) * pitch))
    camera.zoom = zoom
    camera.position.set(0, 0, 30)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, cols, rows, pitch, viewport.width, viewport.height])
  return null
}

/**
 * 音。
 *
 * `AudioContext` は最初の操作まで作らない。読み込んだだけで作ると
 * ブラウザに止められ、あとから鳴らそうとしても無音のままになる。
 */
function useBeeper() {
  const ctx = useRef(null)
  return useMemo(() => ({
    play(hz, decay) {
      if (!ctx.current) {
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return
        ctx.current = new AC()
      }
      const c = ctx.current
      if (c.state === 'suspended') c.resume()
      const t = c.currentTime
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'triangle'
      osc.frequency.value = hz
      // 立ち上がりを 0 にすると鳴り始めでプチッと鳴る
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      osc.connect(gain).connect(c.destination)
      osc.start(t)
      osc.stop(t + decay + 0.02)
    },
  }), [])
}

export default function FlipBoard() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const audio = useBeeper()

  const [params, setParams] = useControls(() => ({
    mode: { value: DEFAULTS.mode, options: MODES },
    Board: folder({
      cols: { value: DEFAULTS.cols, min: 12, max: 72, step: 1 },
      rows: { value: DEFAULTS.rows, min: 8, max: 40, step: 1 },
      pitch: { value: DEFAULTS.pitch, min: 0.9, max: 1.4, step: 0.02, label: 'spacing' },
      flipTime: { value: DEFAULTS.flipTime, min: 0.05, max: 0.6, step: 0.01, label: 'flip (s)' },
      stagger: { value: DEFAULTS.stagger, min: 0, max: 1.2, step: 0.02 },
      order: { value: DEFAULTS.order, options: FLIP_ORDERS },
    }),
    Image: folder({
      source: { value: DEFAULTS.source, options: SOURCES },
      gain: { value: DEFAULTS.gain, min: 0.4, max: 3, step: 0.05, label: 'contrast' },
      heal: { value: DEFAULTS.heal, min: 0, max: 40, step: 1, label: 'self heal' },
    }),
    Life: folder({
      lifeRate: { value: DEFAULTS.lifeRate, min: 0.05, max: 1.2, step: 0.05, label: 'step (s)' },
      density: { value: DEFAULTS.density, min: 0.05, max: 0.6, step: 0.01, label: 'seed' },
    }),
    Sequencer: folder({
      bpm: { value: DEFAULTS.bpm, min: 60, max: 220, step: 1 },
      base: { value: DEFAULTS.base, min: 110, max: 440, step: 5, label: 'root (Hz)' },
      decay: { value: DEFAULTS.decay, min: 0.08, max: 1.2, step: 0.02 },
    }),
    Look: folder({
      onColor: { value: DEFAULTS.onColor, label: 'lit' },
      offColor: { value: DEFAULTS.offColor, label: 'dark' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
    Reseed: button(() => window.dispatchEvent(new CustomEvent('flipboard:reseed'))),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  const cols = Math.round(params.cols)
  const rows = Math.round(params.rows)

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

      <Stage params={{ ...params, cols, rows }} audio={audio} />
      <Rig cols={cols} rows={rows} pitch={params.pitch} />
    </Canvas>
  )
}
