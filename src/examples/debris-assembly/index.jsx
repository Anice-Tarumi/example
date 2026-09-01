import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sampleSlots, bakeAssembly } from './bake'
import { debrisVertexShader, debrisFragmentShader } from './glsl/debris'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'
import iconUrl from '../../assets/brand/icon.png'

const FPS = 30

function Pile({ params }) {
  const icon = useTexture(iconUrl)

  // 絵から着地スロットを撒き、落下と堆積を焼く。ここが重い処理の全部
  const baked = useMemo(() => {
    const { slots, colors } = sampleSlots(icon.image, {
      count: params.count,
      width: params.spanX,
      depth: params.spanZ,
      alphaThreshold: params.alphaThreshold,
    })

    const data = bakeAssembly({
      slots,
      frames: params.frames,
      fps: FPS,
      dropHeight: params.dropHeight,
      spread: params.spread,
      stagger: params.stagger,
      pieceSize: params.pieceSize,
      sizeVariation: params.sizeVariation,
    })

    return { ...data, colors }
  }, [
    icon,
    params.count,
    params.spanX,
    params.spanZ,
    params.alphaThreshold,
    params.frames,
    params.dropHeight,
    params.spread,
    params.stagger,
    params.pieceSize,
    params.sizeVariation,
  ])

  useEffect(
    () => () => {
      baked.positionTexture.dispose()
      baked.orientTexture.dispose()
    },
    [baked],
  )

  const uniforms = useMemo(
    () => ({
      tPosition: { value: null },
      tOrient: { value: null },
      uTexSize: { value: new THREE.Vector2(1, 1) },
      uFrameFrom: { value: 0 },
      uFrameTo: { value: 0 },
      uFrameRatio: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0.35, 0.9, 0.45).normalize() },
      uShadowTint: { value: new THREE.Color(DEFAULTS.shadowTint) },
      uSteps: { value: DEFAULTS.steps },
      uAirFade: { value: DEFAULTS.airFade },
    }),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: debrisVertexShader,
        fragmentShader: debrisFragmentShader,
        uniforms,
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

    const n = baked.count
    const piece = new Float32Array(n)
    const color = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      piece[i] = i
      const c = baked.colors[i] || [1, 1, 1]
      color.set(c, i * 3)
    }

    geo.setAttribute('aPiece', new THREE.InstancedBufferAttribute(piece, 1))
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(baked.sizes, 3))
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3))
    geo.instanceCount = n
    // 位置が頂点シェーダー由来なので境界は手で与える
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
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
    uniforms.uSteps.value = params.steps
    uniforms.uAirFade.value = params.airFade
    uniforms.uShadowTint.value.set(params.shadowTint)
  }, [uniforms, params])

  const playhead = useRef(0)
  const waiting = useRef(0)

  useFrame((state, delta) => {
    const duration = baked.frames / FPS

    if (playhead.current < duration) {
      playhead.current = Math.min(playhead.current + delta * params.speed, duration)
    } else if (params.loop) {
      waiting.current += delta
      if (waiting.current >= params.loopDelay) {
        playhead.current = 0
        waiting.current = 0
      }
    }

    const f = playhead.current * FPS
    const from = Math.min(Math.floor(f), baked.frames - 1)
    uniforms.uFrameFrom.value = from
    uniforms.uFrameTo.value = Math.min(from + 1, baked.frames - 1)
    uniforms.uFrameRatio.value = f - from
  })

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      onClick={() => {
        playhead.current = 0
        waiting.current = 0
      }}
    />
  )
}

export default function DebrisAssembly() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Bake: folder({
      count: { value: DEFAULTS.count, min: 300, max: 4000, step: 100 },
      frames: { value: DEFAULTS.frames, min: 60, max: 220, step: 10 },
      dropHeight: { value: DEFAULTS.dropHeight, min: 2, max: 14, step: 0.5, label: 'height' },
      stagger: { value: DEFAULTS.stagger, min: 0, max: 2, step: 0.05 },
      spread: { value: DEFAULTS.spread, min: 0, max: 0.6, step: 0.01 },
    }),
    Shape: folder({
      spanX: { value: DEFAULTS.spanX, min: 1, max: 8, step: 0.1, label: 'width' },
      spanZ: { value: DEFAULTS.spanZ, min: 1, max: 8, step: 0.1, label: 'depth' },
      pieceSize: { value: DEFAULTS.pieceSize, min: 0.02, max: 0.2, step: 0.005, label: 'piece' },
      sizeVariation: { value: DEFAULTS.sizeVariation, min: 0, max: 1, step: 0.05, label: 'variation' },
      alphaThreshold: { value: DEFAULTS.alphaThreshold, min: 0.05, max: 0.95, step: 0.05, label: 'alpha' },
    }),
    Playback: folder({
      speed: { value: DEFAULTS.speed, min: 0.1, max: 3, step: 0.05 },
      loop: { value: DEFAULTS.loop },
      loopDelay: { value: DEFAULTS.loopDelay, min: 0, max: 5, step: 0.1, label: 'delay' },
    }),
    Look: folder({
      steps: { value: DEFAULTS.steps, min: 2, max: 8, step: 1, label: 'toon steps' },
      shadowTint: { value: DEFAULTS.shadowTint, label: 'shadow' },
      airFade: { value: DEFAULTS.airFade, min: 0, max: 0.3, step: 0.005, label: 'air fade' },
      background: { value: DEFAULTS.background, label: 'bg' },
      ground: { value: DEFAULTS.ground },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 6.2, 3.0], fov: 42 }} dpr={[1, 2]}>
      <color attach="background" args={[params.background]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 6, 3]} intensity={1.6} />

      {/* 積もる床 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={params.ground} roughness={0.95} />
      </mesh>

      <Suspense fallback={null}>
        <Pile params={params} />
      </Suspense>

      <OrbitControls enablePan={false} minDistance={2} maxDistance={14} target={[0, 0, 0]} />
    </Canvas>
  )
}
