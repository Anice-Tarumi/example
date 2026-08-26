import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useFBO } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import Subject from './scene'
import { buildLut, LUT_NAMES, LUT_SIZE } from './lut'
import {
  quadVertexShader,
  brightFragmentShader,
  downFragmentShader,
  blurFragmentShader,
  upsampleFragmentShader,
  compositeFragmentShader,
} from './glsl/passes'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

const LEVELS = 4

/** 段の解像度。i 段目は 1/2^(i+1) */
function levelSize(width, height, i) {
  const d = 2 ** (i + 1)
  return [Math.max(2, Math.floor(width / d)), Math.max(2, Math.floor(height / d))]
}

function Pipeline({ params }) {
  const { size } = useThree()

  const hdrOpts = useMemo(
    () => ({
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  )

  // シーンだけ深度が要る
  const sceneRT = useFBO(size.width, size.height, { ...hdrOpts, depthBuffer: true })

  // useFBO はフック。段数は定数なので展開して呼ぶ
  const [w0, h0] = levelSize(size.width, size.height, 0)
  const [w1, h1] = levelSize(size.width, size.height, 1)
  const [w2, h2] = levelSize(size.width, size.height, 2)
  const [w3, h3] = levelSize(size.width, size.height, 3)

  const l0 = useFBO(w0, h0, hdrOpts)
  const l1 = useFBO(w1, h1, hdrOpts)
  const l2 = useFBO(w2, h2, hdrOpts)
  const l3 = useFBO(w3, h3, hdrOpts)
  const t0 = useFBO(w0, h0, hdrOpts)
  const t1 = useFBO(w1, h1, hdrOpts)
  const t2 = useFBO(w2, h2, hdrOpts)
  const t3 = useFBO(w3, h3, hdrOpts)

  const levels = useMemo(() => [l0, l1, l2, l3], [l0, l1, l2, l3])
  const temps = useMemo(() => [t0, t1, t2, t3], [t0, t1, t2, t3])

  const [uniforms] = useState(() => ({
    bright: {
      tScene: { value: null },
      uThreshold: { value: DEFAULTS.threshold },
      uKnee: { value: DEFAULTS.knee },
      uClamp: { value: 24 },
    },
    down: {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
    },
    blur: {
      tSrc: { value: null },
      uDir: { value: new THREE.Vector2() },
      uScale: { value: DEFAULTS.spread },
    },
    up: {
      tSrc: { value: null },
      tPrev: { value: null },
      uPrevWeight: { value: DEFAULTS.falloff },
      uWeight: { value: 1 },
    },
    composite: {
      tScene: { value: null },
      tBloom: { value: null },
      tGhostSrc: { value: null },
      tLut: { value: null },
      uBloomStrength: { value: DEFAULTS.strength },
      uBloomNorm: { value: 1 },
      uExposure: { value: DEFAULTS.exposure },
      uGhostSpacing: { value: DEFAULTS.ghostSpacing },
      uGhostStrength: { value: DEFAULTS.ghostStrength },
      uHaloRadius: { value: DEFAULTS.haloRadius },
      uHaloStrength: { value: DEFAULTS.haloStrength },
      uChroma: { value: DEFAULTS.chroma },
      uVignette: { value: DEFAULTS.vignette },
      uGrain: { value: DEFAULTS.grain },
      uLutMix: { value: DEFAULTS.lutMix },
      uLutSize: { value: LUT_SIZE },
      uTime: { value: 0 },
      uAspect: { value: new THREE.Vector2(1, 1) },
    },
  }))

  const quads = useMemo(() => {
    const make = (fragmentShader, u, glsl3) =>
      new FullScreenQuad(
        new THREE.ShaderMaterial({
          vertexShader: quadVertexShader,
          fragmentShader,
          uniforms: u,
          depthTest: false,
          depthWrite: false,
          ...(glsl3 ? { glslVersion: THREE.GLSL3 } : null),
        }),
      )

    return {
      bright: make(brightFragmentShader, uniforms.bright),
      down: make(downFragmentShader, uniforms.down),
      blur: make(blurFragmentShader, uniforms.blur),
      up: make(upsampleFragmentShader, uniforms.up),
      composite: make(compositeFragmentShader, uniforms.composite, true),
    }
  }, [uniforms])

  useEffect(
    () => () => {
      Object.values(quads).forEach((q) => {
        q.material.dispose()
        q.dispose()
      })
    },
    [quads],
  )

  // LUT はグレードを変えたときだけ焼き直す
  const lut = useMemo(() => buildLut(params.lut), [params.lut])
  useEffect(() => () => lut.dispose(), [lut])

  useEffect(() => {
    const c = uniforms.composite
    c.tLut.value = lut
    uniforms.bright.uThreshold.value = params.threshold
    uniforms.bright.uKnee.value = params.knee
    uniforms.blur.uScale.value = params.spread
    uniforms.up.uPrevWeight.value = params.falloff
    c.uBloomStrength.value = params.strength
    // temps[0] = Σ level_i * falloff^i。その重みの総和
    let norm = 0
    for (let i = 0, f = 1; i < LEVELS; i++, f *= params.falloff) norm += f
    c.uBloomNorm.value = Math.max(norm, 1e-3)
    c.uExposure.value = params.exposure
    c.uGhostSpacing.value = params.ghostSpacing
    c.uGhostStrength.value = params.ghostStrength
    c.uHaloRadius.value = params.haloRadius
    c.uHaloStrength.value = params.haloStrength
    c.uChroma.value = params.chroma
    c.uVignette.value = params.vignette
    c.uGrain.value = params.grain
    c.uLutMix.value = params.lutMix
  }, [uniforms, params, lut])

  const blurTo = (gl, src, dst, dirX, dirY, texelW, texelH) => {
    uniforms.blur.tSrc.value = src.texture
    uniforms.blur.uDir.value.set(dirX / texelW, dirY / texelH)
    gl.setRenderTarget(dst)
    quads.blur.render(gl)
  }

  useFrame(({ gl, scene, camera, clock }) => {
    // 1. シーンを HDR の RT に描く。ここに 1 超の値が残る
    gl.setRenderTarget(sceneRT)
    gl.clear()
    gl.render(scene, camera)

    // 2. 明るい部分を抜きつつ 1/2 へ
    uniforms.bright.tScene.value = sceneRT.texture
    gl.setRenderTarget(levels[0])
    quads.bright.render(gl)

    // 3. ミップチェーン。段ごとに縮めてから分離ガウス
    for (let i = 1; i < LEVELS; i++) {
      const prev = levels[i - 1]
      uniforms.down.tSrc.value = prev.texture
      uniforms.down.uTexel.value.set(0.5 / prev.width, 0.5 / prev.height)
      gl.setRenderTarget(levels[i])
      quads.down.render(gl)
    }

    for (let i = 0; i < LEVELS; i++) {
      const lv = levels[i]
      blurTo(gl, lv, temps[i], 1, 0, lv.width, lv.height)
      blurTo(gl, temps[i], lv, 0, 1, lv.width, lv.height)
    }

    // 4. 小さい段から順に足し上げる。temps はブラー用の役目を終えたので使い回す
    uniforms.up.tSrc.value = levels[LEVELS - 1].texture
    uniforms.up.tPrev.value = levels[LEVELS - 1].texture
    uniforms.up.uPrevWeight.value = 0
    gl.setRenderTarget(temps[LEVELS - 1])
    quads.up.render(gl)

    for (let i = LEVELS - 2; i >= 0; i--) {
      uniforms.up.tSrc.value = levels[i].texture
      uniforms.up.tPrev.value = temps[i + 1].texture
      uniforms.up.uPrevWeight.value = params.falloff
      gl.setRenderTarget(temps[i])
      quads.up.render(gl)
    }

    // 5. 合成。ここだけ画面に描く
    const c = uniforms.composite
    c.tScene.value = sceneRT.texture
    c.tBloom.value = temps[0].texture
    // ゴーストは 1/2 段だけを見る（理由は composite シェーダーのコメント）
    c.tGhostSrc.value = levels[0].texture
    c.uTime.value = clock.elapsedTime
    c.uAspect.value.set(size.width / size.height, 1)

    gl.setRenderTarget(null)
    quads.composite.render(gl)
  }, 1)

  return null
}

export default function PostprocessStack() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Bloom: folder({
      threshold: { value: DEFAULTS.threshold, min: 0, max: 4, step: 0.01 },
      knee: { value: DEFAULTS.knee, min: 0, max: 1, step: 0.01 },
      strength: { value: DEFAULTS.strength, min: 0, max: 2.5, step: 0.01 },
      spread: { value: DEFAULTS.spread, min: 0.2, max: 3, step: 0.05 },
      falloff: { value: DEFAULTS.falloff, min: 0, max: 1.4, step: 0.02 },
    }),
    Lens: folder({
      ghostSpacing: { value: DEFAULTS.ghostSpacing, min: 0.05, max: 0.8, step: 0.01, label: 'spacing' },
      ghostStrength: { value: DEFAULTS.ghostStrength, min: 0, max: 2, step: 0.02, label: 'ghosts' },
      haloRadius: { value: DEFAULTS.haloRadius, min: 0, max: 0.9, step: 0.01, label: 'halo r' },
      haloStrength: { value: DEFAULTS.haloStrength, min: 0, max: 3, step: 0.02, label: 'halo' },
      chroma: { value: DEFAULTS.chroma, min: 0, max: 3, step: 0.02 },
    }),
    Grade: folder({
      lut: { value: DEFAULTS.lut, options: LUT_NAMES },
      lutMix: { value: DEFAULTS.lutMix, min: 0, max: 1, step: 0.01, label: 'mix' },
      exposure: { value: DEFAULTS.exposure, min: 0.2, max: 2.5, step: 0.01 },
      vignette: { value: DEFAULTS.vignette, min: 0, max: 1, step: 0.01 },
      grain: { value: DEFAULTS.grain, min: 0, max: 0.15, step: 0.005 },
    }),
    Subject: folder({
      coreColor: { value: DEFAULTS.coreColor, label: 'core' },
      coreIntensity: { value: DEFAULTS.coreIntensity, min: 0.5, max: 14, step: 0.1, label: 'core int' },
      ringColor: { value: DEFAULTS.ringColor, label: 'ring' },
      ringIntensity: { value: DEFAULTS.ringIntensity, min: 0.5, max: 14, step: 0.1, label: 'ring int' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 1.1, 4.6], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#05070b']} />
      <Subject
        coreColor={params.coreColor}
        coreIntensity={params.coreIntensity}
        ringColor={params.ringColor}
        ringIntensity={params.ringIntensity}
      />
      <Pipeline params={params} />
      <OrbitControls enablePan={false} minDistance={2.2} maxDistance={12} target={[0, 0, 0]} />
    </Canvas>
  )
}
