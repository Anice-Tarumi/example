import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useVelocityField } from '../../shared/useVelocityField'
import { buildStrandOrb } from './strands'
import { strandVertexShader, strandFragmentShader } from './glsl/strand'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

function Orb({ params }) {
  const { size, gl } = useThree()
  const aspect = size.width / Math.max(size.height, 1)

  const { geometry } = useMemo(
    () =>
      buildStrandOrb({
        bundles: params.bundles,
        perBundle: params.perBundle,
        samples: params.samples,
        radius: 1,
        spread: params.spread,
        wobbleAmount: params.wobble,
      }),
    [params.bundles, params.perBundle, params.samples, params.spread, params.wobble],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      tFluid: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uThickness: { value: DEFAULTS.thickness },
      uFluidPush: { value: DEFAULTS.fluidPush },
      uFluidGain: { value: DEFAULTS.fluidGain },
      uTime: { value: 0 },
      uSpeed: { value: DEFAULTS.speed },
      uBundleOffset: { value: DEFAULTS.bundleOffset },
      uStrandOffset: { value: DEFAULTS.strandOffset },
      uRepeat: { value: DEFAULTS.repeat },
      uFillLength: { value: DEFAULTS.fillLength },
      uStartFade: { value: DEFAULTS.startFade },
      uEndFade: { value: DEFAULTS.endFade },
      uColor: { value: new THREE.Color(DEFAULTS.color) },
      uHighlightColor: { value: new THREE.Color(DEFAULTS.highlight) },
      uHighlightPower: { value: DEFAULTS.highlightPower },
      uContrast: { value: DEFAULTS.contrast },
      uOpacity: { value: DEFAULTS.opacity },
      uReveal: { value: 1 },
      uBackFade: { value: DEFAULTS.backFade },
      uFluidGamma: { value: DEFAULTS.fluidGamma },
    }),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: strandVertexShader,
        fragmentShader: strandFragmentShader,
        uniforms,
        transparent: true,
        // 半透明 + discard なので深度書き込みは切る。順序で色が変わるのを避ける
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    material.blending = params.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    material.needsUpdate = true
  }, [material, params.additive])

  const stepFluid = useVelocityField(params.fluidRes, aspect)

  // 流体へ渡すカーソル。UV 空間で前フレームとの差分を取る
  const pointer = useRef({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false })

  useEffect(() => {
    const el = gl.domElement
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const p = pointer.current
      p.px = p.x
      p.py = p.y
      p.x = (e.clientX - r.left) / r.width
      p.y = 1 - (e.clientY - r.top) / r.height
      p.moved = true
    }
    el.addEventListener('pointermove', onMove)
    return () => el.removeEventListener('pointermove', onMove)
  }, [gl])

  const group = useRef(null)
  const reveal = useRef(0)

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30)

    const tex = stepFluid(gl, dt, pointer.current, params)
    pointer.current.moved = false

    uniforms.tFluid.value = tex
    uniforms.uResolution.value.set(size.width, size.height)
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uThickness.value = params.thickness
    uniforms.uFluidPush.value = params.fluidPush
    uniforms.uFluidGain.value = params.fluidGain
    uniforms.uSpeed.value = params.speed
    uniforms.uBundleOffset.value = params.bundleOffset
    uniforms.uStrandOffset.value = params.strandOffset
    uniforms.uRepeat.value = params.repeat
    uniforms.uFillLength.value = params.fillLength
    uniforms.uStartFade.value = params.startFade
    uniforms.uEndFade.value = params.endFade
    uniforms.uHighlightPower.value = params.highlightPower
    uniforms.uContrast.value = params.contrast
    uniforms.uOpacity.value = params.opacity
    uniforms.uBackFade.value = params.backFade
    uniforms.uFluidGamma.value = params.fluidGamma
    uniforms.uColor.value.set(params.color)
    uniforms.uHighlightColor.value.set(params.highlight)

    // リビール。自動なら往復させる
    if (params.autoReveal) {
      reveal.current += dt * params.revealSpeed
      const cycle = (reveal.current % 2) - 1
      uniforms.uReveal.value = 1 - Math.abs(cycle)
    } else {
      uniforms.uReveal.value = params.reveal
    }

    if (group.current) group.current.rotation.y += dt * params.spin
    // priority は上げない。上げると R3F の自動描画が止まり、
    // 自分でシーンを描かない限り何も出なくなる（流体は自前で target を戻している）
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}

export default function StrandOrb() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Strands: folder({
      bundles: { value: DEFAULTS.bundles, min: 3, max: 30, step: 1 },
      perBundle: { value: DEFAULTS.perBundle, min: 4, max: 40, step: 1, label: 'per bundle' },
      samples: { value: DEFAULTS.samples, min: 16, max: 128, step: 4 },
      spread: { value: DEFAULTS.spread, min: 0, max: 0.8, step: 0.01 },
      wobble: { value: DEFAULTS.wobble, min: 0, max: 0.5, step: 0.01 },
      thickness: { value: DEFAULTS.thickness, min: 0.4, max: 6, step: 0.1 },
    }),
    Flow: folder({
      speed: { value: DEFAULTS.speed, min: 0, max: 1.5, step: 0.01 },
      repeat: { value: DEFAULTS.repeat, min: 0.5, max: 12, step: 0.5, label: 'bands' },
      fillLength: { value: DEFAULTS.fillLength, min: 0.05, max: 1, step: 0.01, label: 'band w' },
      startFade: { value: DEFAULTS.startFade, min: 0.01, max: 1, step: 0.01, label: 'head' },
      endFade: { value: DEFAULTS.endFade, min: 0.01, max: 1, step: 0.01, label: 'tail' },
      bundleOffset: { value: DEFAULTS.bundleOffset, min: 0, max: 2, step: 0.02, label: 'bundle Δ' },
      strandOffset: { value: DEFAULTS.strandOffset, min: 0, max: 2, step: 0.02, label: 'strand Δ' },
      spin: { value: DEFAULTS.spin, min: 0, max: 0.8, step: 0.02 },
    }),
    Reveal: folder({
      autoReveal: { value: DEFAULTS.autoReveal, label: 'auto' },
      reveal: { value: DEFAULTS.reveal, min: 0, max: 1, step: 0.01 },
      revealSpeed: { value: DEFAULTS.revealSpeed, min: 0.05, max: 1.5, step: 0.05, label: 'speed' },
    }),
    Look: folder({
      color: { value: DEFAULTS.color },
      highlight: { value: DEFAULTS.highlight },
      highlightPower: { value: DEFAULTS.highlightPower, min: 0, max: 6, step: 0.1, label: 'hl pow' },
      contrast: { value: DEFAULTS.contrast, min: 0.2, max: 3, step: 0.05 },
      opacity: { value: DEFAULTS.opacity, min: 0.05, max: 1, step: 0.01 },
      backFade: { value: DEFAULTS.backFade, min: 0.5, max: 6, step: 0.1, label: 'back fade' },
      additive: { value: DEFAULTS.additive },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
    Fluid: folder({
      fluidPush: { value: DEFAULTS.fluidPush, min: 0, max: 1.2, step: 0.01, label: 'push' },
      fluidGain: { value: DEFAULTS.fluidGain, min: 0.1, max: 12, step: 0.1, label: 'gain' },
      fluidGamma: { value: DEFAULTS.fluidGamma, min: 0, max: 3, step: 0.05, label: 'gamma' },
      fluidForce: { value: DEFAULTS.fluidForce, min: 500, max: 12000, step: 100, label: 'force' },
      fluidRadius: { value: DEFAULTS.fluidRadius, min: 0.05, max: 1, step: 0.01, label: 'radius' },
      fluidCurl: { value: DEFAULTS.fluidCurl, min: 0, max: 50, step: 1, label: 'curl' },
      fluidDissipation: { value: DEFAULTS.fluidDissipation, min: 0, max: 4, step: 0.05, label: 'decay' },
      fluidIterations: { value: DEFAULTS.fluidIterations, min: 4, max: 24, step: 1, label: 'iters' },
      fluidRes: { value: DEFAULTS.fluidRes, min: 64, max: 256, step: 32, label: 'res' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0, 3.4], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={[params.background]} />
      <Orb params={params} />
      <OrbitControls enablePan={false} minDistance={1.6} maxDistance={9} />
    </Canvas>
  )
}
