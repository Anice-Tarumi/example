import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createPieces, bakeShatter, SHATTER_MODES } from './bake'
import { vatVertexShader, vatFragmentShader } from './glsl/vat'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

const WALL_W = 3.4
const WALL_H = 2.2
const FPS = 30

function Shatter({ params }) {
  // 破砕の焼き込み。パラメータが変わったときだけ計算し直す
  const baked = useMemo(() => {
    const pieces = createPieces(params.cols, params.rows, WALL_W, WALL_H)
    const data = bakeShatter({ pieces, frames: params.frames, fps: FPS, mode: params.mode })
    return { pieces, ...data }
  }, [params.cols, params.rows, params.frames, params.mode])

  useEffect(() => () => {
    baked.positionTexture.dispose()
    baked.orientTexture.dispose()
  }, [baked])

  const uniforms = useMemo(
    () => ({
      tPosition: { value: null },
      tOrient: { value: null },
      uTexSize: { value: new THREE.Vector2(1, 1) },
      uFrameFrom: { value: 0 },
      uFrameTo: { value: 0 },
      uFrameRatio: { value: 0 },
      uScatter: { value: DEFAULTS.scatter },
      uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.6).normalize() },
      uColorLit: { value: new THREE.Color(DEFAULTS.colorLit) },
      uColorShadow: { value: new THREE.Color(DEFAULTS.colorShadow) },
      uColorHot: { value: new THREE.Color(DEFAULTS.colorHot) },
      uSteps: { value: DEFAULTS.steps },
    }),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vatVertexShader,
        fragmentShader: vatFragmentShader,
        uniforms,
        side: THREE.DoubleSide,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  // 破片は全部同じ箱。位置・大きさ・色だけ instance attribute で変える
  const geometry = useMemo(() => {
    const base = new THREE.BoxGeometry(1, 1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.attributes.position = base.attributes.position
    geo.attributes.normal = base.attributes.normal

    const n = baked.pieces.length
    const piece = new Float32Array(n)
    const origin = new Float32Array(n * 3)
    const size = new Float32Array(n * 3)
    const tint = new Float32Array(n * 3)

    baked.pieces.forEach((p, i) => {
      piece[i] = i
      origin.set([p.origin.x, p.origin.y, p.origin.z], i * 3)
      size.set([p.size.x, p.size.y, p.size.z], i * 3)
      const t = 0.82 + p.rand[3] * 0.3
      tint.set([t, t, t], i * 3)
    })

    geo.setAttribute('aPiece', new THREE.InstancedBufferAttribute(piece, 1))
    geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3))
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 3))
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3))
    geo.instanceCount = n
    // 位置が頂点シェーダー由来なので境界は手で与える
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 24)
    base.dispose()
    return geo
  }, [baked])

  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    uniforms.tPosition.value = baked.positionTexture
    uniforms.tOrient.value = baked.orientTexture
    uniforms.uTexSize.value.set(baked.count, baked.frames)
  }, [uniforms, baked])

  useEffect(() => {
    uniforms.uScatter.value = params.scatter
    uniforms.uSteps.value = params.steps
    uniforms.uColorLit.value.set(params.colorLit)
    uniforms.uColorShadow.value.set(params.colorShadow)
    uniforms.uColorHot.value.set(params.colorHot)
  }, [uniforms, params])

  // 再生ヘッド（秒）。焼いたフレーム数と実フレームレートは無関係
  const playhead = useRef(0)
  const waiting = useRef(0)
  const group = useRef(null)

  const restart = () => {
    playhead.current = 0
    waiting.current = 0
  }

  useFrame((state, delta) => {
    if (group.current) group.current.rotation.y += delta * params.spin

    const duration = baked.frames / FPS

    if (playhead.current < duration) {
      playhead.current = Math.min(playhead.current + delta * params.speed, duration)
    } else if (params.autoPlay) {
      waiting.current += delta
      if (waiting.current >= params.loopDelay) restart()
    }

    const f = playhead.current * FPS
    const from = Math.min(Math.floor(f), baked.frames - 1)
    const to = Math.min(from + 1, baked.frames - 1)

    uniforms.uFrameFrom.value = from
    uniforms.uFrameTo.value = to
    uniforms.uFrameRatio.value = f - from
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} onClick={restart} frustumCulled={false} />
    </group>
  )
}

export default function VertexAnimationTexture() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    mode: { value: DEFAULTS.mode, options: SHATTER_MODES },
    Bake: folder({
      cols: { value: DEFAULTS.cols, min: 4, max: 60, step: 1 },
      rows: { value: DEFAULTS.rows, min: 4, max: 40, step: 1 },
      frames: { value: DEFAULTS.frames, min: 24, max: 180, step: 2 },
    }),
    Playback: folder({
      speed: { value: DEFAULTS.speed, min: 0.1, max: 3, step: 0.05 },
      scatter: { value: DEFAULTS.scatter, min: 0, max: 2, step: 0.05 },
      autoPlay: { value: DEFAULTS.autoPlay, label: 'loop' },
      loopDelay: { value: DEFAULTS.loopDelay, min: 0, max: 4, step: 0.1, label: 'delay' },
      spin: { value: DEFAULTS.spin, min: 0, max: 1, step: 0.02 },
    }),
    Look: folder({
      steps: { value: DEFAULTS.steps, min: 2, max: 8, step: 1, label: 'toon steps' },
      colorLit: { value: DEFAULTS.colorLit, label: 'lit' },
      colorShadow: { value: DEFAULTS.colorShadow, label: 'shadow' },
      colorHot: { value: DEFAULTS.colorHot, label: 'hot' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0.6, 5.2], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#070910']} />
      <Shatter params={params} />
      <OrbitControls enablePan={false} minDistance={2.5} maxDistance={12} />
    </Canvas>
  )
}
