import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { createScrollTexture } from './scrollTexture'
import { SceneA, SceneB } from './scenes'
import { vertexShader, fragmentShader } from './shaders'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, MODES } from './presets'

const HOLD = 0.7 // 端で止まる秒数

function createUniforms() {
  return {
    uSceneA: { value: null },
    uSceneB: { value: null },
    uProgress: { value: 0 },
    uScroll: { value: null },
    uSlope: { value: 0.2 },
    uParallax: { value: 0.4 },
    uDisplace: { value: 0.025 },
    uCaAmount: { value: 12 },
    uHexScale: { value: 9 },
    uHexJitter: { value: 0.55 },
    uHexWarp: { value: 0.12 },
    uHexEdge: { value: 0.06 },
    uHexRefract: { value: 0.03 },
    uHexSpin: { value: 1.2 },
    uHexWindow: { value: 0.28 },
    uHexReach: { value: 0.18 },
    uEdgeColor: { value: new THREE.Color('#8fe6ff') },
    uHexGlow: { value: 1 },
    uMode: { value: 0 },
    uDirection: { value: DEFAULTS.direction },
    uEdge: { value: DEFAULTS.edge },
    uNoiseScale: { value: DEFAULTS.noiseScale },
    uNoiseAmount: { value: DEFAULTS.noiseAmount },
    uFlash: { value: DEFAULTS.flash },
    uZoom: { value: DEFAULTS.zoom },
    uOverlayColor: { value: new THREE.Color(DEFAULTS.overlayColor) },
    uAspect: { value: 1 },
  }
}

function TransitionStage({ params }) {
  const size = useThree((s) => s.size)
  const sceneA = useMemo(() => new THREE.Scene(), [])
  const sceneB = useMemo(() => new THREE.Scene(), [])
  const fboSettings = useMemo(() => ({ type: THREE.UnsignedByteType }), [])
  // 切り口を作るテクスチャ。手続きで一度だけ焼く
  const scroll = useMemo(() => createScrollTexture(), [])
  useEffect(() => () => scroll.dispose(), [scroll])

  const targetA = useFBO(fboSettings)
  const targetB = useFBO(fboSettings)

  const [uniforms] = useState(createUniforms)

  // 合成は three 公式の FullScreenQuad で明示的に描く（R3F の自動レンダリングに依存しない）
  const quad = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })
    return new FullScreenQuad(material)
  }, [uniforms])

  useEffect(() => () => {
    quad.material.dispose()
    quad.dispose()
  }, [quad])

  const progress = useRef(0)
  const dir = useRef(1)
  const hold = useRef(0)

  useEffect(() => {
    uniforms.uMode.value = Math.max(0, MODES.indexOf(params.mode))
    uniforms.uDirection.value = params.direction
    uniforms.uEdge.value = params.edge
    uniforms.uNoiseScale.value = params.noiseScale
    uniforms.uNoiseAmount.value = params.noiseAmount
    uniforms.uFlash.value = params.flash
    uniforms.uZoom.value = params.zoom
    uniforms.uOverlayColor.value.set(params.overlayColor)
    uniforms.uSlope.value = params.slope
    uniforms.uParallax.value = params.parallax
    uniforms.uDisplace.value = params.displace
    uniforms.uCaAmount.value = params.ca
    uniforms.uHexScale.value = params.hexScale
    uniforms.uHexJitter.value = params.hexJitter
    uniforms.uHexWarp.value = params.hexWarp
    uniforms.uHexEdge.value = params.hexEdge
    uniforms.uHexRefract.value = params.hexRefract
    uniforms.uHexSpin.value = params.hexSpin
    uniforms.uHexWindow.value = params.hexWindow
    uniforms.uHexReach.value = params.hexReach
    uniforms.uEdgeColor.value.set(params.edgeColor)
    uniforms.uHexGlow.value = params.hexGlow
  }, [uniforms, params])

  useEffect(() => {
    uniforms.uAspect.value = size.width / size.height
  }, [uniforms, size])

  // priority > 0 で R3F の自動レンダリングを止め、FBO 2 枚 → 合成の順に自前で描く
  useFrame((state, delta) => {
    const { gl, camera } = state

    if (params.auto) {
      if (hold.current > 0) {
        hold.current -= delta
      } else {
        progress.current += (delta / Math.max(params.duration, 0.05)) * dir.current
        if (progress.current >= 1) {
          progress.current = 1
          dir.current = -1
          hold.current = HOLD
        } else if (progress.current <= 0) {
          progress.current = 0
          dir.current = 1
          hold.current = HOLD
        }
      }
    } else {
      progress.current = params.progress
    }
    uniforms.uProgress.value = progress.current

    gl.setRenderTarget(targetA)
    gl.render(sceneA, camera)

    gl.setRenderTarget(targetB)
    gl.render(sceneB, camera)

    gl.setRenderTarget(null)
    uniforms.uScroll.value = scroll
    uniforms.uSceneA.value = targetA.texture
    uniforms.uSceneB.value = targetB.texture
    quad.render(gl)
  }, 1)

  return (
    <>
      {createPortal(<SceneA />, sceneA)}
      {createPortal(<SceneB />, sceneB)}
    </>
  )
}

export default function SceneTransitions() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    mode: { value: DEFAULTS.mode, options: MODES },
    slope: { value: DEFAULTS.slope, min: 0, max: 0.6, step: 0.01, label: 'cut slope' },
    parallax: { value: DEFAULTS.parallax, min: 0, max: 1, step: 0.02 },
    displace: { value: DEFAULTS.displace, min: 0, max: 0.12, step: 0.002, label: 'push' },
    ca: { value: DEFAULTS.ca, min: 0, max: 40, step: 1, label: 'aberration' },
    Hex: folder({
      hexScale: { value: DEFAULTS.hexScale, min: 2, max: 30, step: 0.5, label: 'cells' },
      hexJitter: { value: DEFAULTS.hexJitter, min: 0, max: 1, step: 0.02, label: 'jitter' },
      hexWarp: { value: DEFAULTS.hexWarp, min: 0, max: 0.6, step: 0.01, label: 'warp' },
      hexEdge: { value: DEFAULTS.hexEdge, min: 0, max: 0.25, step: 0.005, label: 'edge' },
      hexRefract: { value: DEFAULTS.hexRefract, min: 0, max: 0.15, step: 0.002, label: 'refract' },
      hexSpin: { value: DEFAULTS.hexSpin, min: 0, max: 4, step: 0.05, label: 'spin' },
      hexWindow: { value: DEFAULTS.hexWindow, min: 0.05, max: 1, step: 0.01, label: 'cell time' },
      hexReach: { value: DEFAULTS.hexReach, min: 0, max: 0.6, step: 0.01, label: 'grid reach' },
      edgeColor: { value: DEFAULTS.edgeColor, label: 'edge col' },
      hexGlow: { value: DEFAULTS.hexGlow, min: 0, max: 2, step: 0.05, label: 'edge glow' },
    }),
    auto: true,
    progress: {
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.001,
      render: (get) => !get('auto'),
    },
    duration: { value: DEFAULTS.duration, min: 0.2, max: 6, step: 0.05 },
    direction: { value: DEFAULTS.direction, options: { 'L → R': 0, 'R → L': 1 } },
    Edge: folder({
      edge: { value: DEFAULTS.edge, min: 0.001, max: 0.4, step: 0.001, label: 'softness' },
      noiseScale: { value: DEFAULTS.noiseScale, min: 0.5, max: 16, step: 0.1, label: 'noise scale' },
      noiseAmount: { value: DEFAULTS.noiseAmount, min: 0, max: 0.6, step: 0.005, label: 'noise amount' },
    }),
    Look: folder({
      flash: { value: DEFAULTS.flash, min: 0, max: 1.5, step: 0.01 },
      zoom: { value: DEFAULTS.zoom, min: 0, max: 0.4, step: 0.005 },
      overlayColor: { value: DEFAULTS.overlayColor, label: 'overlay' },
    }),
  }))

  // variant を選んだらプリセット値をパネルに反映
  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0, 4.2], fov: 50 }} dpr={[1, 2]}>
      <TransitionStage params={params} />
    </Canvas>
  )
}
