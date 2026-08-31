import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useFBO, useGLTF } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bakeMeshSdf } from '../../shared/meshToSdf'
import sculptureUrl from './assets/sculpture.glb?url'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import {
  quadVertexShader,
  velocityFragmentShader,
  positionFragmentShader,
  copyFragmentShader,
} from './glsl/sim'
import { particleVertexShader, particleFragmentShader } from './glsl/render'
import {
  getVolumeTexture,
  registerMeshVolume,
  VOLUMES,
  getTextureSize,
  createInitialData,
  createPointAttributes,
} from './volume'
import { useVelocityField } from '../../shared/useVelocityField'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, COUNTS } from './presets'

const LIGHT_POS = new THREE.Vector3(-0.75, 1, -0.1)
// 元実装は VDB が円柱容器に収まる前提の値だった。
// ここは任意の SDF を入れるので、形が切れないよう広げてある。
const HEIGHT_LIMIT = 0.5
const RADIUS_LIMIT = 0.44
const CUBE_SIZE = 0.65

function ParticleSystem({ params }) {
  const size = useThree((s) => s.size)
  const viewportHeight = size.height
  const aspect = size.width / size.height
  const camera = useThree((s) => s.camera)
  const side = useMemo(() => getTextureSize(params.count), [params.count])

  const fboOpts = useMemo(
    () => ({
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  )
  const posA = useFBO(side, side, fboOpts)
  const posB = useFBO(side, side, fboOpts)
  const velA = useFBO(side, side, fboOpts)
  const velB = useFBO(side, side, fboOpts)

  const initial = useMemo(() => createInitialData(side), [side])
  // 彫刻はメッシュから距離場を焼く。手続き SDF と同じ形式に詰めるので扱いは同じ
  const sculpture = useGLTF(sculptureUrl)
  const volumeTex = useMemo(() => {
    if (params.volume !== 'sculpture') return getVolumeTexture(params.volume)

    let positions = null
    sculpture.scene.traverse((o) => {
      if (positions || !o.isMesh) return
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry
      positions = geo.attributes.position.array
    })
    if (!positions) return getVolumeTexture('sphere')

    const { distance, size } = bakeMeshSdf(positions, 48)
    return registerMeshVolume('sculpture', distance, size)
  }, [params.volume, sculpture])

  // 位置パスと速度パスで同じ uniform オブジェクトを共有する
  const shared = useMemo(
    () => ({
      tPosition: { value: null },
      tVelocity: { value: null },
      tOriginal: { value: null },
      tVolume: { value: null },
      uTime: { value: 0 },
      uDtRatio: { value: 1 },
      uRotation: { value: 0 },
      uNoiseForce: { value: DEFAULTS.noiseForce },
      uNoiseScale: { value: DEFAULTS.noiseScale },
      uSurfaceForce: { value: DEFAULTS.surfaceForce },
      uReturnForce: { value: DEFAULTS.returnForce },
      uFriction: { value: DEFAULTS.friction },
      uVolumeScale: { value: DEFAULTS.volumeScale },
      uCubeSize: { value: CUBE_SIZE },
      uLightPos: { value: LIGHT_POS.clone() },
      uHeightLimit: { value: HEIGHT_LIMIT },
      uRadiusLimit: { value: RADIUS_LIMIT },
      tFluid: { value: null },
      uViewMat: { value: new THREE.Matrix4() },
      uProjMat: { value: new THREE.Matrix4() },
      uPushForce: { value: DEFAULTS.pushForce },
      uInteractForce: { value: DEFAULTS.interactForce },
      uFluidScale: { value: DEFAULTS.fluidScale },
    }),
    [],
  )

  const copyUniforms = useMemo(() => ({ tSource: { value: null } }), [])

  const drawUniforms = useMemo(
    () => ({
      tPosition: { value: null },
      tVelocity: { value: null },
      uSize: { value: DEFAULTS.size },
      uViewportHeight: { value: 800 },
      uColorLight: { value: new THREE.Color(DEFAULTS.colorLight) },
      uColorDark: { value: new THREE.Color(DEFAULTS.colorDark) },
      uColorFast: { value: new THREE.Color(DEFAULTS.colorFast) },
      uLightPos: { value: LIGHT_POS.clone() },
      uAlpha: { value: DEFAULTS.alpha },
      uFastFrom: { value: DEFAULTS.fastFrom },
      uFastTo: { value: DEFAULTS.fastTo },
    }),
    [],
  )

  const quads = useMemo(() => {
    const make = (fs, u) =>
      new FullScreenQuad(
        new THREE.ShaderMaterial({
          vertexShader: quadVertexShader,
          fragmentShader: fs,
          uniforms: u,
          depthTest: false,
          depthWrite: false,
        }),
      )
    return {
      velocity: make(velocityFragmentShader, shared),
      position: make(positionFragmentShader, shared),
      copy: make(copyFragmentShader, copyUniforms),
    }
  }, [shared, copyUniforms])

  const stepFluid = useVelocityField(params.fluidRes, aspect)

  const points = useMemo(() => {
    const { count, texuv } = createPointAttributes(side)
    const geometry = new THREE.BufferGeometry()
    // 位置は頂点シェーダーでテクスチャから引くのでダミーを置く
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('texuv', new THREE.BufferAttribute(texuv, 2))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4)

    const material = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: drawUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })

    const p = new THREE.Points(geometry, material)
    p.frustumCulled = false
    return p
  }, [side, drawUniforms])

  // ---- パラメータ ----
  useEffect(() => {
    shared.uNoiseForce.value = params.noiseForce
    shared.uNoiseScale.value = params.noiseScale
    shared.uSurfaceForce.value = params.surfaceForce
    shared.uReturnForce.value = params.returnForce
    shared.uFriction.value = params.friction
    shared.uVolumeScale.value = params.volumeScale
    shared.uPushForce.value = params.pushForce
    shared.uInteractForce.value = params.interactForce
    shared.uFluidScale.value = params.fluidScale

    drawUniforms.uSize.value = params.size
    drawUniforms.uAlpha.value = params.alpha
    drawUniforms.uFastFrom.value = params.fastFrom
    drawUniforms.uFastTo.value = params.fastTo
    drawUniforms.uColorLight.value.set(params.colorLight)
    drawUniforms.uColorDark.value.set(params.colorDark)
    drawUniforms.uColorFast.value.set(params.colorFast)
  }, [shared, drawUniforms, params])

  useEffect(() => {
    drawUniforms.uViewportHeight.value = viewportHeight
  }, [drawUniforms, viewportHeight])

  // ---- カーソル。流体への入力なので画面 UV で持つ ----
  const pointer = useRef({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false, idle: 0 })
  const domElement = useThree((s) => s.gl.domElement)

  useEffect(() => {
    const onMove = (e) => {
      const rect = domElement.getBoundingClientRect()
      const p = pointer.current
      p.x = (e.clientX - rect.left) / rect.width
      p.y = 1 - (e.clientY - rect.top) / rect.height
      p.moved = true
      p.idle = 0
    }
    domElement.addEventListener('pointermove', onMove)
    return () => domElement.removeEventListener('pointermove', onMove)
  }, [domElement])

  // ---- ループ ----
  const buf = useRef({ posRead: posA, posWrite: posB, velRead: velA, velWrite: velB })
  const inited = useRef(false)
  const rotation = useRef(0)

  useEffect(() => {
    buf.current = { posRead: posA, posWrite: posB, velRead: velA, velWrite: velB }
    inited.current = false
  }, [posA, posB, velA, velB, initial])

  useFrame((state, delta) => {
    const { gl, scene } = state
    const b = buf.current

    const blit = (target, quad) => {
      gl.setRenderTarget(target)
      quad.render(gl)
    }

    // 初期位置・初速を FBO へ流し込む
    if (!inited.current) {
      copyUniforms.tSource.value = initial.posTex
      blit(b.posRead, quads.copy)
      blit(b.posWrite, quads.copy)
      copyUniforms.tSource.value = initial.velTex
      blit(b.velRead, quads.copy)
      blit(b.velWrite, quads.copy)
      inited.current = true
    }

    // カーソルが止まっている間はリサージュ曲線で流体をかき混ぜる
    const p = pointer.current
    p.idle += delta
    if (params.autoDemo && p.idle > 1.2) {
      const t = state.clock.elapsedTime * params.demoSpeed
      p.x = 0.5 + Math.sin(t * 0.53) * 0.3
      p.y = 0.5 + Math.sin(t * 0.79 + 1.1) * 0.26
      p.moved = true
    }

    // 先に流体を 1 ステップ進め、その速度場をパーティクルへ渡す
    const fluidTex = stepFluid(gl, Math.min(delta, 1 / 30), p, params)
    p.px = p.x
    p.py = p.y
    p.moved = false

    shared.tFluid.value = fluidTex
    shared.uViewMat.value.copy(camera.matrixWorldInverse)
    shared.uProjMat.value.copy(camera.projectionMatrix)

    rotation.current += params.rotationSpeed * delta
    shared.uTime.value = state.clock.elapsedTime
    shared.uDtRatio.value = Math.min(delta, 1 / 20) * 60
    shared.uRotation.value = rotation.current
    shared.tOriginal.value = initial.posTex
    shared.tVolume.value = volumeTex

    // 1. 速度を更新
    shared.tPosition.value = b.posRead.texture
    shared.tVelocity.value = b.velRead.texture
    blit(b.velWrite, quads.velocity)
    const nextVel = b.velWrite
    b.velWrite = b.velRead
    b.velRead = nextVel

    // 2. 新しい速度で位置を更新
    shared.tVelocity.value = nextVel.texture
    blit(b.posWrite, quads.position)
    const nextPos = b.posWrite
    b.posWrite = b.posRead
    b.posRead = nextPos

    gl.setRenderTarget(null)

    drawUniforms.tPosition.value = nextPos.texture
    drawUniforms.tVelocity.value = nextVel.texture

    gl.render(scene, camera)
  }, 1)

  return <primitive object={points} />
}

export default function GpuParticles() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    volume: { value: DEFAULTS.volume, options: VOLUMES },
    count: { value: DEFAULTS.count, options: COUNTS },
    Forces: folder({
      surfaceForce: { value: DEFAULTS.surfaceForce, min: 0, max: 0.006, step: 0.0001, label: 'surface' },
      returnForce: { value: DEFAULTS.returnForce, min: 0, max: 0.004, step: 0.0001, label: 'return' },
      friction: { value: DEFAULTS.friction, min: 0.8, max: 0.98, step: 0.005 },
      rotationSpeed: { value: DEFAULTS.rotationSpeed, min: 0, max: 0.6, step: 0.005, label: 'rotation' },
      volumeScale: { value: DEFAULTS.volumeScale, min: 0.5, max: 3, step: 0.05, label: 'volume fit' },
    }),
    Noise: folder({
      noiseForce: { value: DEFAULTS.noiseForce, min: 0, max: 0.0012, step: 0.00002, label: 'force' },
      noiseScale: { value: DEFAULTS.noiseScale, min: 1, max: 20, step: 0.5, label: 'scale' },
    }),
    Fluid: folder({
      pushForce: { value: DEFAULTS.pushForce, min: 0, max: 0.004, step: 0.0001, label: 'push' },
      interactForce: { value: DEFAULTS.interactForce, min: 0, max: 4, step: 0.05, label: 'interact' },
      fluidScale: { value: DEFAULTS.fluidScale, min: 0.001, max: 0.08, step: 0.001, label: 'field scale' },
      fluidForce: { value: DEFAULTS.fluidForce, min: 500, max: 20000, step: 100, label: 'splat force' },
      fluidRadius: { value: DEFAULTS.fluidRadius, min: 0.02, max: 1, step: 0.01, label: 'splat radius' },
      fluidCurl: { value: DEFAULTS.fluidCurl, min: 0, max: 60, step: 1, label: 'vorticity' },
      fluidDissipation: { value: DEFAULTS.fluidDissipation, min: 0, max: 4, step: 0.05, label: 'decay' },
      fluidIterations: { value: DEFAULTS.fluidIterations, min: 1, max: 30, step: 1, label: 'iterations' },
      fluidRes: { value: DEFAULTS.fluidRes, options: { low: 64, mid: 128 }, label: 'res' },
      autoDemo: { value: DEFAULTS.autoDemo, label: 'auto demo' },
      demoSpeed: { value: DEFAULTS.demoSpeed, min: 0.1, max: 3, step: 0.05, label: 'demo speed' },
    }),
    Look: folder({
      size: { value: DEFAULTS.size, min: 1, max: 40, step: 0.5 },
      alpha: { value: DEFAULTS.alpha, min: 0.05, max: 1, step: 0.01 },
      fastFrom: { value: DEFAULTS.fastFrom, min: 0.0005, max: 0.01, step: 0.0002, label: 'glow from' },
      fastTo: { value: DEFAULTS.fastTo, min: 0.001, max: 0.02, step: 0.0002, label: 'glow to' },
      colorLight: { value: DEFAULTS.colorLight, label: 'lit' },
      colorDark: { value: DEFAULTS.colorDark, label: 'shadow' },
      colorFast: { value: DEFAULTS.colorFast, label: 'glow' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0.22, 1.05], fov: 45 }} dpr={[1, 2]} gl={{ antialias: false }}>
      <color attach="background" args={['#05070c']} />
      {/* GLB は読み込み中に suspend するので境界の中に置く */}
      <Suspense fallback={null}>
        <ParticleSystem params={params} />
      </Suspense>
      <OrbitControls enablePan={false} minDistance={0.5} maxDistance={3} />
    </Canvas>
  )
}
