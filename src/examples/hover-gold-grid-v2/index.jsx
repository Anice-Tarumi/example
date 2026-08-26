import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, PATTERNS } from './presets'
import { vertexShader, fragmentShader, MAX_RIPPLES } from './shaders'

const GEOMETRIES = {
  sphere: () => new THREE.SphereGeometry(1, 128, 128),
  plane: () => new THREE.PlaneGeometry(2.6, 2.6, 128, 128),
  torus: () => new THREE.TorusKnotGeometry(0.8, 0.28, 220, 32),
}

function createUniforms() {
  return {
    // 波紋は「イベント」として管理する。空きスロットは age = -1
    uOrigins: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3()) },
    uAges: { value: new Array(MAX_RIPPLES).fill(-1) },
    uLifetime: { value: DEFAULTS.lifetime },
    uMaxRadius: { value: DEFAULTS.maxRadius },
    uRingWidth: { value: DEFAULTS.ringWidth },
    uSharpness: { value: DEFAULTS.sharpness },
    uEase: { value: DEFAULTS.ease },
    uFrequency: { value: DEFAULTS.frequency },
    uTailFalloff: { value: DEFAULTS.tailFalloff },
    uPixellation: { value: DEFAULTS.pixellation },
    uUvMixMultiplier: { value: DEFAULTS.uvMixMultiplier },
    uMosaicFocus: { value: DEFAULTS.mosaicFocus },
    uPulseColor: { value: new THREE.Color(DEFAULTS.pulseColor) },
    uPulseIntensity: { value: DEFAULTS.pulseIntensity },
    uPulseGamma: { value: DEFAULTS.pulseGamma },
    uHueShift: { value: DEFAULTS.hueShift },
    uBaseColor: { value: new THREE.Color(DEFAULTS.baseColor) },
    uAccentColor: { value: new THREE.Color(DEFAULTS.accentColor) },
    uPattern: { value: PATTERNS.indexOf(DEFAULTS.pattern) },
    uPatternScale: { value: DEFAULTS.patternScale },
  }
}

function PulseMesh({ params }) {
  const camera = useThree((s) => s.camera)
  const [uniforms] = useState(createUniforms)

  // uniforms を prop で渡すと参照が保たれず useFrame からの更新が届かないため、
  // ShaderMaterial を自前で生成して primitive で挿す
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        side: THREE.DoubleSide,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  const geometry = useMemo(
    () => (GEOMETRIES[params.geometry] || GEOMETRIES.sphere)(),
    [params.geometry],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const u = uniforms
    u.uLifetime.value = params.lifetime
    u.uMaxRadius.value = params.maxRadius
    u.uRingWidth.value = params.ringWidth
    u.uSharpness.value = params.sharpness
    u.uEase.value = params.ease
    u.uFrequency.value = params.frequency
    u.uTailFalloff.value = params.tailFalloff
    u.uPixellation.value = params.pixellation
    u.uUvMixMultiplier.value = params.uvMixMultiplier
    u.uMosaicFocus.value = params.mosaicFocus
    u.uPulseIntensity.value = params.pulseIntensity
    u.uPulseGamma.value = params.pulseGamma
    u.uHueShift.value = params.hueShift
    u.uPulseColor.value.set(params.pulseColor)
    u.uBaseColor.value.set(params.baseColor)
    u.uAccentColor.value.set(params.accentColor)
    u.uPattern.value = Math.max(0, PATTERNS.indexOf(params.pattern))
    u.uPatternScale.value = params.patternScale
  }, [uniforms, params])

  // 生きている波紋。{ origin, age }
  const ripples = useRef([])
  const idleTimer = useRef(0)

  const spawn = (point) => {
    // 一番古いものから押し出す
    if (ripples.current.length >= MAX_RIPPLES) ripples.current.shift()
    ripples.current.push({ origin: point.clone(), age: 0 })
    idleTimer.current = 0
  }

  /**
   * 形状の頂点をひとつ選んで、そこから波を出す。
   * 全周から選ぶと半分は裏側で発生して縁にしか見えないので、
   * カメラを向いている頂点に絞る。
   */
  const spawnRandom = () => {
    const attr = geometry.getAttribute('position')
    const camDir = camera.position.clone().normalize()
    const p = new THREE.Vector3()

    for (let tries = 0; tries < 24; tries++) {
      p.fromBufferAttribute(attr, Math.floor(Math.random() * attr.count))
      if (p.lengthSq() > 1e-6 && p.clone().normalize().dot(camDir) > 0.25) {
        spawn(p)
        return
      }
    }
    spawn(p)
  }

  useFrame((state, delta) => {
    // 寿命を過ぎたものを落とす
    const alive = []
    for (const r of ripples.current) {
      r.age += delta
      if (r.age <= params.lifetime) alive.push(r)
    }
    ripples.current = alive

    // 放置中は一定間隔でランダムな位置から出す
    if (params.autoRipple) {
      idleTimer.current += delta
      if (idleTimer.current >= params.idleInterval) {
        idleTimer.current = 0
        spawnRandom()
      }
    }

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples.current[i]
      if (r) {
        uniforms.uOrigins.value[i].copy(r.origin)
        uniforms.uAges.value[i] = r.age
      } else {
        uniforms.uAges.value[i] = -1
      }
    }
  })

  return (
    <mesh
      geometry={geometry}
      // クリックした一点から波を出す。ホバーでは何も起きない
      onClick={(e) => {
        e.stopPropagation()
        spawn(e.point)
      }}
    >
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
    Ripple: folder({
      lifetime: { value: DEFAULTS.lifetime, min: 0.3, max: 6, step: 0.05 },
      maxRadius: { value: DEFAULTS.maxRadius, min: 0.5, max: 6, step: 0.05, label: 'reach' },
      ringWidth: { value: DEFAULTS.ringWidth, min: 0.05, max: 1.5, step: 0.01, label: 'width' },
      sharpness: { value: DEFAULTS.sharpness, min: 0.4, max: 6, step: 0.1 },
      ease: { value: DEFAULTS.ease, min: 1, max: 8, step: 0.1, label: 'ease out' },
      frequency: { value: DEFAULTS.frequency, min: 2, max: 60, step: 0.5, label: 'rings' },
      tailFalloff: { value: DEFAULTS.tailFalloff, min: 0.2, max: 8, step: 0.1, label: 'tail' },
    }),
    Mosaic: folder({
      pixellation: { value: DEFAULTS.pixellation, min: 20, max: 500, step: 5, label: 'density' },
      uvMixMultiplier: { value: DEFAULTS.uvMixMultiplier, min: 0, max: 16, step: 0.1, label: 'strength' },
      mosaicFocus: { value: DEFAULTS.mosaicFocus, min: 0.5, max: 5, step: 0.1, label: 'focus' },
    }),
    Surface: folder({
      pattern: { value: DEFAULTS.pattern, options: PATTERNS },
      patternScale: { value: DEFAULTS.patternScale, min: 1, max: 60, step: 0.5, label: 'scale' },
      baseColor: { value: DEFAULTS.baseColor, label: 'base' },
      accentColor: { value: DEFAULTS.accentColor, label: 'accent' },
    }),
    Glow: folder({
      pulseColor: { value: DEFAULTS.pulseColor, label: 'pulse' },
      pulseIntensity: { value: DEFAULTS.pulseIntensity, min: 0, max: 6, step: 0.05, label: 'intensity' },
      pulseGamma: { value: DEFAULTS.pulseGamma, min: 0.5, max: 4, step: 0.05, label: 'gamma' },
      hueShift: { value: DEFAULTS.hueShift, min: 0, max: 2, step: 0.05, label: 'hue shift' },
    }),
    Idle: folder({
      autoRipple: { value: DEFAULTS.autoRipple, label: 'auto' },
      idleInterval: { value: DEFAULTS.idleInterval, min: 0.2, max: 4, step: 0.05, label: 'interval' },
    }),
  }))

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
