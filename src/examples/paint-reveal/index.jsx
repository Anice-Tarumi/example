import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import {
  quadVertexShader,
  paintFragmentShader,
  fillFragmentShader,
  blurFragmentShader,
} from './glsl/paint'
import { renderFragmentShader } from './glsl/render'
import { getArtwork, ARTWORK_ASPECT } from './artwork'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, MODES } from './presets'

// 速度場は画面の 1/4、ぼかし用はさらに半分。元実装と同じ比率
const PAINT_DIV = 4
const LOW_DIV = 8

function makeQuad(fragmentShader, uniforms) {
  return new FullScreenQuad(
    new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    }),
  )
}

function PaintStage({ params }) {
  const size = useThree((s) => s.size)
  const artwork = useMemo(() => getArtwork(), [])

  const pw = Math.max(2, Math.floor(size.width / PAINT_DIV))
  const ph = Math.max(2, Math.floor(size.height / PAINT_DIV))
  const lw = Math.max(2, Math.floor(size.width / LOW_DIV))
  const lh = Math.max(2, Math.floor(size.height / LOW_DIV))

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

  const paintA = useFBO(pw, ph, fboOpts)
  const paintB = useFBO(pw, ph, fboOpts)
  const fillA = useFBO(pw, ph, fboOpts)
  const fillB = useFBO(pw, ph, fboOpts)
  const lowA = useFBO(lw, lh, fboOpts)
  const lowB = useFBO(lw, lh, fboOpts)

  const [uniforms] = useState(() => ({
    paint: {
      u_lowPaintTexture: { value: null },
      u_prevPaintTexture: { value: null },
      u_paintTexelSize: { value: new THREE.Vector2() },
      u_drawFrom: { value: new THREE.Vector4() },
      u_drawTo: { value: new THREE.Vector4() },
      u_pushStrength: { value: DEFAULTS.pushStrength },
      u_dissipations: { value: new THREE.Vector3() },
      u_vel: { value: new THREE.Vector2() },
      u_curlScale: { value: DEFAULTS.curlScale },
      u_curlStrength: { value: DEFAULTS.curlStrength },
    },
    fill: {
      u_prevTexture: { value: null },
      u_screenPaintTexture: { value: null },
      u_fadeIntensity: { value: DEFAULTS.fadeIntensity },
      u_paintIntensity: { value: DEFAULTS.paintIntensity },
      u_distortAmount: { value: DEFAULTS.distortAmount },
    },
    blur: {
      u_texture: { value: null },
      u_delta: { value: new THREE.Vector2() },
    },
    render: {
      u_artwork: { value: null },
      u_maskTexture: { value: null },
      u_maskTextureSize: { value: new THREE.Vector2() },
      u_artworkScale: { value: new THREE.Vector2(1, 1) },
      u_time: { value: 0 },
      u_displace: { value: DEFAULTS.displace },
      u_desaturation: { value: DEFAULTS.desaturation },
      u_overlayBoost: { value: DEFAULTS.overlayBoost },
      u_mode: { value: 0 },
    },
  }))

  const quads = useMemo(() => ({
    paint: makeQuad(paintFragmentShader, uniforms.paint),
    fill: makeQuad(fillFragmentShader, uniforms.fill),
    blur: makeQuad(blurFragmentShader, uniforms.blur),
    render: makeQuad(renderFragmentShader, uniforms.render),
  }), [uniforms])

  useEffect(() => () => {
    for (const q of Object.values(quads)) {
      q.material.dispose()
      q.dispose()
    }
  }, [quads])

  useEffect(() => {
    uniforms.render.u_artwork.value = artwork
  }, [uniforms, artwork])

  // ---- パラメータ反映 ----
  useEffect(() => {
    const p = uniforms.paint
    p.u_pushStrength.value = params.pushStrength
    p.u_dissipations.value.set(
      params.velocityDissipation,
      params.weight1Dissipation,
      params.weight2Dissipation,
    )
    p.u_curlScale.value = params.curlScale
    p.u_curlStrength.value = params.curlStrength

    const f = uniforms.fill
    f.u_fadeIntensity.value = params.fadeIntensity
    f.u_paintIntensity.value = params.paintIntensity
    f.u_distortAmount.value = params.distortAmount

    const r = uniforms.render
    r.u_displace.value = params.displace
    r.u_desaturation.value = params.desaturation
    r.u_overlayBoost.value = params.overlayBoost
    r.u_mode.value = Math.max(0, MODES.indexOf(params.mode))
  }, [uniforms, params])

  useEffect(() => {
    uniforms.paint.u_paintTexelSize.value.set(1 / pw, 1 / ph)
    uniforms.render.u_maskTextureSize.value.set(pw, ph)

    // 絵のアスペクトを保ったまま画面を覆う（cover 相当）
    const viewAspect = size.width / size.height
    if (viewAspect > ARTWORK_ASPECT) {
      uniforms.render.u_artworkScale.value.set(1, ARTWORK_ASPECT / viewAspect)
    } else {
      uniforms.render.u_artworkScale.value.set(viewAspect / ARTWORK_ASPECT, 1)
    }
  }, [uniforms, pw, ph, size])

  // ---- ポインタ ----
  const domElement = useThree((s) => s.gl.domElement)
  const pointer = useRef({ x: 0, y: 0, prevX: 0, prevY: 0, moved: false, idle: 0 })

  useEffect(() => {
    const onMove = (e) => {
      const rect = domElement.getBoundingClientRect()
      const p = pointer.current
      p.x = e.clientX - rect.left
      p.y = rect.height - (e.clientY - rect.top)
      p.moved = true
      p.idle = 0
    }
    domElement.addEventListener('pointermove', onMove)
    return () => domElement.removeEventListener('pointermove', onMove)
  }, [domElement])

  // ---- ping-pong ----
  const readPaint = useRef(paintA)
  const writePaint = useRef(paintB)
  const readFill = useRef(fillA)
  const writeFill = useRef(fillB)
  const cleared = useRef(false)

  useEffect(() => {
    readPaint.current = paintA
    writePaint.current = paintB
    readFill.current = fillA
    writeFill.current = fillB
    cleared.current = false
  }, [paintA, paintB, fillA, fillB])

  useFrame((state, delta) => {
    const { gl } = state

    if (!cleared.current) {
      const keep = gl.getClearColor(new THREE.Color()).getHex()
      const keepAlpha = gl.getClearAlpha()
      // 速度場のニュートラルは 0.5。0 で埋めると全面が最大速度として扱われる
      gl.setClearColor(0x808000, 0)
      for (const t of [paintA, paintB, lowA, lowB]) {
        gl.setRenderTarget(t)
        gl.clear(true, false, false)
      }
      gl.setClearColor(0x000000, 0)
      for (const t of [fillA, fillB]) {
        gl.setRenderTarget(t)
        gl.clear(true, false, false)
      }
      gl.setClearColor(keep, keepAlpha)
      cleared.current = true
    }

    // --- カーソルからブラシの線分と速度を作る ---
    const p = pointer.current

    // 実際のカーソルが止まっている間はリサージュ曲線で自動的に塗る。
    // 塗り跡は fadeIntensity ですぐ消えるため、放置時に何も起きていないように
    // 見えてしまうのを避ける
    p.idle += delta
    if (params.autoDemo && p.idle > 1.2) {
      // 周波数比を無理数寄りにして軌跡が閉じないようにし、画面を広く塗る
      const t = state.clock.elapsedTime * params.demoSpeed
      p.x = (0.5 + Math.sin(t * 0.53) * 0.4) * size.width
      p.y = (0.5 + Math.sin(t * 0.79 + 1.3) * 0.34) * size.height
      p.moved = true
    }

    const dist = Math.hypot(p.x - p.prevX, p.y - p.prevY)
    let radius = params.minRadius +
      (Math.min(dist, params.radiusRange) / params.radiusRange) *
      (params.maxRadius - params.minRadius)
    if (!p.moved) radius = 0
    radius = (radius / size.height) * ph

    const up = uniforms.paint
    up.u_drawFrom.value.copy(up.u_drawTo.value)
    up.u_drawTo.value.set((p.x / size.width) * pw, (p.y / size.height) * ph, radius, 1)

    const vx = up.u_drawTo.value.x - up.u_drawFrom.value.x
    const vy = up.u_drawTo.value.y - up.u_drawFrom.value.y
    up.u_vel.value
      .multiplyScalar(params.accelerationDissipation)
      .add(new THREE.Vector2(vx, vy).multiplyScalar(delta * 0.8))

    p.prevX = p.x
    p.prevY = p.y
    p.moved = false

    // --- 1. 速度場を進める ---
    up.u_prevPaintTexture.value = readPaint.current.texture
    up.u_lowPaintTexture.value = lowB.texture
    gl.setRenderTarget(writePaint.current)
    quads.paint.render(gl)

    const nextPaint = writePaint.current
    writePaint.current = readPaint.current
    readPaint.current = nextPaint

    // --- 2. 速度場をぼかす（横 → 縦） ---
    uniforms.blur.u_texture.value = nextPaint.texture
    uniforms.blur.u_delta.value.set(4 / lw, 0)
    gl.setRenderTarget(lowA)
    quads.blur.render(gl)

    uniforms.blur.u_texture.value = lowA.texture
    uniforms.blur.u_delta.value.set(0, 4 / lh)
    gl.setRenderTarget(lowB)
    quads.blur.render(gl)

    // --- 3. 速度場を絵の具マスクへ蓄積 ---
    uniforms.fill.u_prevTexture.value = readFill.current.texture
    uniforms.fill.u_screenPaintTexture.value = nextPaint.texture
    gl.setRenderTarget(writeFill.current)
    quads.fill.render(gl)

    const nextFill = writeFill.current
    writeFill.current = readFill.current
    readFill.current = nextFill

    // --- 4. 絵にマスクを適用して合成 ---
    uniforms.render.u_time.value = state.clock.elapsedTime
    uniforms.render.u_maskTexture.value = nextFill.texture
    gl.setRenderTarget(null)
    quads.render.render(gl)
  }, 1)

  return null
}

export default function PaintReveal() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    mode: { value: DEFAULTS.mode, options: MODES },
    autoDemo: { value: DEFAULTS.autoDemo, label: 'auto demo' },
    demoSpeed: {
      value: DEFAULTS.demoSpeed,
      min: 0.1,
      max: 3,
      step: 0.05,
      label: 'demo speed',
      render: (get) => get('autoDemo'),
    },
    Reveal: folder({
      desaturation: { value: DEFAULTS.desaturation, min: 0, max: 1, step: 0.01 },
      displace: { value: DEFAULTS.displace, min: 0, max: 5, step: 0.05 },
      overlayBoost: { value: DEFAULTS.overlayBoost, min: 0, max: 4, step: 0.05, label: 'overlay' },
    }),
    Brush: folder({
      minRadius: { value: DEFAULTS.minRadius, min: 0, max: 60, step: 1, label: 'min r' },
      maxRadius: { value: DEFAULTS.maxRadius, min: 10, max: 200, step: 1, label: 'max r' },
      radiusRange: { value: DEFAULTS.radiusRange, min: 10, max: 200, step: 1, label: 'dist range' },
      paintIntensity: { value: DEFAULTS.paintIntensity, min: 0, max: 2, step: 0.01, label: 'intensity' },
      fadeIntensity: { value: DEFAULTS.fadeIntensity, min: 0, max: 0.12, step: 0.001, label: 'fade' },
    }),
    Field: folder({
      pushStrength: { value: DEFAULTS.pushStrength, min: 0, max: 60, step: 0.5, label: 'push' },
      velocityDissipation: { value: DEFAULTS.velocityDissipation, min: 0.9, max: 0.999, step: 0.001, label: 'vel decay' },
      weight1Dissipation: { value: DEFAULTS.weight1Dissipation, min: 0.9, max: 0.999, step: 0.001, label: 'w1 decay' },
      weight2Dissipation: { value: DEFAULTS.weight2Dissipation, min: 0.5, max: 0.999, step: 0.001, label: 'w2 decay' },
      accelerationDissipation: { value: DEFAULTS.accelerationDissipation, min: 0.5, max: 0.99, step: 0.01, label: 'accel decay' },
      distortAmount: { value: DEFAULTS.distortAmount, min: 0, max: 0.1, step: 0.001, label: 'distort' },
    }),
    Curl: folder({
      curlScale: { value: DEFAULTS.curlScale, min: 0.005, max: 0.2, step: 0.001, label: 'scale' },
      curlStrength: { value: DEFAULTS.curlStrength, min: 0, max: 20, step: 0.1, label: 'strength' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: false }}>
      <PaintStage params={params} />
    </Canvas>
  )
}
