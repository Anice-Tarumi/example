import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import townUrl from '../../assets/dioramas/town.glb?url'
import forestUrl from '../../assets/dioramas/forest.glb?url'
import lighthouseUrl from '../../assets/dioramas/lighthouse.glb?url'
import ruinsUrl from '../../assets/dioramas/ruins.glb?url'
import { skyVertexShader, skyFragmentShader } from './glsl/sky'
import { patchFog } from './glsl/fog'
import { createCycleState, evalCycle } from './cycle'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

const SCENES = {
  town: townUrl,
  forest: forestUrl,
  lighthouse: lighthouseUrl,
  ruins: ruinsUrl,
}
const SCENE_OPTIONS = { Town: 'town', Forest: 'forest', Lighthouse: 'lighthouse', Ruins: 'ruins' }

Object.values(SCENES).forEach((u) => useGLTF.preload(u))

/** ジオラマ。原点に接地させて、大きさを揃える */
function Diorama({ url, fogUniforms }) {
  const { scene } = useGLTF(url)

  const model = useMemo(() => {
    const copy = scene.clone(true)
    const box = new THREE.Box3().setFromObject(copy)
    const size = new THREE.Vector3()
    box.getSize(size)
    const center = new THREE.Vector3()
    box.getCenter(center)

    const s = 4 / Math.max(size.x, size.z)
    copy.scale.setScalar(s)
    copy.position.set(-center.x * s, -box.min.y * s, -center.z * s)

    copy.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      // clone(true) はマテリアルを共有する。霧の差し込みが全モデルに漏れる
      o.material = o.material.clone()
      patchFog(o.material, fogUniforms)
    })
    return copy
  }, [scene, fogUniforms])

  return <primitive object={model} />
}

function Sky({ uniforms }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[60, 32, 24]} />
    </mesh>
  )
}

/**
 * 一日を回す。
 *
 * 時刻ひとつから、太陽の向き・色・空・霧・環境光・露出をまとめて出す。
 * 個々を leva で別々に触れるようにすると「日没なのに空が青い」が簡単に作れて
 * しまうので、**時刻を唯一の入力**にして、天候だけを上から掛ける。
 */
function Cycle({ params }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const state = useMemo(() => createCycleState(), [])
  const sun = useRef(null)
  const ambient = useRef(null)
  const time = useRef(params.time)

  const skyUniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunPower: { value: 1 },
      uHaze: { value: 0 },
      uExposure: { value: 1 },
    }),
    [],
  )

  const fogUniforms = useMemo(
    () => ({
      uFogSun: { value: new THREE.Color() },
      uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uFogSunPower: { value: DEFAULTS.fogSunPower },
    }),
    [],
  )

  const fog = useMemo(() => new THREE.FogExp2(0x000000, DEFAULTS.fogDensity), [])
  useEffect(() => {
    scene.fog = fog
    return () => { scene.fog = null }
  }, [scene, fog])

  // leva から time を動かしたら追従する。自動再生中はこちらが主
  useEffect(() => { time.current = params.time }, [params.time])

  useFrame((_, delta) => {
    if (params.autoplay) time.current = (time.current + delta * params.speed) % 1
    evalCycle(time.current, params.weather, state)

    if (sun.current) {
      sun.current.position.copy(state.sunDir).multiplyScalar(18)
      sun.current.color.copy(state.sun)
      sun.current.intensity = Math.max(0, state.sunPower) * params.sunIntensity
      sun.current.castShadow = params.shadows && state.sunDir.y > 0.02
    }
    if (ambient.current) {
      ambient.current.intensity = state.ambient
      // 空の色を環境光に流すと、影の側が空の色を拾う
      ambient.current.color.copy(state.skyHorizon).lerp(state.skyTop, 0.5)
    }

    skyUniforms.uTop.value.copy(state.skyTop)
    skyUniforms.uHorizon.value.copy(state.skyHorizon)
    skyUniforms.uSun.value.copy(state.sun)
    skyUniforms.uSunDir.value.copy(state.sunDir)
    skyUniforms.uSunPower.value = state.sunPower
    skyUniforms.uHaze.value = params.weather
    skyUniforms.uExposure.value = state.exposure * params.exposure

    fog.color.copy(state.fog)
    fog.density = params.fogDensity
    fogUniforms.uFogSun.value.copy(state.fogSun)
    fogUniforms.uFogSunDir.value.copy(state.sunDir)
    fogUniforms.uFogSunPower.value = params.fogSunPower

    gl.toneMappingExposure = state.exposure * params.exposure
  })

  const ground = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: '#6f6a60', roughness: 0.95, metalness: 0 })
    patchFog(mat, fogUniforms)
    return mat
  }, [fogUniforms])
  useEffect(() => () => ground.dispose(), [ground])

  return (
    <>
      <Sky uniforms={skyUniforms} />
      <ambientLight ref={ambient} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-far={40}
        shadow-bias={-0.0008}
      />

      <Suspense fallback={null}>
        <Diorama url={SCENES[params.scene]} fogUniforms={fogUniforms} />
      </Suspense>

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={ground}>
        <planeGeometry args={[120, 120]} />
      </mesh>
    </>
  )
}

export default function DayNightCycle() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Cycle: folder({
      scene: { value: DEFAULTS.scene, options: SCENE_OPTIONS },
      time: { value: DEFAULTS.time, min: 0, max: 1, step: 0.005, label: 'time of day' },
      autoplay: { value: DEFAULTS.autoplay },
      speed: { value: DEFAULTS.speed, min: 0.002, max: 0.2, step: 0.002 },
      weather: { value: DEFAULTS.weather, min: 0, max: 1, step: 0.02, label: 'overcast' },
    }),
    Atmosphere: folder({
      fogDensity: { value: DEFAULTS.fogDensity, min: 0, max: 0.2, step: 0.005, label: 'fog' },
      fogSunPower: { value: DEFAULTS.fogSunPower, min: 1, max: 24, step: 0.5, label: 'fog focus' },
      sunIntensity: { value: DEFAULTS.sunIntensity, min: 0, max: 3, step: 0.05, label: 'sun' },
      exposure: { value: DEFAULTS.exposure, min: 0.3, max: 2, step: 0.05 },
      shadows: { value: DEFAULTS.shadows },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas
      shadows
      camera={{ position: [4.2, 2.2, 4.6], fov: 42 }}
      dpr={[1, 2]}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <Cycle params={params} />
      <OrbitControls enablePan={false} minDistance={3} maxDistance={14} maxPolarAngle={Math.PI * 0.49} target={[0, 0.7, 0]} />
    </Canvas>
  )
}
