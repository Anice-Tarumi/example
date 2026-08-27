import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { litVertexShader, litFragmentShader } from './glsl/lighting'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, LIGHT_TYPES } from './presets'

const MAX_OCCLUDERS = 6

/** 床の上に並べる球。これがそのまま遮蔽体にもなる */
const BODIES = [
  { pos: [-1.5, 0.55, 0.4], r: 0.55, color: '#e8e2d6', rough: 0.18 },
  { pos: [0.0, 0.38, -0.9], r: 0.38, color: '#c9603f', rough: 0.35 },
  { pos: [1.35, 0.7, 0.2], r: 0.7, color: '#7f8794', rough: 0.12 },
  { pos: [0.55, 0.26, 1.15], r: 0.26, color: '#4f9d7b', rough: 0.5 },
  { pos: [-0.6, 0.2, 1.5], r: 0.2, color: '#d8b25c', rough: 0.28 },
]

function makeUniforms() {
  return {
    uCameraPos: { value: new THREE.Vector3() },
    uBaseColor: { value: new THREE.Color('#ffffff') },
    uRoughness: { value: 0.3 },
    uMetalness: { value: 0.0 },
    uLightType: { value: 0 },
    uLightPos: { value: new THREE.Vector3() },
    uLightColor: { value: new THREE.Color(DEFAULTS.lightColor) },
    uLightPower: { value: DEFAULTS.power },
    uLightRadius: { value: DEFAULTS.radius },
    uLightAxis: { value: new THREE.Vector3() },
    uLightRight: { value: new THREE.Vector3() },
    uLightUp: { value: new THREE.Vector3() },
    uAmbient: { value: new THREE.Color(DEFAULTS.ambient) },
    uOcclusion: { value: DEFAULTS.occlusion },
    uOccluderCount: { value: 0 },
    uOccluders: { value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector4()) },
  }
}

function Stage({ params }) {
  const camera = useThree((s) => s.camera)

  // 物体ごとに色と粗さが違うので、マテリアルは個別に持つ
  const materials = useMemo(() => {
    const make = (color, rough, metal) => {
      const u = makeUniforms()
      u.uBaseColor.value.set(color)
      u.uRoughness.value = rough
      u.uMetalness.value = metal
      return new THREE.ShaderMaterial({
        vertexShader: litVertexShader,
        fragmentShader: litFragmentShader,
        uniforms: u,
      })
    }
    return {
      floor: make(DEFAULTS.floorColor, 0.42, 0.0),
      bodies: BODIES.map((b) => make(b.color, b.rough, 0.0)),
    }
  }, [])

  const all = useMemo(() => [materials.floor, ...materials.bodies], [materials])

  useEffect(
    () => () => {
      all.forEach((m) => m.dispose())
    },
    [all],
  )

  useEffect(() => {
    all.forEach((m) => {
      const u = m.uniforms
      u.uLightType.value = Math.max(0, LIGHT_TYPES.indexOf(params.lightType))
      u.uLightColor.value.set(params.lightColor)
      u.uLightPower.value = params.power
      u.uLightRadius.value = params.radius
      u.uAmbient.value.set(params.ambient)
      u.uOcclusion.value = params.occlusion
      u.uMetalness.value = params.metalness
    })
    // 物体側の粗さはスライダーで一括して寄せる
    materials.bodies.forEach((m, i) => {
      m.uniforms.uRoughness.value = THREE.MathUtils.clamp(BODIES[i].rough * params.roughScale, 0.03, 1)
    })
    materials.floor.uniforms.uRoughness.value = THREE.MathUtils.clamp(
      0.42 * params.roughScale,
      0.03,
      1,
    )
    materials.floor.uniforms.uBaseColor.value.set(params.floorColor)
  }, [all, materials, params])

  const lightRef = useRef(null)
  const lightPos = useMemo(() => new THREE.Vector3(), [])
  const axis = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(), [])
  const cursor = useRef(new THREE.Vector2())

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime

    const k = 1 - Math.exp(-3 * delta)
    cursor.current.x += (state.pointer.x - cursor.current.x) * k
    cursor.current.y += (state.pointer.y - cursor.current.y) * k

    // 光源はゆっくり回り、カーソルで寄る
    const a = t * params.orbitSpeed
    lightPos.set(
      Math.cos(a) * params.orbit + cursor.current.x * 2.2,
      params.height + cursor.current.y * 0.9,
      Math.sin(a) * params.orbit,
    )

    // 管と矩形の向き。光源の姿勢もゆっくり回す
    const roll = t * 0.25
    axis.set(Math.cos(roll), 0.25, Math.sin(roll)).normalize().multiplyScalar(params.tubeLength)
    right.set(Math.cos(roll), 0, Math.sin(roll)).multiplyScalar(params.rectWidth)
    up.set(0, 1, 0).multiplyScalar(params.rectHeight)

    all.forEach((m) => {
      const u = m.uniforms
      u.uCameraPos.value.copy(camera.position)
      u.uLightPos.value.copy(lightPos)
      u.uLightAxis.value.copy(axis)
      u.uLightRight.value.copy(right)
      u.uLightUp.value.copy(up)

      // 遮蔽体は毎フレーム詰め直す。動かすならここが効く
      BODIES.forEach((b, i) => {
        u.uOccluders.value[i].set(b.pos[0], b.pos[1], b.pos[2], b.r)
      })
      u.uOccluderCount.value = BODIES.length
    })

    if (lightRef.current) {
      lightRef.current.position.copy(lightPos)
      lightRef.current.rotation.set(0, -roll, 0)
    }
  })

  const emissive = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false })
    return m
  }, [])
  useEffect(() => {
    emissive.color.set(params.lightColor).multiplyScalar(1.6)
  }, [emissive, params.lightColor])
  useEffect(() => () => emissive.dispose(), [emissive])

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={materials.floor}>
        <planeGeometry args={[24, 24]} />
      </mesh>

      {BODIES.map((b, i) => (
        <mesh key={i} position={b.pos} material={materials.bodies[i]}>
          <sphereGeometry args={[b.r, 48, 32]} />
        </mesh>
      ))}

      {/* 光源そのもの。形が分からないとハイライトの形の理由が読めない */}
      <group ref={lightRef}>
        {params.lightType === 'sphere' && (
          <mesh material={emissive}>
            <sphereGeometry args={[params.radius, 24, 16]} />
          </mesh>
        )}
        {params.lightType === 'tube' && (
          <mesh material={emissive} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[params.radius, params.tubeLength * 2, 6, 16]} />
          </mesh>
        )}
        {params.lightType === 'rect' && (
          <mesh material={emissive}>
            <boxGeometry args={[params.rectWidth * 2, params.rectHeight * 2, 0.02]} />
          </mesh>
        )}
      </group>
    </>
  )
}

export default function AnalyticLighting() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Light: folder({
      lightType: { value: DEFAULTS.lightType, options: LIGHT_TYPES, label: 'shape' },
      radius: { value: DEFAULTS.radius, min: 0.02, max: 1.4, step: 0.02 },
      tubeLength: { value: DEFAULTS.tubeLength, min: 0.1, max: 3, step: 0.05, label: 'tube len' },
      rectWidth: { value: DEFAULTS.rectWidth, min: 0.1, max: 3, step: 0.05, label: 'rect w' },
      rectHeight: { value: DEFAULTS.rectHeight, min: 0.1, max: 3, step: 0.05, label: 'rect h' },
      power: { value: DEFAULTS.power, min: 0, max: 60, step: 0.5 },
      lightColor: { value: DEFAULTS.lightColor, label: 'color' },
    }),
    Motion: folder({
      orbit: { value: DEFAULTS.orbit, min: 0, max: 5, step: 0.05 },
      orbitSpeed: { value: DEFAULTS.orbitSpeed, min: 0, max: 1.5, step: 0.02, label: 'speed' },
      height: { value: DEFAULTS.height, min: 0.2, max: 5, step: 0.05 },
    }),
    Surface: folder({
      roughScale: { value: DEFAULTS.roughScale, min: 0.2, max: 3, step: 0.05, label: 'rough x' },
      metalness: { value: DEFAULTS.metalness, min: 0, max: 1, step: 0.02 },
      occlusion: { value: DEFAULTS.occlusion, min: 0, max: 1, step: 0.02, label: 'proximity' },
      floorColor: { value: DEFAULTS.floorColor, label: 'floor' },
      ambient: { value: DEFAULTS.ambient },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 2.2, 6.4], fov: 42 }} dpr={[1, 2]}>
      <color attach="background" args={['#080a0f']} />
      <Stage params={params} />
      <OrbitControls enablePan={false} minDistance={2.5} maxDistance={16} target={[0, 0.5, 0]} />
    </Canvas>
  )
}
