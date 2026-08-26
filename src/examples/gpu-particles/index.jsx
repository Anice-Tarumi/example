import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useFBO } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { quadVertexShader, simFragmentShader } from './glsl/sim'
import { particleVertexShader, particleFragmentShader } from './glsl/render'
import { createShapeTexture, createInstanceAttributes, SHAPES } from './shapes'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, RESOLUTIONS } from './presets'

function ParticleSystem({ params }) {
  const side = params.resolution
  const camera = useThree((s) => s.camera)

  // ---- 位置テクスチャの ping-pong ----
  const fboOpts = useMemo(
    () => ({
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  )
  const targetA = useFBO(side, side, fboOpts)
  const targetB = useFBO(side, side, fboOpts)

  const original = useMemo(
    () => createShapeTexture(params.shape, side),
    [params.shape, side],
  )
  useEffect(() => () => original.dispose(), [original])

  const [uniforms] = useState(() => ({
    sim: {
      tPosition: { value: null },
      tOriginal: { value: null },
      uTime: { value: 0 },
      uDelta: { value: 1 },
      uRotationSpeed: { value: DEFAULTS.rotationSpeed },
      uCurlSize: { value: DEFAULTS.curlSize },
      uCurlSpeed: { value: DEFAULTS.curlSpeed },
      uCurlStrength: { value: DEFAULTS.curlStrength },
      uShapeStrength: { value: DEFAULTS.shapeStrength },
      uLerpSpeed: { value: DEFAULTS.lerpSpeed },
      uSwirl: { value: DEFAULTS.swirl },
      uMouse: { value: new THREE.Vector3(999, 999, 999) },
      uMouseStrength: { value: DEFAULTS.mouseStrength },
      uMouseRadius: { value: DEFAULTS.mouseRadius },
      uOctaves: { value: DEFAULTS.octaves },
      uSetup: { value: 1 },
    },
    draw: {
      tPosition: { value: null },
      tPrevPosition: { value: null },
      uSize: { value: DEFAULTS.size },
      uSpeedStretch: { value: DEFAULTS.speedStretch },
      uColorA: { value: new THREE.Color(DEFAULTS.colorA) },
      uColorB: { value: new THREE.Color(DEFAULTS.colorB) },
      uColorHot: { value: new THREE.Color(DEFAULTS.colorHot) },
      uIntensity: { value: DEFAULTS.intensity },
      uSpeedTint: { value: DEFAULTS.speedTint },
      uFalloff: { value: DEFAULTS.falloff },
    },
  }))

  const simQuad = useMemo(
    () =>
      new FullScreenQuad(
        new THREE.ShaderMaterial({
          vertexShader: quadVertexShader,
          fragmentShader: simFragmentShader,
          uniforms: uniforms.sim,
          depthTest: false,
          depthWrite: false,
        }),
      ),
    [uniforms],
  )

  useEffect(() => () => {
    simQuad.material.dispose()
    simQuad.dispose()
  }, [simQuad])

  // ---- 描画メッシュ ----
  const mesh = useMemo(() => {
    const { count, fboUv, random } = createInstanceAttributes(side)

    const base = new THREE.PlaneGeometry(1, 1)
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.index = base.index
    geometry.attributes.position = base.attributes.position
    geometry.attributes.uv = base.attributes.uv
    geometry.setAttribute('aFboUv', new THREE.InstancedBufferAttribute(fboUv, 2))
    geometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(random, 3))
    geometry.instanceCount = count
    // 位置は頂点シェーダーで決まるので、カリング用の境界は手で与える
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12)
    base.dispose()

    const material = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: uniforms.draw,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })

    const m = new THREE.Mesh(geometry, material)
    m.frustumCulled = false
    return m
  }, [side, uniforms])

  useEffect(() => () => {
    mesh.geometry.dispose()
    mesh.material.dispose()
  }, [mesh])

  // ---- パラメータ反映 ----
  useEffect(() => {
    const s = uniforms.sim
    s.uRotationSpeed.value = params.rotationSpeed
    s.uCurlSize.value = params.curlSize
    s.uCurlSpeed.value = params.curlSpeed
    s.uCurlStrength.value = params.curlStrength
    s.uShapeStrength.value = params.shapeStrength
    s.uLerpSpeed.value = params.lerpSpeed
    s.uSwirl.value = params.swirl
    s.uMouseStrength.value = params.mouseStrength
    s.uMouseRadius.value = params.mouseRadius
    s.uOctaves.value = params.octaves

    const d = uniforms.draw
    d.uSize.value = params.size
    d.uSpeedStretch.value = params.speedStretch
    d.uIntensity.value = params.intensity
    d.uSpeedTint.value = params.speedTint
    d.uFalloff.value = params.falloff
    d.uColorA.value.set(params.colorA)
    d.uColorB.value.set(params.colorB)
    d.uColorHot.value.set(params.colorHot)
  }, [uniforms, params])

  // ---- カーソル。カメラから見て原点を通る平面との交点を取る ----
  const pointerNdc = useRef(new THREE.Vector2(10, 10))
  const domElement = useThree((s) => s.gl.domElement)

  useEffect(() => {
    const onMove = (e) => {
      const rect = domElement.getBoundingClientRect()
      pointerNdc.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
    }
    const onLeave = () => pointerNdc.current.set(10, 10)
    domElement.addEventListener('pointermove', onMove)
    domElement.addEventListener('pointerleave', onLeave)
    return () => {
      domElement.removeEventListener('pointermove', onMove)
      domElement.removeEventListener('pointerleave', onLeave)
    }
  }, [domElement])

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const camDir = useMemo(() => new THREE.Vector3(), [])

  // ---- ループ ----
  const read = useRef(targetA)
  const write = useRef(targetB)
  const setup = useRef(2)

  useEffect(() => {
    read.current = targetA
    write.current = targetB
    setup.current = 2
  }, [targetA, targetB, original])

  useFrame((state, delta) => {
    const { gl, scene } = state
    const s = uniforms.sim

    // カメラ正面を向く平面と視線の交点をカーソルの 3D 位置とする
    camera.getWorldDirection(camDir)
    plane.setFromNormalAndCoplanarPoint(camDir, new THREE.Vector3(0, 0, 0))
    raycaster.setFromCamera(pointerNdc.current, camera)
    if (raycaster.ray.intersectPlane(plane, hit)) {
      s.uMouse.value.copy(hit)
    } else {
      s.uMouse.value.set(999, 999, 999)
    }

    s.uTime.value = state.clock.elapsedTime
    s.uDelta.value = Math.min(delta, 1 / 20) * 60
    s.uSetup.value = setup.current > 0 ? 1 : 0
    s.tOriginal.value = original
    s.tPosition.value = read.current.texture

    gl.setRenderTarget(write.current)
    simQuad.render(gl)
    gl.setRenderTarget(null)

    // 速度は「前の位置」と「新しい位置」の差から描画側で求める
    uniforms.draw.tPrevPosition.value = read.current.texture
    uniforms.draw.tPosition.value = write.current.texture

    const next = write.current
    write.current = read.current
    read.current = next

    if (setup.current > 0) setup.current--

    gl.render(scene, camera)
  }, 1)

  return <primitive object={mesh} />
}

export default function GpuParticles() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    shape: { value: DEFAULTS.shape, options: SHAPES },
    resolution: { value: DEFAULTS.resolution, options: RESOLUTIONS, label: 'count' },
    Motion: folder({
      shapeStrength: { value: DEFAULTS.shapeStrength, min: 0, max: 1, step: 0.01, label: 'shape hold' },
      lerpSpeed: { value: DEFAULTS.lerpSpeed, min: 0.005, max: 0.3, step: 0.005, label: 'follow' },
      rotationSpeed: { value: DEFAULTS.rotationSpeed, min: 0, max: 0.5, step: 0.005, label: 'rotation' },
      swirl: { value: DEFAULTS.swirl, min: -1, max: 1, step: 0.01 },
    }),
    Curl: folder({
      curlStrength: { value: DEFAULTS.curlStrength, min: 0, max: 1.5, step: 0.01, label: 'strength' },
      curlSize: { value: DEFAULTS.curlSize, min: 0.1, max: 4, step: 0.05, label: 'scale' },
      curlSpeed: { value: DEFAULTS.curlSpeed, min: 0, max: 1, step: 0.01, label: 'speed' },
      octaves: { value: DEFAULTS.octaves, min: 1, max: 3, step: 1 },
    }),
    Pointer: folder({
      mouseStrength: { value: DEFAULTS.mouseStrength, min: -3, max: 3, step: 0.05, label: 'force' },
      mouseRadius: { value: DEFAULTS.mouseRadius, min: 0.1, max: 3, step: 0.05, label: 'radius' },
    }),
    Look: folder({
      size: { value: DEFAULTS.size, min: 0.002, max: 0.05, step: 0.001 },
      intensity: { value: DEFAULTS.intensity, min: 0.1, max: 4, step: 0.05 },
      falloff: { value: DEFAULTS.falloff, min: 1, max: 6, step: 0.1 },
      speedStretch: { value: DEFAULTS.speedStretch, min: 0, max: 80, step: 1, label: 'stretch' },
      speedTint: { value: DEFAULTS.speedTint, min: 0, max: 80, step: 1, label: 'speed tint' },
      colorA: { value: DEFAULTS.colorA, label: 'color a' },
      colorB: { value: DEFAULTS.colorB, label: 'color b' },
      colorHot: { value: DEFAULTS.colorHot, label: 'hot' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 1.5, 3.8], fov: 50 }} dpr={[1, 2]} gl={{ antialias: false }}>
      <color attach="background" args={['#05060a']} />
      <ParticleSystem params={params} />
      <OrbitControls enablePan={false} minDistance={1.6} maxDistance={9} />
    </Canvas>
  )
}
