import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bakeDigits } from './bake'
import { pointsVertexShader, pointsFragmentShader } from './glsl/vat'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/** 時分秒の 6 桁。コロンは点滅だけなので焼かない */
const SLOTS = 6
const two = (n) => String(n).padStart(2, '0')

/**
 * 粒が数字から数字へ直接寄る時計。
 *
 * 焼いてあるのは 10 個の到達点だけで、経過は頂点シェーダーが作る。
 * 経過まで焼くと「散った状態 → その数字」しか再生できず、桁が変わるたびに
 * 一度バラバラになってしまう。
 */
function Digits({ params, zoom }) {
  const pieces = Math.round(params.pieces)
  const baked = useMemo(() => bakeDigits(pieces), [pieces])
  useEffect(() => () => baked.texture.dispose(), [baked])

  const geometry = useMemo(() => {
    const n = SLOTS * pieces
    const geo = new THREE.BufferGeometry()
    // 位置は頂点シェーダーが決めるので、中身は使わない
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const piece = new Float32Array(n)
    const slot = new Float32Array(n)
    for (let s = 0; s < SLOTS; s++) {
      for (let p = 0; p < pieces; p++) {
        piece[s * pieces + p] = p
        slot[s * pieces + p] = s
      }
    }
    geo.setAttribute('aPiece', new THREE.BufferAttribute(piece, 1))
    geo.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1))
    // 頂点が動くので、three が計算した範囲は当てにならない
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200)
    return geo
  }, [pieces])
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      tPos: { value: baked.texture },
      uTexSize: { value: new THREE.Vector2(baked.width, baked.height) },
      uRowsPerDigit: { value: baked.rowsPerDigit },
      uFrom: { value: new Float32Array(8) },
      uTo: { value: new Float32Array(8) },
      uMix: { value: new Float32Array(8) },
      uSlotX: { value: new Float32Array(8) },
      uScale: { value: DEFAULTS.scale },
      uSize: { value: DEFAULTS.dot },
      uZoom: { value: 40 },
      uTime: { value: 0 },
      uDrift: { value: DEFAULTS.drift },
      uArc: { value: DEFAULTS.arc },
      uLag: { value: DEFAULTS.lag },
      uColor: { value: new THREE.Color(DEFAULTS.color) },
    }),
    [baked],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: pointsVertexShader,
        fragmentShader: pointsFragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  /** 桁ごとに「どの数字から / どの数字へ / どこまで進んだか」だけ持つ */
  const slots = useRef(Array.from({ length: SLOTS }, () => ({ from: 0, to: 0, mix: 1 })))

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const now = new Date()
    const text = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`

    for (let i = 0; i < SLOTS; i++) {
      const s = slots.current[i]
      const want = Number(text[i])

      // 混ぜ終わっている桁だけ、次の数字へ向かわせる
      if (s.mix >= 1 && want !== s.to) {
        s.from = s.to
        s.to = want
        s.mix = 0
      }
      if (s.mix < 1) s.mix = Math.min(1, s.mix + dt / Math.max(0.05, params.swapTime))

      uniforms.uFrom.value[i] = s.from
      uniforms.uTo.value[i] = s.to
      uniforms.uMix.value[i] = s.mix

      const gap = params.pitch * 5.6
      uniforms.uSlotX.value[i] = i * gap + Math.floor(i / 2) * params.colonGap
    }

    /*
     * 桁の間隔を足したあとに**まとめて中央へ寄せる**。
     * 並べながら中央を推測すると、間隔を変えるたびにずれる。
     */
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < SLOTS; i++) {
      lo = Math.min(lo, uniforms.uSlotX.value[i])
      hi = Math.max(hi, uniforms.uSlotX.value[i])
    }
    const mid = (lo + hi) / 2
    for (let i = 0; i < SLOTS; i++) uniforms.uSlotX.value[i] -= mid

    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uScale.value = params.scale
    uniforms.uSize.value = params.dot
    uniforms.uZoom.value = zoom
    uniforms.uDrift.value = params.drift
    uniforms.uArc.value = params.arc
    uniforms.uLag.value = params.lag
    uniforms.uColor.value.set(params.color)
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

/** コロン。焼く価値がないので小さな点を 4 つ置いて点滅させる */
function Colons({ params }) {
  const ref = useRef(null)
  const geo = useMemo(() => new THREE.SphereGeometry(0.3, 16, 12), [])
  useEffect(() => () => geo.dispose(), [geo])

  useFrame(() => {
    if (ref.current) ref.current.visible = Math.floor(performance.now() / 500) % 2 === 0
  })

  // 桁の並びと同じ式から出す。ずれると時計に見えない
  const gap = params.pitch * 5.6
  const at = (i) => i * gap + Math.floor(i / 2) * params.colonGap
  const mid = (at(0) + at(SLOTS - 1)) / 2
  const xs = [(at(1) + at(2)) / 2 - mid, (at(3) + at(4)) / 2 - mid]

  return (
    <group ref={ref}>
      {xs.map((x, i) => [1.2, -1.2].map((y, j) => (
        <mesh key={`${i}-${j}`} geometry={geo} position={[x * params.scale, y * params.scale, 0]}>
          <meshBasicMaterial color={params.color} />
        </mesh>
      )))}
    </group>
  )
}

function Rig({ scale, pitch, onZoom }) {
  const camera = useThree((s) => s.camera)
  const viewport = useThree((s) => s.size)
  useEffect(() => {
    const w = (pitch * 5.6 * 6 + 8) * scale
    const h = 13 * scale
    // 右端は leva に覆われるので、余白を多めに取る
    const zoom = Math.min(viewport.width / w, viewport.height / h) * 0.84
    camera.zoom = zoom
    camera.position.set(0, 0, 40)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    onZoom(zoom)
  }, [camera, scale, pitch, viewport.width, viewport.height, onZoom])
  return null
}

export default function VatClock() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const zoom = useRef(40)

  const [params, setParams] = useControls(() => ({
    Cloud: folder({
      pieces: { value: DEFAULTS.pieces, min: 1000, max: 40000, step: 1000, label: 'particles' },
      dot: { value: DEFAULTS.dot, min: 0.3, max: 4, step: 0.1, label: 'dot size' },
      drift: { value: DEFAULTS.drift, min: 0, max: 0.3, step: 0.005, label: 'idle drift' },
    }),
    Morph: folder({
      swapTime: { value: DEFAULTS.swapTime, min: 0.1, max: 2, step: 0.05, label: 'morph (s)' },
      arc: { value: DEFAULTS.arc, min: 0, max: 2.5, step: 0.05, label: 'bulge' },
      lag: { value: DEFAULTS.lag, min: 0, max: 0.9, step: 0.02, label: 'stagger' },
    }),
    Layout: folder({
      scale: { value: DEFAULTS.scale, min: 0.3, max: 1.6, step: 0.02 },
      pitch: { value: DEFAULTS.pitch, min: 0.7, max: 1.6, step: 0.02, label: 'digit gap' },
      colonGap: { value: DEFAULTS.colonGap, min: 0, max: 4, step: 0.1, label: 'colon gap' },
    }),
    Look: folder({
      color: { value: DEFAULTS.color },
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
      camera={{ position: [0, 0, 40], zoom: 40, near: -200, far: 400 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[params.background]} />
      <Digits params={params} zoom={zoom.current} />
      <Colons params={params} />
      <Rig scale={params.scale} pitch={params.pitch} onZoom={(z) => { zoom.current = z }} />
    </Canvas>
  )
}
