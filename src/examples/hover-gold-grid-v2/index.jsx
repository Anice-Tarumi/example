import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'
import { vertexShader, fragmentShader } from './shaders'

const GEOMETRIES = {
  sphere: <sphereGeometry args={[1, 128, 128]} />,
  plane: <planeGeometry args={[2.6, 2.6, 128, 128]} />,
  torus: <torusKnotGeometry args={[0.8, 0.28, 220, 32]} />,
}

function createUniforms() {
  return {
    uHitPos: { value: new THREE.Vector3() },
    uInside: { value: 0 },
    uTime: { value: 0 },
    uPulseFrequency: { value: DEFAULTS.pulseFrequency },
    uPulseSharpness: { value: DEFAULTS.pulseSharpness },
    uPixellation: { value: DEFAULTS.pixellation },
    uUvMixMultiplier: { value: DEFAULTS.uvMixMultiplier },
    uPulseColor: { value: new THREE.Color(DEFAULTS.pulseColor) },
    uPulseIntensity: { value: DEFAULTS.pulseIntensity },
    uBaseColor: { value: new THREE.Color(DEFAULTS.baseColor) },
  }
}

function PulseMesh({ params }) {
  const targetInside = useRef(0)
  const [uniforms] = useState(createUniforms)

  // uniforms を prop で渡すと参照が保たれず useFrame からの更新が届かないため、
  // ShaderMaterial を自前で生成して primitive で挿す
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.DoubleSide,
  }), [uniforms])

  useEffect(() => () => material.dispose(), [material])

  // leva の値は毎フレームではなく変化時のみ uniform へ流し込む
  useEffect(() => {
    const u = uniforms
    u.uPulseFrequency.value = params.pulseFrequency
    u.uPulseSharpness.value = params.pulseSharpness
    u.uPixellation.value = params.pixellation
    u.uUvMixMultiplier.value = params.uvMixMultiplier
    u.uPulseIntensity.value = params.pulseIntensity
    u.uPulseColor.value.set(params.pulseColor)
    u.uBaseColor.value.set(params.baseColor)
  }, [uniforms, params])

  useFrame((state, delta) => {
    const u = uniforms
    u.uTime.value = state.clock.elapsedTime * params.speed
    const k = 1 - Math.exp(-8 * delta) // フレームレート非依存のダンピング
    u.uInside.value += (targetInside.current - u.uInside.value) * k
  })

  return (
    <mesh
      onPointerOver={() => { targetInside.current = 1 }}
      onPointerOut={() => { targetInside.current = 0 }}
      onPointerMove={(e) => uniforms.uHitPos.value.copy(e.point)}
    >
      {GEOMETRIES[params.geometry] || GEOMETRIES.sphere}
      <primitive object={material} attach="material" />
    </mesh>
  )
}

export default function HoverPulseRipple() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    geometry: { value: DEFAULTS.geometry, options: ['sphere', 'plane', 'torus'] },
    speed: { value: DEFAULTS.speed, min: 0, max: 4, step: 0.05 },
    Wave: folder({
      pulseFrequency: { value: DEFAULTS.pulseFrequency, min: 1, max: 60, step: 0.5, label: 'frequency' },
      pulseSharpness: { value: DEFAULTS.pulseSharpness, min: 0.5, max: 24, step: 0.1, label: 'sharpness' },
    }),
    Mosaic: folder({
      pixellation: { value: DEFAULTS.pixellation, min: 8, max: 1000, step: 1 },
      uvMixMultiplier: { value: DEFAULTS.uvMixMultiplier, min: 0, max: 12, step: 0.1, label: 'mix' },
    }),
    Color: folder({
      pulseColor: { value: DEFAULTS.pulseColor, label: 'pulse' },
      pulseIntensity: { value: DEFAULTS.pulseIntensity, min: 0, max: 4, step: 0.05, label: 'intensity' },
      baseColor: { value: DEFAULTS.baseColor, label: 'base' },
    }),
  }))

  // variant を選んだらプリセット値をパネルに反映
  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 50 }} dpr={[1, 2]}>
      <color attach="background" args={['#0a0a0a']} />
      <PulseMesh params={params} />
      <OrbitControls enableZoom={false} enablePan={false} />
    </Canvas>
  )
}
