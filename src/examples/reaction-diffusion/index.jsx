import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { button, useControls } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import {
  quadVertexShader,
  seedFragmentShader,
  stepFragmentShader,
  displayVertexShader,
  displayFragmentShader,
} from './glsl/rd'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/**
 * 反応拡散（Gray–Scott）。
 *
 * 触ると種が置かれ、模様が勝手に育っていく。**描いた物がそのまま残るの
 * ではなく、描いた所から生えてくる**のが面白さの本体。
 *
 * 計算は 2 枚の的を入れ替えながら 1 フレームに十数回進める。1 回だけだと
 * 模様の成長が遅すぎて、触っても何も起きないように見える。
 */

/** 計算格子の長辺。細かくすると模様が小さくなり、重くなる */
const SIM_LONG = 512

function Sim({ params, seedKey }) {
  const { gl, size, viewport } = useThree()
  const aspect = size.width / Math.max(1, size.height)
  const simW = aspect >= 1 ? SIM_LONG : Math.round(SIM_LONG * aspect)
  const simH = aspect >= 1 ? Math.round(SIM_LONG / aspect) : SIM_LONG

  /*
   * 状態は浮動小数で持つ。**8bit では解けない。** 1 回の変化量が
   * 1/255 より小さいので、丸めで増減が消えて模様が育たない。
   */
  const opts = useMemo(() => ({
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  }), [])
  const a = useFBO(simW, simH, opts)
  const b = useFBO(simW, simH, opts)
  // 端は巻き戻す。壁にすると縁だけ模様の育ち方が変わる
  for (const t of [a, b]) {
    t.texture.wrapS = THREE.RepeatWrapping
    t.texture.wrapT = THREE.RepeatWrapping
  }

  const aspectVec = useMemo(() => new THREE.Vector2(1, 1), [])
  aspectVec.set(simW / simH, 1)

  const seedUniforms = useMemo(() => ({ uAspect: { value: aspectVec }, uSeed: { value: 0 }, uDense: { value: 0 } }), [aspectVec])
  const seedQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVertexShader, fragmentShader: seedFragmentShader, uniforms: seedUniforms,
  })), [seedUniforms])

  const stepUniforms = useMemo(() => ({
    tState: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uAspect: { value: aspectVec },
    uFeed: { value: DEFAULTS.feed },
    uKill: { value: DEFAULTS.kill },
    uDa: { value: 1.0 },
    uDb: { value: 0.5 },
    uDt: { value: 1.0 },
    uMap: { value: 0 },
    uBrush: { value: new THREE.Vector3() },
    uBrushR: { value: DEFAULTS.brush },
  }), [aspectVec])
  const stepQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVertexShader, fragmentShader: stepFragmentShader, uniforms: stepUniforms,
  })), [stepUniforms])

  const displayUniforms = useMemo(() => ({
    tState: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uHeight: { value: DEFAULTS.height },
    uLow: { value: new THREE.Color(DEFAULTS.low) },
    uHigh: { value: new THREE.Color(DEFAULTS.high) },
    uLightDir: { value: new THREE.Vector3(-0.5, 0.6, 0.65) },
    uSpec: { value: DEFAULTS.spec },
  }), [])
  const displayMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: displayVertexShader, fragmentShader: displayFragmentShader, uniforms: displayUniforms,
  }), [displayUniforms])

  useEffect(() => () => {
    seedQuad.dispose(); stepQuad.dispose(); displayMat.dispose()
  }, [seedQuad, stepQuad, displayMat])

  const flip = useRef(false)
  const seeded = useRef('')
  const brush = useRef({ x: 0, y: 0, down: false })

  useFrame(() => {
    const key = `${simW}x${simH}:${seedKey}:${params.map}`
    /*
     * 大きさが変わったら撒き直す。**的を作り直すと中身は消える**ので、
     * 何もしないと真っ白な画面のまま何も育たない。
     */
    if (seeded.current !== key) {
      seedUniforms.uSeed.value = Math.random() * 100
      seedUniforms.uDense.value = params.map ? 1 : 0
      for (const t of [a, b]) {
        gl.setRenderTarget(t)
        seedQuad.render(gl)
      }
      gl.setRenderTarget(null)
      seeded.current = key
    }

    stepUniforms.uTexel.value.set(1 / simW, 1 / simH)
    stepUniforms.uFeed.value = params.feed
    stepUniforms.uKill.value = params.kill
    stepUniforms.uMap.value = params.map ? 1 : 0
    stepUniforms.uBrushR.value = params.brush
    const br = brush.current
    stepUniforms.uBrush.value.set(br.x, br.y, br.down ? 1 : 0)

    for (let i = 0; i < params.steps; i++) {
      const read = flip.current ? b : a
      const write = flip.current ? a : b
      stepUniforms.tState.value = read.texture
      gl.setRenderTarget(write)
      stepQuad.render(gl)
      flip.current = !flip.current
    }
    gl.setRenderTarget(null)

    displayUniforms.tState.value = (flip.current ? b : a).texture
    displayUniforms.uTexel.value.set(1 / simW, 1 / simH)
    displayUniforms.uHeight.value = params.height
    displayUniforms.uLow.value.set(params.low)
    displayUniforms.uHigh.value.set(params.high)
    displayUniforms.uSpec.value = params.spec
  })

  const onMove = (e) => {
    if (!e.uv) return
    brush.current.x = e.uv.x
    brush.current.y = e.uv.y
  }

  return (
    <mesh
      scale={[viewport.width, viewport.height, 1]}
      material={displayMat}
      onPointerMove={onMove}
      onPointerDown={(e) => { onMove(e); brush.current.down = true }}
      onPointerUp={() => { brush.current.down = false }}
      onPointerLeave={() => { brush.current.down = false }}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

export default function ReactionDiffusion() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  // 撒き直しの合図。値そのものに意味は無く、変わったことだけを伝える
  const [seedKey, setSeedKey] = useState(0)

  const [params, setParams] = useControls(() => ({
    /*
     * **step を粗くしない。** leva は min から step 刻みへ値を丸めるので、
     * 0.0005 刻みだと Mitosis の 0.0649 が 0.065 に、0.0367 が 0.0365 に
     * 化けた。この係数は境目にあって、それだけで模様が全滅する。
     * pad は表示桁。既定では 2 桁に丸めて 0.0545 が 0.05 と出る。
     */
    feed: { value: DEFAULTS.feed, min: 0.01, max: 0.1, step: 0.0001, pad: 4 },
    kill: { value: DEFAULTS.kill, min: 0.045, max: 0.07, step: 0.0001, pad: 4 },
    map: { value: DEFAULTS.map, label: 'parameter map' },
    steps: { value: DEFAULTS.steps, min: 1, max: 30, step: 1, label: 'steps / frame' },
    brush: { value: DEFAULTS.brush, min: 0.005, max: 0.08, step: 0.001 },
    height: { value: DEFAULTS.height, min: 0, max: 16, step: 0.1, label: 'relief' },
    spec: { value: DEFAULTS.spec, min: 0, max: 2, step: 0.05, label: 'gloss' },
    low: DEFAULTS.low,
    high: DEFAULTS.high,
    reset: button(() => setSeedKey((k) => k + 1)),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (!preset) return
    setParams(preset.params)
    // 模様が変わったら撒き直す。前の模様の上で係数だけ変えると、
    // 移り変わりの途中の中途半端な絵が長く続く
    setSeedKey((k) => k + 1)
  }, [variant, setParams])

  return (
    <Canvas orthographic camera={{ position: [0, 0, 5], zoom: 1 }} dpr={[1, 2]}>
      <Sim params={params} seedKey={seedKey} />
    </Canvas>
  )
}
