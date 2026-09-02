import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bakeGlyphs, COLON_INDEX } from './bake'
import { pointsVertexShader, pointsFragmentShader } from './glsl/vat'
import {
  spaceVertexShader, spaceFragmentShader,
  dustVertexShader, dustFragmentShader,
} from './glsl/space'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/*
 * 桁とコロンを同じ仕組みで並べる。
 * コロンだけ別の物体にすると、粒の質感が揃わず貼り付けたように見える。
 */
const KINDS = ['d', 'd', 'c', 'd', 'd', 'c', 'd', 'd']
const SLOTS = KINDS.length
/** コロンは面積が小さいので、同じ密度だと白い塊になる */
const COLON_RATIO = 0.12
const two = (n) => String(n).padStart(2, '0')

/**
 * 粒が数字から数字へ直接寄る時計。
 *
 * 焼いてあるのは 10 個の到達点だけで、経過は頂点シェーダーが作る。
 * 経過まで焼くと「散った状態 → その数字」しか再生できず、桁が変わるたびに
 * 一度バラバラになってしまう。
 */
function Digits({ params, zoom }) {
  const pieces = Math.round(params.pieces)
  const baked = useMemo(() => bakeGlyphs(pieces), [pieces])
  useEffect(() => () => baked.texture.dispose(), [baked])

  const geometry = useMemo(() => {
    // 桁は全粒、コロンは間引く。面積が違うので同じ数だと密度が揃わない
    const counts = KINDS.map((k) => (k === 'c' ? Math.max(80, Math.round(pieces * COLON_RATIO)) : pieces))
    const n = counts.reduce((a, b) => a + b, 0)

    const geo = new THREE.BufferGeometry()
    // 位置は頂点シェーダーが決めるので、中身は使わない
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const piece = new Float32Array(n)
    const slot = new Float32Array(n)
    let k = 0
    for (let s = 0; s < SLOTS; s++) {
      for (let p = 0; p < counts[s]; p++, k++) {
        piece[k] = p
        slot[k] = s
      }
    }
    geo.setAttribute('aPiece', new THREE.BufferAttribute(piece, 1))
    geo.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1))
    // 頂点が動くので、three が計算した範囲は当てにならない
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200)
    return geo
  }, [pieces])
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      tPos: { value: baked.texture },
      uTexSize: { value: new THREE.Vector2(baked.width, baked.height) },
      uRowsPerGlyph: { value: baked.rowsPerGlyph },
      uFrom: { value: new Float32Array(8) },
      uTo: { value: new Float32Array(8) },
      uMix: { value: new Float32Array(8) },
      uSlotX: { value: new Float32Array(8) },
      uScale: { value: DEFAULTS.scale },
      uSize: { value: DEFAULTS.dot },
      uZoom: { value: 40 },
      uTime: { value: 0 },
      uDrift: { value: DEFAULTS.drift },
      uWarp: { value: DEFAULTS.warp },
      uSwirl: { value: DEFAULTS.swirl },
      uArc: { value: DEFAULTS.arc },
      uLag: { value: DEFAULTS.lag },
      uColor: { value: new THREE.Color(DEFAULTS.color) },
    }),
    [baked],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: pointsVertexShader,
        fragmentShader: pointsFragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  /** 桁ごとに「どの字から / どの字へ / どこまで進んだか」だけ持つ */
  const slots = useRef(
    KINDS.map((k) => (k === 'c'
      ? { from: COLON_INDEX, to: COLON_INDEX, mix: 1 }
      : { from: 0, to: 0, mix: 1 })),
  )

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const now = new Date()
    const text = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`

    // 桁の並び。コロンは幅を詰める
    let x = 0
    let digit = 0
    for (let i = 0; i < SLOTS; i++) {
      const s = slots.current[i]
      const wide = KINDS[i] !== 'c'

      if (wide) {
        const want = Number(text[digit++])
        // 混ぜ終わっている桁だけ、次の字へ向かわせる
        if (s.mix >= 1 && want !== s.to) {
          s.from = s.to
          s.to = want
          s.mix = 0
        }
        if (s.mix < 1) s.mix = Math.min(1, s.mix + dt / Math.max(0.05, params.swapTime))
      }

      uniforms.uFrom.value[i] = s.from
      uniforms.uTo.value[i] = s.to
      uniforms.uMix.value[i] = s.mix

      const w = wide ? params.pitch * 4.1 : params.colonGap + params.pitch * 1.1 // slotWidth と同じ式
      uniforms.uSlotX.value[i] = x + w / 2
      x += w
    }

    /*
     * 桁の間隔を足したあとに**まとめて中央へ寄せる**。
     * 並べながら中央を推測すると、間隔を変えるたびにずれる。
     */
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < SLOTS; i++) {
      lo = Math.min(lo, uniforms.uSlotX.value[i])
      hi = Math.max(hi, uniforms.uSlotX.value[i])
    }
    const mid = (lo + hi) / 2
    for (let i = 0; i < SLOTS; i++) uniforms.uSlotX.value[i] -= mid

    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uScale.value = params.scale
    uniforms.uSize.value = params.dot
    uniforms.uZoom.value = zoom
    uniforms.uDrift.value = params.drift
    uniforms.uWarp.value = params.warp
    uniforms.uSwirl.value = params.swirl
    uniforms.uArc.value = params.arc
    uniforms.uLag.value = params.lag
    uniforms.uColor.value.set(params.color)
  })

  return (
    <points geometry={geometry} material={material} frustumCulled={false} />
  )
}

/**
 * 背景の宇宙。板 1 枚を画面いっぱいに置き、絵として描く。
 *
 * 深度は書かない。**必ず最初に描く**。あとから描くと字を塗り潰す。
 */
function Space({ params }) {
  const size = useThree((s) => s.size)

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uDeep: { value: new THREE.Color(DEFAULTS.deep) },
    uNebulaA: { value: new THREE.Color(DEFAULTS.nebulaA) },
    uNebulaB: { value: new THREE.Color(DEFAULTS.nebulaB) },
    uRay: { value: new THREE.Color(DEFAULTS.rayColor) },
    uNebula: { value: DEFAULTS.nebula },
    uStars: { value: DEFAULTS.stars },
    uRayGain: { value: DEFAULTS.rayGain },
    uRayWidth: { value: DEFAULTS.rayWidth },
  }), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: spaceVertexShader,
    fragmentShader: spaceFragmentShader,
    uniforms,
    depthWrite: false,
    depthTest: false,
  }), [uniforms])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uAspect.value = size.width / Math.max(1, size.height)
    uniforms.uNebula.value = params.nebula
    uniforms.uStars.value = params.stars
    uniforms.uRayGain.value = params.rayGain
    uniforms.uRayWidth.value = params.rayWidth
    uniforms.uDeep.value.set(params.deep)
    uniforms.uNebulaA.value.set(params.nebulaA)
    uniforms.uNebulaB.value.set(params.nebulaB)
    uniforms.uRay.value.set(params.rayColor)
  })

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-100}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

/** 字より手前と奥を漂う塵。背景は絵なので、奥行きはこれで出す */
function Dust({ params, zoom }) {
  const count = Math.round(params.dust)

  const geometry = useMemo(() => {
    const seed = new Float32Array(count * 3)
    let s = 0x9e37
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < count; i++) {
      seed[i * 3] = rand()                    // x は 0..1。シェーダー側で巻き戻す
      seed[i * 3 + 1] = rand() - 0.5
      seed[i * 3 + 2] = rand() * 2 - 1
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400)
    return geo
  }, [count])
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uZoom: { value: 40 },
    uSpread: { value: 60 },
    uSpeed: { value: DEFAULTS.dustSpeed },
    uColor: { value: new THREE.Color(DEFAULTS.color) },
  }), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: dustVertexShader,
    fragmentShader: dustFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [uniforms])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uZoom.value = zoom
    uniforms.uSpeed.value = params.dustSpeed
    uniforms.uColor.value.set(params.color)
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-50} />
}

/** 右上の leva が覆う幅。時計の桁がこの下に隠れると時刻が読めない */
const PANEL_PX = 300

function Rig({ scale, span, onZoom }) {
  const camera = useThree((s) => s.camera)
  const viewport = useThree((s) => s.size)
  useEffect(() => {
    // 漂いとゆがみで字は焼いた枠より外へ出る。その分を余白に足す
    const w = (span + 4) * scale
    const h = 13 * scale
    /*
     * 幅を詰めるだけでは足りない。中央に置いたままだと、縮めても
     * **右端は leva の下に入り続ける**。覆われる幅を除いて合わせ、
     * 残った領域の真ん中へ寄せる。
     */
    const panel = viewport.width > 900 ? PANEL_PX : 0
    const usable = Math.max(200, viewport.width - panel)
    const zoom = Math.min(usable / w, viewport.height / h) * 0.92
    camera.zoom = zoom
    const shift = panel / 2 / zoom
    camera.position.set(shift, 0, 40)
    // 原点を向かせない。向けるとカメラが傾いて、ずらしたぶんが打ち消される
    camera.lookAt(shift, 0, 0)
    camera.updateProjectionMatrix()
    onZoom(zoom)
  }, [camera, scale, span, viewport.width, viewport.height, onZoom])
  return null
}

export default function VatClock() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const zoom = useRef(40)
  // 並びの実寸。桁とコロンで幅が違うので、式を 1 か所に持つ
  const slotWidth = (kind, p) => (kind === 'c' ? p.colonGap + p.pitch * 1.1 : p.pitch * 4.1)

  const [params, setParams] = useControls(() => ({
    Cloud: folder({
      pieces: { value: DEFAULTS.pieces, min: 1000, max: 40000, step: 1000, label: 'particles' },
      dot: { value: DEFAULTS.dot, min: 0.3, max: 4, step: 0.1, label: 'dot size' },
      drift: { value: DEFAULTS.drift, min: 0, max: 0.4, step: 0.005, label: 'idle drift' },
      swirl: { value: DEFAULTS.swirl, min: 0, max: 0.3, step: 0.005 },
      warp: { value: DEFAULTS.warp, min: 0, max: 0.8, step: 0.01, label: 'space warp' },
    }),
    Morph: folder({
      swapTime: { value: DEFAULTS.swapTime, min: 0.1, max: 2, step: 0.05, label: 'morph (s)' },
      arc: { value: DEFAULTS.arc, min: 0, max: 2.5, step: 0.05, label: 'bulge' },
      lag: { value: DEFAULTS.lag, min: 0, max: 0.9, step: 0.02, label: 'stagger' },
    }),
    Layout: folder({
      scale: { value: DEFAULTS.scale, min: 0.3, max: 1.6, step: 0.02 },
      pitch: { value: DEFAULTS.pitch, min: 0.7, max: 1.6, step: 0.02, label: 'digit gap' },
      colonGap: { value: DEFAULTS.colonGap, min: 0, max: 4, step: 0.1, label: 'colon gap' },
    }),
    Space: folder({
      nebula: { value: DEFAULTS.nebula, min: 0, max: 1.5, step: 0.02 },
      stars: { value: DEFAULTS.stars, min: 0, max: 1.5, step: 0.02 },
      rayGain: { value: DEFAULTS.rayGain, min: 0, max: 0.8, step: 0.01, label: 'rays' },
      rayWidth: { value: DEFAULTS.rayWidth, min: 0.01, max: 0.3, step: 0.005, label: 'ray width' },
      dust: { value: DEFAULTS.dust, min: 0, max: 4000, step: 100 },
      dustSpeed: { value: DEFAULTS.dustSpeed, min: 0, max: 3, step: 0.05, label: 'dust flow' },
    }),
    Look: folder({
      color: { value: DEFAULTS.color },
      deep: { value: DEFAULTS.deep, label: 'void' },
      nebulaA: { value: DEFAULTS.nebulaA, label: 'nebula 1' },
      nebulaB: { value: DEFAULTS.nebulaB, label: 'nebula 2' },
      rayColor: { value: DEFAULTS.rayColor, label: 'ray tint' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  const span = KINDS.reduce((a, k) => a + slotWidth(k, params), 0)

  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 40], zoom: 40, near: -200, far: 400 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[params.deep]} />
      <Space params={params} />
      <Dust params={params} zoom={zoom.current} />
      <Digits params={params} zoom={zoom.current} />
      <Rig scale={params.scale} span={span} onZoom={(z) => { zoom.current = z }} />
    </Canvas>
  )
}
