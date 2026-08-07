import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import {
  quadVertexShader,
  simFragmentShader,
  renderFragmentShader,
} from './shaders'
import { getTexture, TEXTURE_NAMES } from './textures'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, MODES } from './presets'

const SIM_SCALE = 0.5 // シミュレーション解像度（画面比）

function RippleStage({ params }) {
  const size = useThree((s) => s.size)

  const simW = Math.max(2, Math.floor(size.width * SIM_SCALE))
  const simH = Math.max(2, Math.floor(size.height * SIM_SCALE))
  const fboOpts = useMemo(
    () => ({
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  )
  const targetA = useFBO(simW, simH, fboOpts)
  const targetB = useFBO(simW, simH, fboOpts)

  const [uniforms] = useState(() => ({
    sim: {
      uPrev: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uAspect: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2(-10, -10) },
      uPointerForce: { value: 0 },
      uDrop: { value: new THREE.Vector2(-10, -10) },
      uDropForce: { value: 0 },
      uRadius: { value: DEFAULTS.radius },
      uDamping: { value: DEFAULTS.damping },
    },
    render: {
      uState: { value: null },
      uTexture: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uTexScale: { value: new THREE.Vector2(1, 1) },
      uRefraction: { value: DEFAULTS.refraction },
      uDispersion: { value: DEFAULTS.dispersion },
      uSpecular: { value: DEFAULTS.specular },
      uShininess: { value: DEFAULTS.shininess },
      uLightDir: { value: new THREE.Vector3(0.4, 0.6, 1.0) },
      uMode: { value: 0 },
    },
  }))

  const quads = useMemo(() => {
    const sim = new FullScreenQuad(
      new THREE.ShaderMaterial({
        vertexShader: quadVertexShader,
        fragmentShader: simFragmentShader,
        uniforms: uniforms.sim,
        depthTest: false,
        depthWrite: false,
      }),
    )
    const render = new FullScreenQuad(
      new THREE.ShaderMaterial({
        vertexShader: quadVertexShader,
        fragmentShader: renderFragmentShader,
        uniforms: uniforms.render,
        depthTest: false,
        depthWrite: false,
      }),
    )
    return { sim, render }
  }, [uniforms])

  useEffect(() => () => {
    quads.sim.material.dispose()
    quads.sim.dispose()
    quads.render.material.dispose()
    quads.render.dispose()
  }, [quads])

  // ---- パラメータ反映 ----
  useEffect(() => {
    uniforms.sim.uRadius.value = params.radius
    uniforms.sim.uDamping.value = params.damping
    uniforms.render.uRefraction.value = params.refraction
    uniforms.render.uDispersion.value = params.dispersion
    uniforms.render.uSpecular.value = params.specular
    uniforms.render.uShininess.value = params.shininess
    uniforms.render.uMode.value = Math.max(0, MODES.indexOf(params.mode))
  }, [uniforms, params])

  useEffect(() => {
    uniforms.render.uTexture.value = getTexture(params.texture)
  }, [uniforms, params.texture])

  useEffect(() => {
    const aspect = size.width / size.height
    uniforms.sim.uTexel.value.set(1 / simW, 1 / simH)
    uniforms.sim.uAspect.value.set(aspect, 1)
    uniforms.render.uTexel.value.set(1 / simW, 1 / simH)
    uniforms.render.uTexScale.value.set(
      params.texScale * (aspect > 1 ? aspect : 1),
      params.texScale * (aspect > 1 ? 1 : 1 / aspect),
    )
  }, [uniforms, size, simW, simH, params.texScale])

  // ---- ポインタ入力 ----
  const domElement = useThree((s) => s.gl.domElement)
  const pointer = useRef({ x: -10, y: -10, speed: 0, moved: false })

  useEffect(() => {
    const onMove = (e) => {
      const rect = domElement.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = 1 - (e.clientY - rect.top) / rect.height
      const p = pointer.current
      p.speed = Math.hypot(x - p.x, y - p.y)
      p.x = x
      p.y = y
      p.moved = true
    }
    const onLeave = () => { pointer.current.moved = false }

    domElement.addEventListener('pointermove', onMove)
    domElement.addEventListener('pointerleave', onLeave)
    return () => {
      domElement.removeEventListener('pointermove', onMove)
      domElement.removeEventListener('pointerleave', onLeave)
    }
  }, [domElement])

  // ---- ping-pong ----
  const readTarget = useRef(targetA)
  const writeTarget = useRef(targetB)
  const cleared = useRef(false)
  const rainTimer = useRef(0)

  useEffect(() => {
    // FBO が作り直されたら状態をリセットする
    readTarget.current = targetA
    writeTarget.current = targetB
    cleared.current = false
  }, [targetA, targetB])

  useFrame((state, delta) => {
    const { gl } = state
    const sim = uniforms.sim

    if (!cleared.current) {
      const prevClear = gl.getClearColor(new THREE.Color()).getHex()
      gl.setClearColor(0x000000, 1)
      for (const t of [targetA, targetB]) {
        gl.setRenderTarget(t)
        gl.clear(true, false, false)
      }
      gl.setClearColor(prevClear, 1)
      cleared.current = true
    }

    // ポインタは動いたフレームだけ注入する
    const p = pointer.current
    if (p.moved) {
      sim.uPointer.value.set(p.x, p.y)
      sim.uPointerForce.value = params.force * Math.min(1, 0.25 + p.speed * 14)
      p.moved = false
    } else {
      sim.uPointerForce.value = 0
    }

    // 一定間隔でランダムな雨粒を落とす
    sim.uDropForce.value = 0
    if (params.autoRain) {
      rainTimer.current -= delta
      if (rainTimer.current <= 0) {
        rainTimer.current = 1 / Math.max(params.rainRate, 0.05)
        sim.uDrop.value.set(0.1 + Math.random() * 0.8, 0.1 + Math.random() * 0.8)
        sim.uDropForce.value = params.force
      }
    }

    sim.uPrev.value = readTarget.current.texture
    gl.setRenderTarget(writeTarget.current)
    quads.sim.render(gl)

    const next = writeTarget.current
    writeTarget.current = readTarget.current
    readTarget.current = next

    uniforms.render.uState.value = next.texture
    gl.setRenderTarget(null)
    quads.render.render(gl)
  }, 1)

  return null
}

export default function RippleSimulation() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    mode: { value: DEFAULTS.mode, options: MODES },
    texture: { value: DEFAULTS.texture, options: TEXTURE_NAMES },
    Wave: folder({
      damping: { value: DEFAULTS.damping, min: 0.9, max: 0.999, step: 0.001 },
      force: { value: DEFAULTS.force, min: 0.05, max: 1.5, step: 0.01 },
      radius: { value: DEFAULTS.radius, min: 0.005, max: 0.15, step: 0.001 },
    }),
    Surface: folder({
      refraction: { value: DEFAULTS.refraction, min: 0, max: 2, step: 0.01 },
      dispersion: { value: DEFAULTS.dispersion, min: 0, max: 3, step: 0.01 },
      specular: { value: DEFAULTS.specular, min: 0, max: 3, step: 0.01 },
      shininess: { value: DEFAULTS.shininess, min: 1, max: 120, step: 1 },
      texScale: { value: DEFAULTS.texScale, min: 0.25, max: 4, step: 0.05, label: 'tex scale' },
    }),
    Rain: folder({
      autoRain: { value: DEFAULTS.autoRain, label: 'auto rain' },
      rainRate: { value: DEFAULTS.rainRate, min: 0.1, max: 8, step: 0.1, label: 'rate /s' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: false }}>
      <RippleStage params={params} />
    </Canvas>
  )
}
