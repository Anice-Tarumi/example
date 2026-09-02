import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bakeGlyphs, COLON_INDEX } from './bake'
import { pointsVertexShader, pointsFragmentShader } from './glsl/vat'
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

      const w = wide ? params.pitch * 5.2 : params.colonGap + params.pitch * 1.6 // slotWidth と同じ式
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
    uniforms.uArc.value = params.arc
    uniforms.uLag.value = params.lag
    uniforms.uColor.value.set(params.color)
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

function Rig({ scale, span, onZoom }) {
  const camera = useThree((s) => s.camera)
  const viewport = useThree((s) => s.size)
  useEffect(() => {
    const w = (span + 2) * scale
    const h = 13 * scale
    // 右端は leva に覆われるので、余白を多めに取る
    const zoom = Math.min(viewport.width / w, viewport.height / h) * 0.7
    camera.zoom = zoom
    camera.position.set(0, 0, 40)
    camera.lookAt(0, 0, 0)
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
  const slotWidth = (kind, p) => (kind === 'c' ? p.colonGap + p.pitch * 1.6 : p.pitch * 5.2)

  const [params, setParams] = useControls(() => ({
    Cloud: folder({
      pieces: { value: DEFAULTS.pieces, min: 1000, max: 40000, step: 1000, label: 'particles' },
      dot: { value: DEFAULTS.dot, min: 0.3, max: 4, step: 0.1, label: 'dot size' },
      drift: { value: DEFAULTS.drift, min: 0, max: 0.3, step: 0.005, label: 'idle drift' },
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
    Look: folder({
      color: { value: DEFAULTS.color },
      background: { value: DEFAULTS.background, label: 'bg' },
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
      <color attach="background" args={[params.background]} />
      <Digits params={params} zoom={zoom.current} />
      <Rig scale={params.scale} span={span} onZoom={(z) => { zoom.current = z }} />
    </Canvas>
  )
}
