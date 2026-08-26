import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { useFluidTargets } from './useFluidTargets'
import { createMaterials, disposeMaterials } from './materials'
import {
  PRESETS,
  PRESET_OPTIONS,
  DEFAULT_PRESET,
  DEFAULTS,
  MODES,
  SIM_RESOLUTIONS,
  DYE_RESOLUTIONS,
} from './presets'

const tmpColor = new THREE.Color()

function FluidStage({ params }) {
  const size = useThree((s) => s.size)
  const aspect = size.width / size.height

  const t = useFluidTargets(params.simRes, params.dyeRes, aspect)
  const materials = useMemo(() => createMaterials(), [])
  const quad = useMemo(() => new FullScreenQuad(null), [])

  useEffect(() => () => {
    disposeMaterials(materials)
    quad.dispose()
  }, [materials, quad])

  // ping-pong の現在の読み書き先
  const buf = useRef({
    velRead: t.velocityA,
    velWrite: t.velocityB,
    dyeRead: t.dyeA,
    dyeWrite: t.dyeB,
    prsRead: t.pressureA,
    prsWrite: t.pressureB,
  })
  const cleared = useRef(false)

  useEffect(() => {
    buf.current = {
      velRead: t.velocityA,
      velWrite: t.velocityB,
      dyeRead: t.dyeA,
      dyeWrite: t.dyeB,
      prsRead: t.pressureA,
      prsWrite: t.pressureB,
    }
    cleared.current = false
  }, [t])

  // texelSize は velocity 系と dye 系で違う。取り違えると移流が壊れる
  useEffect(() => {
    const simTexel = new THREE.Vector2(1 / t.sim.width, 1 / t.sim.height)
    const dyeTexel = new THREE.Vector2(1 / t.dye.width, 1 / t.dye.height)
    for (const key of ['curl', 'vorticity', 'divergence', 'clear', 'pressure', 'gradientSubtract']) {
      materials[key].uniforms.texelSize.value.copy(simTexel)
    }
    materials.advection.uniforms.texelSize.value.copy(simTexel)
    materials.splat.uniforms.texelSize.value.copy(simTexel)
    materials.display.uniforms.texelSize.value.copy(dyeTexel)
    materials.splat.uniforms.aspectRatio.value = aspect
  }, [materials, t, aspect])

  // ---- ポインタ ----
  const pointer = useRef({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false, idle: 0 })
  const domElement = useThree((s) => s.gl.domElement)

  useEffect(() => {
    const onMove = (e) => {
      const rect = domElement.getBoundingClientRect()
      const p = pointer.current
      p.x = (e.clientX - rect.left) / rect.width
      p.y = 1 - (e.clientY - rect.top) / rect.height
      p.moved = true
      p.idle = 0
    }
    domElement.addEventListener('pointermove', onMove)
    return () => domElement.removeEventListener('pointermove', onMove)
  }, [domElement])

  const hue = useRef(0)

  useFrame((state, delta) => {
    const { gl } = state
    const dt = Math.min(delta, 1 / 30)
    const b = buf.current
    const m = materials

    const blit = (target, material) => {
      quad.material = material
      gl.setRenderTarget(target)
      quad.render(gl)
    }

    if (!cleared.current) {
      const keep = gl.getClearColor(new THREE.Color()).getHex()
      gl.setClearColor(0x000000, 0)
      for (const rt of [
        t.velocityA, t.velocityB, t.dyeA, t.dyeB,
        t.curl, t.divergence, t.pressureA, t.pressureB,
      ]) {
        gl.setRenderTarget(rt)
        gl.clear(true, false, false)
      }
      gl.setClearColor(keep, 1)
      cleared.current = true
    }

    // ---- 入力の注入 ----
    const p = pointer.current
    p.idle += delta
    if (params.autoDemo && p.idle > 1.0) {
      const s = state.clock.elapsedTime * params.demoSpeed
      p.x = 0.5 + Math.sin(s * 0.53) * 0.32
      p.y = 0.5 + Math.sin(s * 0.79 + 1.1) * 0.28
      p.moved = true
    }

    if (p.moved) {
      const dx = (p.x - p.px) * params.splatForce
      const dy = (p.y - p.py) * params.splatForce

      m.splat.uniforms.point.value.set(p.x, p.y)
      m.splat.uniforms.prevPoint.value.set(p.px, p.py)
      m.splat.uniforms.radius.value = (params.splatRadius / 100) * 1.5

      // 速度を注入
      m.splat.uniforms.uTarget.value = b.velRead.texture
      m.splat.uniforms.color.value.set(dx, dy, 0)
      blit(b.velWrite, m.splat)
      ;[b.velRead, b.velWrite] = [b.velWrite, b.velRead]

      // 色を注入。時間で色相を回す
      hue.current = (hue.current + params.colorSpeed * delta) % 1
      tmpColor.setHSL(hue.current, params.saturation, 0.5)
      m.splat.uniforms.uTarget.value = b.dyeRead.texture
      // 元実装同様に薄く注入する。濃いまま入れると数フレームで飽和する
      const k = params.dyeAmount
      m.splat.uniforms.color.value.set(tmpColor.r * k, tmpColor.g * k, tmpColor.b * k)
      blit(b.dyeWrite, m.splat)
      ;[b.dyeRead, b.dyeWrite] = [b.dyeWrite, b.dyeRead]

      p.px = p.x
      p.py = p.y
      p.moved = false
    }

    // ---- curl ----
    m.curl.uniforms.uVelocity.value = b.velRead.texture
    blit(t.curl, m.curl)

    // ---- vorticity confinement ----
    m.vorticity.uniforms.uVelocity.value = b.velRead.texture
    m.vorticity.uniforms.uCurl.value = t.curl.texture
    m.vorticity.uniforms.curl.value = params.curl
    m.vorticity.uniforms.dt.value = dt
    blit(b.velWrite, m.vorticity)
    ;[b.velRead, b.velWrite] = [b.velWrite, b.velRead]

    // ---- divergence ----
    m.divergence.uniforms.uVelocity.value = b.velRead.texture
    blit(t.divergence, m.divergence)

    // ---- 前フレームの圧力を減衰させて初期値にする ----
    m.clear.uniforms.uTexture.value = b.prsRead.texture
    m.clear.uniforms.value.value = params.pressure
    blit(b.prsWrite, m.clear)
    ;[b.prsRead, b.prsWrite] = [b.prsWrite, b.prsRead]

    // ---- 圧力の Jacobi 反復 ----
    m.pressure.uniforms.uDivergence.value = t.divergence.texture
    for (let i = 0; i < params.pressureIterations; i++) {
      m.pressure.uniforms.uPressure.value = b.prsRead.texture
      blit(b.prsWrite, m.pressure)
      ;[b.prsRead, b.prsWrite] = [b.prsWrite, b.prsRead]
    }

    // ---- 圧力勾配を引いて非圧縮化 ----
    m.gradientSubtract.uniforms.uPressure.value = b.prsRead.texture
    m.gradientSubtract.uniforms.uVelocity.value = b.velRead.texture
    blit(b.velWrite, m.gradientSubtract)
    ;[b.velRead, b.velWrite] = [b.velWrite, b.velRead]

    // ---- 移流。速度は自分自身を、dye は速度場で運ばれる ----
    const simTexel = m.advection.uniforms.texelSize.value
    m.advection.uniforms.dt.value = dt
    m.advection.uniforms.uVelocity.value = b.velRead.texture
    m.advection.uniforms.uSource.value = b.velRead.texture
    m.advection.uniforms.dyeTexelSize.value.copy(simTexel)
    m.advection.uniforms.dissipation.value = params.velocityDissipation
    blit(b.velWrite, m.advection)
    ;[b.velRead, b.velWrite] = [b.velWrite, b.velRead]

    m.advection.uniforms.uVelocity.value = b.velRead.texture
    m.advection.uniforms.uSource.value = b.dyeRead.texture
    m.advection.uniforms.dyeTexelSize.value.set(1 / t.dye.width, 1 / t.dye.height)
    m.advection.uniforms.dissipation.value = params.densityDissipation
    blit(b.dyeWrite, m.advection)
    ;[b.dyeRead, b.dyeWrite] = [b.dyeWrite, b.dyeRead]

    // ---- 表示 ----
    m.display.uniforms.uTexture.value = b.dyeRead.texture
    m.display.uniforms.uVelocity.value = b.velRead.texture
    m.display.uniforms.uCurlTex.value = t.curl.texture
    m.display.uniforms.uExposure.value = params.exposure
    m.display.uniforms.uShadingAmount.value = params.shading
    m.display.uniforms.uMode.value = Math.max(0, MODES.indexOf(params.mode))
    blit(null, m.display)
  }, 1)

  return null
}

export default function FluidSolver() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    mode: { value: DEFAULTS.mode, options: MODES },
    autoDemo: { value: DEFAULTS.autoDemo, label: 'auto demo' },
    Solver: folder({
      curl: { value: DEFAULTS.curl, min: 0, max: 80, step: 1, label: 'vorticity' },
      pressure: { value: DEFAULTS.pressure, min: 0, max: 0.99, step: 0.01 },
      pressureIterations: { value: DEFAULTS.pressureIterations, min: 1, max: 40, step: 1, label: 'iterations' },
      velocityDissipation: { value: DEFAULTS.velocityDissipation, min: 0, max: 4, step: 0.01, label: 'vel decay' },
      densityDissipation: { value: DEFAULTS.densityDissipation, min: 0, max: 4, step: 0.01, label: 'dye decay' },
    }),
    Splat: folder({
      splatRadius: { value: DEFAULTS.splatRadius, min: 0.01, max: 1, step: 0.01, label: 'radius' },
      splatForce: { value: DEFAULTS.splatForce, min: 500, max: 20000, step: 100, label: 'force' },
      dyeAmount: { value: DEFAULTS.dyeAmount, min: 0.01, max: 0.6, step: 0.005, label: 'dye amount' },
      colorSpeed: { value: DEFAULTS.colorSpeed, min: 0, max: 1, step: 0.01, label: 'hue speed' },
      saturation: { value: DEFAULTS.saturation, min: 0, max: 1, step: 0.01 },
      demoSpeed: { value: DEFAULTS.demoSpeed, min: 0.1, max: 3, step: 0.05, label: 'demo speed' },
    }),
    Look: folder({
      exposure: { value: DEFAULTS.exposure, min: 0.2, max: 3, step: 0.05 },
      shading: { value: DEFAULTS.shading, min: 0, max: 1, step: 0.01 },
    }),
    Resolution: folder({
      simRes: { value: DEFAULTS.simRes, options: SIM_RESOLUTIONS, label: 'sim' },
      dyeRes: { value: DEFAULTS.dyeRes, options: DYE_RESOLUTIONS, label: 'dye' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: false }}>
      <FluidStage params={params} />
    </Canvas>
  )
}
