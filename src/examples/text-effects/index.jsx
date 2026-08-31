import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildSdfAtlas, buildTextGeometry } from './sdf'
import { textVertexShader, textFragmentShader } from './glsl/text'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, MODES } from './presets'
import { FONT_OPTIONS, loadFont } from './fonts'

function SdfText({ params }) {
  const viewport = useThree((s) => s.viewport)

  // 読み込みが終わったフォント。終わるまで焼かない
  const [ready, setReady] = useState(null)
  useEffect(() => {
    let alive = true
    loadFont(params.font).then((f) => {
      if (alive) setReady(f)
    })
    return () => {
      alive = false
    }
  }, [params.font])

  // アトラスは文字集合かフォントが変わったときだけ焼き直す
  const atlas = useMemo(
    () => (ready ? buildSdfAtlas(params.text, ready.family, ready.weight) : null),
    [params.text, ready],
  )
  useEffect(() => () => atlas?.texture.dispose(), [atlas])

  const text = useMemo(
    () => (atlas ? buildTextGeometry(params.text, atlas) : null),
    [params.text, atlas],
  )
  useEffect(() => () => text?.geometry.dispose(), [text])

  const uniforms = useMemo(
    () => ({
      uAtlas: { value: null },
      uTime: { value: 0 },
      uCount: { value: 1 },
      uMode: { value: 0 },
      uProgress: { value: 1 },
      uWave: { value: DEFAULTS.wave },
      uWaveSpeed: { value: DEFAULTS.waveSpeed },
      uJitter: { value: DEFAULTS.jitter },
      uCursor: { value: new THREE.Vector2() },
      uFill: { value: new THREE.Color(DEFAULTS.fill) },
      uOutline: { value: new THREE.Color(DEFAULTS.outline) },
      uGlow: { value: new THREE.Color(DEFAULTS.glow) },
      uWeight: { value: DEFAULTS.weight },
      uOutlineWidth: { value: DEFAULTS.outlineWidth },
      uGlowWidth: { value: DEFAULTS.glowWidth },
      uGlowStrength: { value: DEFAULTS.glowStrength },
      uSoft: { value: DEFAULTS.soft },
    }),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: textVertexShader,
        fragmentShader: textFragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    if (!atlas || !text) return
    uniforms.uAtlas.value = atlas.texture
    uniforms.uCount.value = text.count
  }, [uniforms, atlas, text])

  useEffect(() => {
    uniforms.uMode.value = Math.max(0, MODES.indexOf(params.mode))
    uniforms.uWave.value = params.wave
    uniforms.uWaveSpeed.value = params.waveSpeed
    uniforms.uJitter.value = params.jitter
    uniforms.uWeight.value = params.weight
    uniforms.uOutlineWidth.value = params.outlineWidth
    uniforms.uGlowWidth.value = params.glowWidth
    uniforms.uGlowStrength.value = params.glowStrength
    uniforms.uSoft.value = params.soft
    uniforms.uFill.value.set(params.fill)
    uniforms.uOutline.value.set(params.outline)
    uniforms.uGlow.value.set(params.glow)
  }, [uniforms, params])

  const progress = useRef(0)
  const cursor = useRef(new THREE.Vector2())

  // リビールはモードを選び直したら頭から
  useEffect(() => {
    progress.current = 0
  }, [params.mode, params.text])

  useFrame((state, delta) => {
    uniforms.uTime.value = state.clock.elapsedTime

    if (params.mode === 'reveal') {
      progress.current += delta * 0.6
      if (progress.current > 1.9) progress.current = params.loop ? 0 : 1.9
      uniforms.uProgress.value = Math.min(1, progress.current)
    } else {
      uniforms.uProgress.value = 1
    }

    const k = 1 - Math.exp(-6 * delta)
    cursor.current.x += (state.pointer.x - cursor.current.x) * k
    cursor.current.y += (state.pointer.y - cursor.current.y) * k
    uniforms.uCursor.value.copy(cursor.current)
  })

  // 画面に収める。scale はその上に掛かる倍率として扱う
  const fit = useMemo(() => {
    const local = (text?.width ?? 1) + 0.8 // 板の張り出しぶん
    return Math.min(params.scale, (viewport.width * 0.72) / Math.max(local, 1e-3))
  }, [text, viewport.width, params.scale])

  if (!text) return null
  return <mesh geometry={text.geometry} material={material} scale={fit} frustumCulled={false} />
}

export default function TextEffects() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    text: { value: DEFAULTS.text },
    font: { value: DEFAULTS.font, options: FONT_OPTIONS },
    mode: { value: DEFAULTS.mode, options: MODES },
    Shape: folder({
      weight: { value: DEFAULTS.weight, min: -1, max: 1, step: 0.02 },
      outlineWidth: { value: DEFAULTS.outlineWidth, min: 0, max: 4, step: 0.05, label: 'outline' },
      glowWidth: { value: DEFAULTS.glowWidth, min: 0, max: 5, step: 0.05, label: 'glow w' },
      glowStrength: { value: DEFAULTS.glowStrength, min: 0, max: 2, step: 0.02, label: 'glow' },
      soft: { value: DEFAULTS.soft, min: 0.3, max: 4, step: 0.05 },
      scale: { value: DEFAULTS.scale, min: 0.4, max: 4, step: 0.05 },
    }),
    Motion: folder({
      wave: { value: DEFAULTS.wave, min: 0, max: 0.5, step: 0.01 },
      waveSpeed: { value: DEFAULTS.waveSpeed, min: 0, max: 6, step: 0.1, label: 'wave spd' },
      jitter: { value: DEFAULTS.jitter, min: 0, max: 1, step: 0.02 },
      loop: { value: DEFAULTS.loop },
    }),
    Color: folder({
      fill: { value: DEFAULTS.fill },
      outline: { value: DEFAULTS.outline },
      glow: { value: DEFAULTS.glow },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  const bg = useMemo(() => new THREE.Color(params.background), [params.background])

  return (
    <Canvas camera={{ position: [0, 0, 4.2], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={[bg]} />
      <SdfText params={params} />
      <OrbitControls enablePan={false} minDistance={1.4} maxDistance={12} />
    </Canvas>
  )
}
