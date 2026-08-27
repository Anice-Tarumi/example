import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { tunnelVertexShader, tunnelFragmentShader } from './glsl/tunnel'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

const LENGTH = 46
const RADIAL = 96
const RINGS = 200

function Tunnel({ params }) {
  const camera = useThree((s) => s.camera)

  // 素の円筒。軸を z に向けておく。これ以外のジオメトリは持たない
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, RADIAL, RINGS, true)
    g.rotateX(Math.PI / 2)
    // 頂点位置はシェーダーが uv から作り直すので、カリング用に広めの境界を置く
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), LENGTH)
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: DEFAULTS.speed },
      uLength: { value: LENGTH },
      uRadius: { value: DEFAULTS.radius },
      uTwist: { value: DEFAULTS.twist },
      uMobius: { value: DEFAULTS.mobius },
      uMobiusSpin: { value: DEFAULTS.mobiusSpin },
      uBend: { value: DEFAULTS.bend },
      uPulse: { value: DEFAULTS.pulse },
      uCursor: { value: new THREE.Vector2() },
      uColorA: { value: new THREE.Color(DEFAULTS.colorA) },
      uColorB: { value: new THREE.Color(DEFAULTS.colorB) },
      uFogColor: { value: new THREE.Color(DEFAULTS.fogColor) },
      uFogDensity: { value: DEFAULTS.fogDensity },
      uStripes: { value: DEFAULTS.stripes },
      uStripeSharp: { value: DEFAULTS.stripeSharp },
      uRim: { value: DEFAULTS.rim },
      uCameraPos: { value: new THREE.Vector3() },
    }),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: tunnelVertexShader,
        fragmentShader: tunnelFragmentShader,
        uniforms,
        side: THREE.BackSide,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    material.wireframe = params.wireframe
    material.side = params.wireframe ? THREE.DoubleSide : THREE.BackSide
    material.needsUpdate = true
  }, [material, params.wireframe])

  useEffect(() => {
    uniforms.uSpeed.value = params.speed
    uniforms.uRadius.value = params.radius
    uniforms.uTwist.value = params.twist
    uniforms.uMobius.value = params.mobius
    uniforms.uMobiusSpin.value = params.mobiusSpin
    uniforms.uBend.value = params.bend
    uniforms.uPulse.value = params.pulse
    uniforms.uFogDensity.value = params.fogDensity
    uniforms.uStripes.value = params.stripes
    uniforms.uStripeSharp.value = params.stripeSharp
    uniforms.uRim.value = params.rim
    uniforms.uColorA.value.set(params.colorA)
    uniforms.uColorB.value.set(params.colorB)
    uniforms.uFogColor.value.set(params.fogColor)
  }, [uniforms, params])

  const cursor = useRef(new THREE.Vector2())

  useFrame((state, delta) => {
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uCameraPos.value.copy(camera.position)

    // カーソルは追従を効かせる。生の値だとトンネルが跳ねる
    const k = 1 - Math.exp(-2.4 * delta)
    cursor.current.x += (state.pointer.x - cursor.current.x) * k
    cursor.current.y += (state.pointer.y - cursor.current.y) * k
    uniforms.uCursor.value.copy(cursor.current)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

export default function VertexDeformation() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Deform: folder({
      speed: { value: DEFAULTS.speed, min: 0, max: 14, step: 0.1 },
      twist: { value: DEFAULTS.twist, min: 0, max: 1.6, step: 0.01 },
      mobius: { value: DEFAULTS.mobius, min: 0, max: 0.85, step: 0.01 },
      mobiusSpin: { value: DEFAULTS.mobiusSpin, min: 0, max: 1.5, step: 0.01, label: 'a spin' },
      bend: { value: DEFAULTS.bend, min: 0, max: 2, step: 0.02 },
      pulse: { value: DEFAULTS.pulse, min: 0, max: 0.4, step: 0.01 },
      radius: { value: DEFAULTS.radius, min: 0.6, max: 2.4, step: 0.05 },
    }),
    Look: folder({
      stripes: { value: DEFAULTS.stripes, min: 2, max: 48, step: 1 },
      stripeSharp: { value: DEFAULTS.stripeSharp, min: 0.02, max: 0.5, step: 0.01, label: 'sharp' },
      rim: { value: DEFAULTS.rim, min: 0, max: 1.6, step: 0.02 },
      fogDensity: { value: DEFAULTS.fogDensity, min: 0.01, max: 0.14, step: 0.002, label: 'fog' },
      colorA: { value: DEFAULTS.colorA, label: 'base' },
      colorB: { value: DEFAULTS.colorB, label: 'stripe' },
      fogColor: { value: DEFAULTS.fogColor, label: 'fog col' },
      wireframe: { value: DEFAULTS.wireframe, label: 'wire' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0, 18], fov: 62 }} dpr={[1, 2]}>
      <color attach="background" args={[DEFAULTS.fogColor]} />
      <Tunnel params={params} />
    </Canvas>
  )
}
