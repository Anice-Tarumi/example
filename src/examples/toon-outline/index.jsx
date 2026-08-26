import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { quadVertexShader, outlineFragmentShader } from './glsl/outline'
import { Island } from './scene'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, MODES } from './presets'

/** 色 + 情報の 2 枚を同時に書き出す MRT ターゲット */
function createGBuffer(width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    count: 2,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
  })
  return target
}

function OutlineRenderer({ params }) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const width = Math.max(2, Math.floor(size.width * dpr))
  const height = Math.max(2, Math.floor(size.height * dpr))

  const gbuffer = useMemo(() => createGBuffer(width, height), [width, height])
  useEffect(() => () => gbuffer.dispose(), [gbuffer])

  const uniforms = useMemo(
    () => ({
      tColor: { value: null },
      tInfo: { value: null },
      uResolution: { value: new THREE.Vector2() },
      uThickness: { value: DEFAULTS.thickness },
      uOutlineColor: { value: new THREE.Color(DEFAULTS.outlineColor) },
      uIdRange: { value: new THREE.Vector3() },
      uDepthRange: { value: new THREE.Vector3() },
      uNormalRange: { value: new THREE.Vector3() },
      uSmoothMargin: { value: DEFAULTS.smoothMargin },
      uMode: { value: 0 },
    }),
    [],
  )

  const quad = useMemo(
    () =>
      new FullScreenQuad(
        new THREE.ShaderMaterial({
          vertexShader: quadVertexShader,
          fragmentShader: outlineFragmentShader,
          uniforms,
          depthTest: false,
          depthWrite: false,
        }),
      ),
    [uniforms],
  )

  useEffect(() => () => {
    quad.material.dispose()
    quad.dispose()
  }, [quad])

  useEffect(() => {
    uniforms.uThickness.value = params.thickness
    uniforms.uOutlineColor.value.set(params.outlineColor)
    // range の下限は常に 0。leva に出さない値を params に混ぜると setParams が壊れる
    uniforms.uIdRange.value.set(0, params.idMax, params.idThreshold)
    uniforms.uDepthRange.value.set(0, params.depthMax, params.depthThreshold)
    uniforms.uNormalRange.value.set(0, params.normalMax, params.normalThreshold)
    uniforms.uSmoothMargin.value = params.smoothMargin
    uniforms.uMode.value = Math.max(0, MODES.indexOf(params.mode))
  }, [uniforms, params])

  useEffect(() => {
    uniforms.uResolution.value.set(width, height)
  }, [uniforms, width, height])

  const bg = useMemo(() => new THREE.Color(DEFAULTS.background), [])
  useEffect(() => {
    bg.set(params.background)
  }, [bg, params.background])

  useFrame((state) => {
    const { gl, scene, camera } = state

    // シーンを G-Buffer へ。背景色もここで塗っておく
    const prevClear = gl.getClearColor(new THREE.Color()).getHex()
    gl.setClearColor(bg, 1)
    gl.setRenderTarget(gbuffer)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    gl.setClearColor(prevClear, 1)

    uniforms.tColor.value = gbuffer.textures[0]
    uniforms.tInfo.value = gbuffer.textures[1]
    quad.render(gl)
  }, 1)

  return null
}

export default function ToonOutline() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    mode: { value: DEFAULTS.mode, options: MODES },
    Outline: folder({
      thickness: { value: DEFAULTS.thickness, min: 0.2, max: 5, step: 0.1 },
      outlineColor: { value: DEFAULTS.outlineColor, label: 'color' },
      smoothMargin: { value: DEFAULTS.smoothMargin, min: 0.01, max: 0.5, step: 0.01, label: 'softness' },
    }),
    IdEdge: folder({
      idMax: { value: DEFAULTS.idMax, min: 0.02, max: 1, step: 0.01, label: 'range' },
      idThreshold: { value: DEFAULTS.idThreshold, min: 0, max: 1, step: 0.01, label: 'threshold' },
    }),
    DepthEdge: folder({
      depthMax: { value: DEFAULTS.depthMax, min: 0.001, max: 0.1, step: 0.001, label: 'range' },
      depthThreshold: { value: DEFAULTS.depthThreshold, min: 0, max: 1, step: 0.01, label: 'threshold' },
    }),
    NormalEdge: folder({
      normalMax: { value: DEFAULTS.normalMax, min: 0.1, max: 3, step: 0.05, label: 'range' },
      normalThreshold: { value: DEFAULTS.normalThreshold, min: 0, max: 1, step: 0.01, label: 'threshold' },
    }),
    Look: folder({
      toonSteps: { value: DEFAULTS.toonSteps, min: 2, max: 8, step: 1, label: 'toon steps' },
      sketch: { value: DEFAULTS.sketch, min: 0, max: 1.6, step: 0.05, label: 'sketch' },
      spin: { value: DEFAULTS.spin, min: 0, max: 1, step: 0.02 },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 1.6, 9.2], fov: 38 }} dpr={[1, 2]}>
      <Island params={params} />
      <OutlineRenderer params={params} />
      <OrbitControls enablePan={false} minDistance={4.5} maxDistance={18} target={[0, 0, 0]} />
    </Canvas>
  )
}
