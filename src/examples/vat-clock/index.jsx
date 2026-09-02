import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, ContactShadows } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ENV_MAPS } from '../../shared/env'
import { bakeDigits, PIECES, FRAMES } from './bake'
import { vatVertexHead, vatBeginVertex, vatBeginNormal } from './glsl/vat'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/** 時分秒の 6 桁。コロンは点滅だけなので焼かない */
const SLOTS = 6
const two = (n) => String(n).padStart(2, '0')

/**
 * 焼いた変形で桁を組み替える時計。
 *
 * 桁が変わったら、今の数字を**逆再生して散らし**、次の数字を**順再生して組む**。
 * 散った状態は全数字で共通なので、切り替わりの瞬間に破片が飛ばない。
 */
function Digits({ params }) {
  // 散らばりを変えたら焼き直す。288 × 480 なので数十ミリ秒で済む
  const baked = useMemo(() => bakeDigits(params.spread), [params.spread])
  useEffect(() => () => { baked.position.dispose(); baked.rotation.dispose() }, [baked])

  const geometry = useMemo(() => {
    // 粒は小さいので面数を落とす。288 × 6 桁で 1728 個ある
    const base = new RoundedBoxGeometry(1, 1, 1, 2, 0.24)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.attributes.position = base.attributes.position
    geo.attributes.normal = base.attributes.normal
    geo.attributes.uv = base.attributes.uv

    const n = SLOTS * PIECES
    const piece = new Float32Array(n)
    const slot = new Float32Array(n)
    for (let s = 0; s < SLOTS; s++) {
      for (let p = 0; p < PIECES; p++) {
        piece[s * PIECES + p] = p
        slot[s * PIECES + p] = s
      }
    }
    geo.setAttribute('aPiece', new THREE.InstancedBufferAttribute(piece, 1))
    geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slot, 1))
    geo.instanceCount = n
    // 頂点が動くので、three が計算した範囲は当てにならない
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60)
    base.dispose()
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const extra = useMemo(
    () => ({
      tPos: { value: baked.position },
      tRot: { value: baked.rotation },
      uTexSize: { value: new THREE.Vector2(PIECES, FRAMES * 10) },
      uFrames: { value: FRAMES },
      uRow: { value: new Float32Array(8) },
      uSlotX: { value: new Float32Array(8) },
      uScale: { value: DEFAULTS.scale },
      uDot: { value: DEFAULTS.dot },
    }),
    [baked],
  )

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial()
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, extra)
      shader.vertexShader = vatVertexHead + shader.vertexShader
      shader.vertexShader = shader.vertexShader
        .replace('#include <beginnormal_vertex>', vatBeginNormal)
        .replace('#include <begin_vertex>', vatBeginVertex)
    }
    // onBeforeCompile を差し替えたら key を変えないと古い program を使い回す
    mat.customProgramCacheKey = () => 'vat-clock'
    return mat
  }, [extra])
  useEffect(() => () => material.dispose(), [material])

  /*
   * 桁ごとの状態。
   *   digit … いま組み上がっている数字
   *   phase … 'hold' / 'out'（逆再生で散らす）/ 'in'（順再生で組む）
   */
  const slots = useRef(
    Array.from({ length: SLOTS }, () => ({ digit: 0, next: 0, phase: 'hold', t: 1 })),
  )

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const now = new Date()
    const text = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`

    for (let i = 0; i < SLOTS; i++) {
      const s = slots.current[i]
      const want = Number(text[i])

      // 組み上がっている桁が変わったら、散らしにかかる
      if (s.phase === 'hold' && want !== s.digit) {
        s.next = want
        s.phase = 'out'
        s.t = 1
      }

      const speed = dt / Math.max(0.05, params.swapTime)
      if (s.phase === 'out') {
        s.t -= speed
        if (s.t <= 0) { s.t = 0; s.digit = s.next; s.phase = 'in' }
      } else if (s.phase === 'in') {
        s.t += speed
        if (s.t >= 1) { s.t = 1; s.phase = 'hold' }
      }

      /*
       * 行 = 数字 × フレーム数 + フレーム。
       * 散らす側も組む側も同じクリップで、進む向きが違うだけ。
       */
      const shown = s.phase === 'out' ? s.digit : s.digit
      const frame = Math.min(FRAMES - 1, Math.max(0, Math.round(s.t * (FRAMES - 1))))
      extra.uRow.value[i] = shown * FRAMES + frame

      // 桁の並び。時分秒の間だけ広げる。中央寄せはあとでまとめてやる
      const gap = params.pitch * 5.6
      extra.uSlotX.value[i] = i * gap + Math.floor(i / 2) * params.colonGap
    }

    /*
     * 桁の間隔を足したあとに**まとめて中央へ寄せる**。
     * 並べながら中央を推測すると、間隔を変えるたびにずれる。
     */
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < SLOTS; i++) {
      lo = Math.min(lo, extra.uSlotX.value[i])
      hi = Math.max(hi, extra.uSlotX.value[i])
    }
    const mid = (lo + hi) / 2
    for (let i = 0; i < SLOTS; i++) extra.uSlotX.value[i] -= mid

    extra.uScale.value = params.scale
    extra.uDot.value = params.dot
    material.color.set(params.color)
    material.metalness = params.metalness
    material.roughness = params.roughness
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} castShadow receiveShadow />
}

/** コロン。焼く価値がないので普通の球を 4 つ置いて点滅させる */
function Colons({ params }) {
  const ref = useRef(null)
  const geo = useMemo(() => new THREE.SphereGeometry(0.34, 20, 14), [])
  useEffect(() => () => geo.dispose(), [geo])

  useFrame(() => {
    if (!ref.current) return
    const on = Math.floor(performance.now() / 500) % 2 === 0
    ref.current.visible = on
  })

  // 桁の並びと同じ式から出す。ずれると時計に見えない
  const gap = params.pitch * 5.6
  const at = (i) => i * gap + Math.floor(i / 2) * params.colonGap
  const mid = (at(0) + at(SLOTS - 1)) / 2
  const xs = [(at(1) + at(2)) / 2 - mid, (at(3) + at(4)) / 2 - mid]
  return (
    <group ref={ref}>
      {xs.map((x, i) => [1.1, -1.1].map((y, j) => (
        <mesh key={`${i}-${j}`} geometry={geo} position={[x * params.scale, y * params.scale, 0]}>
          <meshStandardMaterial color={params.color} metalness={params.metalness} roughness={params.roughness} />
        </mesh>
      )))}
    </group>
  )
}

function Rig({ scale, pitch }) {
  const camera = useThree((s) => s.camera)
  const viewport = useThree((s) => s.size)
  useEffect(() => {
    const w = (pitch * 5.6 * 6 + 8) * scale
    const h = 13 * scale
    // 右端は leva に覆われるので、余白を多めに取る
    camera.zoom = Math.min(viewport.width / w, viewport.height / h) * 0.84
    camera.position.set(0, 0, 40)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, scale, pitch, viewport.width, viewport.height])
  return null
}

export default function VatClock() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Motion: folder({
      swapTime: { value: DEFAULTS.swapTime, min: 0.08, max: 1.2, step: 0.02, label: 'swap (s)' },
      scale: { value: DEFAULTS.scale, min: 0.3, max: 1.6, step: 0.02 },
      dot: { value: DEFAULTS.dot, min: 0.05, max: 0.6, step: 0.01, label: 'grain' },
      spread: { value: DEFAULTS.spread, min: 0.3, max: 2.4, step: 0.05, label: 'scatter' },
      pitch: { value: DEFAULTS.pitch, min: 0.7, max: 1.6, step: 0.02, label: 'digit gap' },
      colonGap: { value: DEFAULTS.colonGap, min: 0, max: 4, step: 0.1, label: 'colon gap' },
    }),
    Look: folder({
      color: { value: DEFAULTS.color },
      metalness: { value: DEFAULTS.metalness, min: 0, max: 1, step: 0.02 },
      roughness: { value: DEFAULTS.roughness, min: 0.05, max: 1, step: 0.02 },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas
      orthographic
      shadows
      camera={{ position: [0, 0, 40], zoom: 40, near: -200, far: 400 }}
      dpr={[1, 2]}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <color attach="background" args={[params.background]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[6, 10, 14]} intensity={1.7} castShadow />
      <directionalLight position={[-8, -4, 6]} intensity={0.35} />

      <Suspense fallback={null}>
        <Environment files={ENV_MAPS.studio.url} />
        <Digits params={params} />
        <Colons params={params} />
      </Suspense>

      <ContactShadows position={[0, -5 * params.scale, 0]} opacity={0.35} scale={40} blur={2.6} far={8} />
      <Rig scale={params.scale} pitch={params.pitch} />
    </Canvas>
  )
}
