import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { ENV_MAPS } from '../../shared/env'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { STAGE_SCENES, Slab, Diorama, SCENE_COUNT } from './scenes'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, AXES } from './presets'

/**
 * どんでん返し。
 *
 * 盤面は表と裏の 2 面しかないが、**回転して裏に回った側を差し替える**ので
 * いくらでも新しいシーンを送り出せる。差し替えは 90 度を過ぎた直後、
 * その面が完全に見えなくなってから行う。
 *
 * 「幕が閉じている間に舞台を組み替える」のと同じ理屈を、物理的な回転でやっている。
 */

function easeInOutBack(t, s) {
  // 行きに少し引いて、着地で気持ち行き過ぎる。等速だと仕掛けが安っぽく見える
  const c = 1.70158 * s
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c + 1) * (2 * t - 2) + c) + 2) / 2
}

function Stage({ params }) {
  const pivot = useRef(null)

  // 表 / 裏それぞれに載っているシーン番号
  const slots = useRef({ top: 0, bottom: 1 })
  const nextScene = useRef(2)

  // 各スロットのシーンを収めた group（visible で出し分ける）
  const topRefs = useRef([])
  const bottomRefs = useRef([])

  // いま上を向いているのが top 側か。返るたびに入れ替わる
  const upIsTop = useRef(true)
  const flip = useRef({ active: false, t: 0, from: 0 })
  const idle = useRef(0)

  const applyVisibility = () => {
    topRefs.current.forEach((g, i) => {
      if (g) g.visible = i === slots.current.top
    })
    bottomRefs.current.forEach((g, i) => {
      if (g) g.visible = i === slots.current.bottom
    })
  }

  useEffect(() => {
    slots.current = { top: 0, bottom: 1 }
    upIsTop.current = true
    nextScene.current = 2 % SCENE_COUNT
    flip.current = { active: false, t: 0, from: 0 }
    applyVisibility()
  }, [])

  const startFlip = () => {
    if (flip.current.active) return
    flip.current = {
      active: true,
      t: 0,
      from: pivot.current ? pivot.current.rotation[params.axis] : 0,
    }
    idle.current = 0
  }

  useFrame((state, delta) => {
    const g = pivot.current
    if (!g) return

    // ゆっくり見回す
    g.parent.rotation.y += delta * params.spin

    const f = flip.current

    if (!f.active) {
      if (params.autoFlip) {
        idle.current += delta
        if (idle.current >= params.interval) startFlip()
      }
      return
    }

    f.t = Math.min(f.t + delta / Math.max(params.duration, 0.05), 1)
    const eased = easeInOutBack(f.t, params.overshoot)

    g.rotation[params.axis] = f.from + Math.PI * eased

    // 回転の山で少し持ち上げると、板が「返っている」感じが出る
    g.position.y = Math.sin(Math.PI * f.t) * params.lift

    if (f.t >= 1) {
      f.active = false
      g.position.y = 0

      // 差し替えは回転が完全に終わってから。
      // overshoot で行き過ぎて戻る間は裏面がまだ少し見えるので、
      // 90 度通過時点で書き換えると切り替わりが目撃されてしまう。
      if (upIsTop.current) slots.current.top = nextScene.current
      else slots.current.bottom = nextScene.current
      nextScene.current = (nextScene.current + 1) % SCENE_COUNT
      upIsTop.current = !upIsTop.current
      applyVisibility()

      // 回転を 0..2π に畳んでおく
      g.rotation[params.axis] = (f.from + Math.PI) % (Math.PI * 2)
    }
  })

  const half = params.thickness / 2 + 0.004

  return (
    <group rotation={[params.tilt, 0, 0]}>
      {/*
        マンホールの地面。回転板の外周をぐるりと塞ぐことで、
        裏側に回っているシーンが下から覗くのを物理的に隠す。
        「静止中は裏を非表示」では、返った後に表へ来た面まで消えてしまう。
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[params.radius * 1.015, params.radius * 26, 64, 1]} />
        <meshStandardMaterial color={params.groundColor} roughness={0.95} />
      </mesh>

      <group ref={pivot} onClick={startFlip}>
        <Slab radius={params.radius} thickness={params.thickness} rim={params.rimColor} />

        {/* 表側 */}
        <group position={[0, half, 0]}>
          {STAGE_SCENES.map((s, i) => (
            <group key={s.id} ref={(el) => (topRefs.current[i] = el)} visible={i === 0}>
              <Diorama url={s.url} radius={params.radius} />
            </group>
          ))}
        </group>

        {/* 裏側。上下反転して貼るので、返ったときに正立する */}
        <group position={[0, -half, 0]} rotation={[Math.PI, 0, 0]}>
          {STAGE_SCENES.map((s, i) => (
            <group key={s.id} ref={(el) => (bottomRefs.current[i] = el)} visible={i === 1}>
              <Diorama url={s.url} radius={params.radius} />
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

export default function FlipStage() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Flip: folder({
      axis: { value: DEFAULTS.axis, options: AXES },
      duration: { value: DEFAULTS.duration, min: 0.2, max: 4, step: 0.05 },
      overshoot: { value: DEFAULTS.overshoot, min: 0, max: 4, step: 0.05 },
      lift: { value: DEFAULTS.lift, min: 0, max: 1.2, step: 0.02 },
      autoFlip: { value: DEFAULTS.autoFlip, label: 'auto' },
      interval: { value: DEFAULTS.interval, min: 0.6, max: 6, step: 0.1 },
    }),
    Stage: folder({
      radius: { value: DEFAULTS.radius, min: 0.8, max: 2.6, step: 0.05 },
      thickness: { value: DEFAULTS.thickness, min: 0.04, max: 0.5, step: 0.01 },
      tilt: { value: DEFAULTS.tilt, min: 0, max: 0.8, step: 0.01 },
      spin: { value: DEFAULTS.spin, min: 0, max: 0.6, step: 0.01 },
      rimColor: { value: DEFAULTS.rimColor, label: 'rim' },
      groundColor: { value: DEFAULTS.groundColor, label: 'ground' },
      fog: { value: DEFAULTS.fog, min: 0, max: 1, step: 0.02, label: 'fog' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  const bg = useMemo(() => new THREE.Color(params.background), [params.background])

  return (
    <Canvas camera={{ position: [0, 1.9, 5.2], fov: 42 }} dpr={[1, 2]} shadows={false}>
      <color attach="background" args={[bg]} />
      {/* 地面板の隙間から覗く分は霧で沈める */}
      <fogExp2 attach="fog" args={[bg, params.fog * 0.22]} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 6, 4]} intensity={2.1} />
      <directionalLight position={[-4, -3, -2]} intensity={0.5} color="#8fb6ff" />

      {/*
        GLB も HDRI も読み込み中は suspend する。Suspense 境界の中に置かないと
        Canvas の中身ごと外され、キャンバスが消える。
      */}
      <Suspense fallback={null}>
        <Stage params={params} />
        <Environment files={ENV_MAPS.studio.url} />
      </Suspense>

      {/*
        回転は無効。どんでん返しは「正面から見て板が返る」演出なので、
        横や真上から見ると仕掛けが読めなくなる。寄り引きだけ残す。
      */}
      <OrbitControls
        enableRotate={false}
        enablePan={false}
        minDistance={3}
        maxDistance={11}
        target={[0, 0.2, 0]}
      />
    </Canvas>
  )
}
