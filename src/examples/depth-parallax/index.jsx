import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { vertexShader, parallaxFragmentShader } from './glsl/parallax'
import { useTexture } from '@react-three/drei'
import { getSceneTextures } from './scene'
import { PHOTOS, SOURCE_OPTIONS, configureTextures } from './photos'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, MODES } from './presets'

function ParallaxCard({ params }) {
  const size = useThree((s) => s.size)
  const domElement = useThree((s) => s.gl.domElement)
  // 手続きの絵は同期で作れる。写真は読み込みが要るので useTexture（suspend する）
  const procedural = useMemo(() => getSceneTextures(), [])
  const photoId = params.source === 'photoB' ? 'photoB' : 'photoA'
  const photo = PHOTOS[photoId]
  const [photoColor, photoDepth] = useTexture([photo.color, photo.depth])

  const scene = useMemo(() => {
    if (params.source === 'procedural') return procedural
    configureTextures(photoColor, photoDepth)
    return { color: photoColor, depth: photoDepth, aspect: photo.aspect }
  }, [params.source, procedural, photoColor, photoDepth, photo.aspect])

  // サンプル数はシェーダーへ定数として埋め込むので、変わったら作り直す
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: parallaxFragmentShader(params.parallaxSamples, params.blurSamples),
      uniforms: {
        uTexture: { value: scene.color },
        uDepthTexture: { value: scene.depth },
        uShift: { value: new THREE.Vector2() },
        uZMultiplier: { value: DEFAULTS.zMultiplier },
        uFocus: { value: DEFAULTS.focus },
        uBlurStrength: { value: DEFAULTS.blurStrength },
        uAperture: { value: DEFAULTS.aperture },
        uLight: { value: new THREE.Vector2(0.5, 0.5) },
        uLightRadius: { value: DEFAULTS.lightRadius },
        uLightStrength: { value: DEFAULTS.lightStrength },
        uLightDepth: { value: DEFAULTS.lightDepth },
        uLightColor: { value: new THREE.Color(DEFAULTS.lightColor) },
        uCorner: { value: DEFAULTS.corner },
        uVignette: { value: DEFAULTS.vignette },
        uFogColor: { value: new THREE.Color(DEFAULTS.fogColor) },
        uFogAmount: { value: DEFAULTS.fogAmount },
        uPad: { value: 0.1 },
        uAspect: { value: scene.aspect },
        uMode: { value: 0 },
      },
    })
  }, [scene, params.parallaxSamples, params.blurSamples])

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    u.uZMultiplier.value = params.zMultiplier
    u.uFocus.value = params.focus
    u.uBlurStrength.value = params.blurStrength
    u.uAperture.value = params.aperture
    u.uLightRadius.value = params.lightRadius
    u.uLightStrength.value = params.lightStrength
    u.uLightDepth.value = params.lightDepth
    u.uLightColor.value.set(params.lightColor)
    u.uCorner.value = params.corner
    u.uVignette.value = params.vignette
    u.uFogColor.value.set(params.fogColor)
    u.uFogAmount.value = params.fogAmount
    // 視差の最大ずれ幅ぶん内側を表示する
    u.uPad.value = Math.min(0.22, params.shiftAmount * 0.75 + 0.02)
    u.uMode.value = Math.max(0, MODES.indexOf(params.mode))
  }, [material, params])

  // ---- カーソル ----
  const pointer = useRef({ x: 0.5, y: 0.5, idle: 0 })

  useEffect(() => {
    const onMove = (e) => {
      const rect = domElement.getBoundingClientRect()
      const p = pointer.current
      p.x = (e.clientX - rect.left) / rect.width
      p.y = 1 - (e.clientY - rect.top) / rect.height
      p.idle = 0
    }
    domElement.addEventListener('pointermove', onMove)
    return () => domElement.removeEventListener('pointermove', onMove)
  }, [domElement])

  const smoothed = useRef(new THREE.Vector2(0.5, 0.5))

  useFrame((state, delta) => {
    const p = pointer.current
    p.idle += delta

    // 放置時はゆっくり見回す
    let tx = p.x
    let ty = p.y
    if (params.autoDemo && p.idle > 1.5) {
      const t = state.clock.elapsedTime * params.demoSpeed
      tx = 0.5 + Math.sin(t * 0.6) * 0.34
      ty = 0.5 + Math.sin(t * 0.43 + 1.2) * 0.22
    }

    // フレームレート非依存に追従させる
    const k = 1 - Math.exp(-params.shiftEase * 60 * delta)
    smoothed.current.x += (tx - smoothed.current.x) * k
    smoothed.current.y += (ty - smoothed.current.y) * k

    const u = material.uniforms
    u.uShift.value.set(
      (smoothed.current.x - 0.5) * params.shiftAmount,
      (smoothed.current.y - 0.5) * params.shiftAmount,
    )
    u.uLight.value.set(smoothed.current.x, smoothed.current.y)
  })

  // 画面に収まる範囲でカードを最大化する（perspective の可視範囲から逆算）
  const camera = useThree((s) => s.camera)
  const scale = useMemo(() => {
    const viewAspect = size.width / size.height
    const dist = camera.position.z
    const visibleH = 2 * dist * Math.tan((camera.fov * Math.PI) / 360)
    const visibleW = visibleH * viewAspect
    const margin = 0.88

    if (visibleW / visibleH > scene.aspect) {
      const h = visibleH * margin
      return [h * scene.aspect, h, 1]
    }
    const w = visibleW * margin
    return [w, w / scene.aspect, 1]
  }, [size, scene.aspect, camera])

  return (
    <mesh scale={scale} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

export default function DepthParallax() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    source: { value: DEFAULTS.source, options: SOURCE_OPTIONS },
    mode: { value: DEFAULTS.mode, options: MODES },
    Parallax: folder({
      zMultiplier: { value: DEFAULTS.zMultiplier, min: 0, max: 0.8, step: 0.01, label: 'depth' },
      shiftAmount: { value: DEFAULTS.shiftAmount, min: 0, max: 0.2, step: 0.005, label: 'shift' },
      shiftEase: { value: DEFAULTS.shiftEase, min: 0.01, max: 0.4, step: 0.01, label: 'ease' },
      parallaxSamples: { value: DEFAULTS.parallaxSamples, min: 4, max: 32, step: 1, label: 'steps' },
    }),
    Focus: folder({
      focus: { value: DEFAULTS.focus, min: 0, max: 1, step: 0.01, label: 'plane' },
      blurStrength: { value: DEFAULTS.blurStrength, min: 0, max: 0.4, step: 0.005, label: 'blur' },
      aperture: { value: DEFAULTS.aperture, min: 0.2, max: 3, step: 0.05 },
      blurSamples: { value: DEFAULTS.blurSamples, min: 1, max: 20, step: 1, label: 'samples' },
    }),
    Flashlight: folder({
      lightStrength: { value: DEFAULTS.lightStrength, min: 0, max: 4, step: 0.05, label: 'strength' },
      lightRadius: { value: DEFAULTS.lightRadius, min: 0.05, max: 1, step: 0.01, label: 'radius' },
      lightDepth: { value: DEFAULTS.lightDepth, min: 0, max: 1, step: 0.01, label: 'reach' },
      lightColor: { value: DEFAULTS.lightColor, label: 'color' },
    }),
    Look: folder({
      corner: { value: DEFAULTS.corner, min: 0, max: 0.5, step: 0.01, label: 'corner' },
      vignette: { value: DEFAULTS.vignette, min: 0, max: 1, step: 0.01 },
      fogColor: { value: DEFAULTS.fogColor, label: 'fog' },
      fogAmount: { value: DEFAULTS.fogAmount, min: 0, max: 1, step: 0.01, label: 'fog amount' },
      autoDemo: { value: DEFAULTS.autoDemo, label: 'auto demo' },
      demoSpeed: { value: DEFAULTS.demoSpeed, min: 0.05, max: 2, step: 0.05, label: 'demo speed' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0, 2.4], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#05070c']} />
      {/* 写真は読み込み中に suspend する */}
      <Suspense fallback={null}>
        <ParallaxCard params={params} />
      </Suspense>
    </Canvas>
  )
}
