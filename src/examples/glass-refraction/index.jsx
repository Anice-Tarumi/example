import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'
import { ENV_MAPS, ENV_OPTIONS } from '../../shared/env'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  transmissionParsGLSL,
  transmissionFragmentGLSL,
  frostCommonGLSL,
  frostRoughnessGLSL,
} from './glsl/transmission'
import { Backdrop } from './backdrop'
import { useMouseFrost } from './frost'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, SHAPES } from './presets'

function makeGeometry(shape) {
  switch (shape) {
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(0.72, 0.26, 220, 48)
    case 'box':
      return new THREE.BoxGeometry(1.5, 1.5, 1.5, 8, 8, 8)
    case 'octahedron':
      return new THREE.OctahedronGeometry(1.15, 0)
    case 'sphere':
      return new THREE.SphereGeometry(1.05, 96, 96)
    default:
      return new THREE.IcosahedronGeometry(1.12, 0)
  }
}

function GlassObject({ params }) {
  const meshRef = useRef(null)
  const frost = useMouseFrost(512)

  // samples はシェーダーへ定数として埋め込むので、変わったら作り直す
  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(DEFAULTS.color),
      metalness: 0,
      roughness: DEFAULTS.roughness,
      ior: DEFAULTS.ior,
      transmission: 1,
      thickness: DEFAULTS.thickness,
      transparent: true,
    })
    // vUv を使うため。テクスチャを 1 枚も持たないと three が USE_UV を立てない
    mat.defines = { ...(mat.defines || {}), USE_UV: '' }

    const uniforms = {
      uChromaticAberration: { value: DEFAULTS.chromaticAberration },
      uThickness: { value: DEFAULTS.thickness },
      uAttenuationDistance: { value: DEFAULTS.attenuationDistance },
      uAttenuationColor: { value: new THREE.Color(DEFAULTS.attenuationColor) },
      uFrostColor: { value: new THREE.Color(DEFAULTS.frostColor) },
      uFrostAmount: { value: DEFAULTS.frostAmount },
      uNoiseSeed: { value: 0 },
      tFrost: { value: null },
      uMeltAmount: { value: DEFAULTS.meltAmount },
      uRimIntensity: { value: DEFAULTS.rimIntensity },
    }
    mat.userData.uniforms = uniforms

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <uv_pars_fragment>', `#include <uv_pars_fragment>\n${frostCommonGLSL}`)
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\n${frostRoughnessGLSL}`,
        )
        .replace('#include <transmission_pars_fragment>', transmissionParsGLSL)
        .replace('#include <transmission_fragment>', transmissionFragmentGLSL(params.samples))
    }
    // onBeforeCompile を変えたことを three に伝える
    mat.customProgramCacheKey = () => `glass-${params.samples}`

    return mat
  }, [params.samples])

  useEffect(() => () => material.dispose(), [material])

  const geometry = useMemo(() => makeGeometry(params.shape), [params.shape])
  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const u = material.userData.uniforms
    u.uChromaticAberration.value = params.chromaticAberration
    u.uThickness.value = params.thickness
    u.uAttenuationDistance.value = params.attenuationDistance
    u.uAttenuationColor.value.set(params.attenuationColor)
    u.uFrostColor.value.set(params.frostColor)
    u.uFrostAmount.value = params.frostAmount
    u.uMeltAmount.value = params.meltAmount
    u.uRimIntensity.value = params.rimIntensity

    material.roughness = params.roughness
    material.ior = params.ior
    material.thickness = params.thickness
    material.color.set(params.color)
    material.envMapIntensity = params.envIntensity
  }, [material, params])

  useFrame((state, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += delta * params.autoRotate
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.25) * 0.18
    material.userData.uniforms.uNoiseSeed.value = state.clock.elapsedTime

    // 波を 1 ステップ進めてからマテリアルへ渡す
    const tex = frost.step(state.gl, state.clock.elapsedTime, params)
    material.userData.uniforms.tFrost.value = tex
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      onPointerMove={(e) => {
        // メッシュ表面の UV に直接注入する。撫でた軌跡がそのまま波になる
        if (e.uv) frost.setPointer(e.uv)
      }}
    />
  )
}

export default function GlassRefraction() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    shape: { value: DEFAULTS.shape, options: SHAPES },
    Glass: folder({
      chromaticAberration: { value: DEFAULTS.chromaticAberration, min: 0, max: 1, step: 0.01, label: 'dispersion' },
      ior: { value: DEFAULTS.ior, min: 1, max: 2.6, step: 0.01 },
      thickness: { value: DEFAULTS.thickness, min: 0, max: 6, step: 0.05 },
      roughness: { value: DEFAULTS.roughness, min: 0, max: 1, step: 0.01 },
      samples: { value: DEFAULTS.samples, min: 1, max: 10, step: 1 },
    }),
    Absorption: folder({
      attenuationDistance: { value: DEFAULTS.attenuationDistance, min: 0.2, max: 12, step: 0.1, label: 'distance' },
      attenuationColor: { value: DEFAULTS.attenuationColor, label: 'color' },
      color: { value: DEFAULTS.color, label: 'tint' },
    }),
    Frost: folder({
      frostColor: { value: DEFAULTS.frostColor, label: 'color' },
      frostAmount: { value: DEFAULTS.frostAmount, min: 0, max: 1, step: 0.01, label: 'amount' },
    }),
    Melt: folder({
      meltAmount: { value: DEFAULTS.meltAmount, min: 0, max: 1, step: 0.01, label: 'melt' },
      rimIntensity: { value: DEFAULTS.rimIntensity, min: 0, max: 6, step: 0.05, label: 'rim glow' },
      frostStrength: { value: DEFAULTS.frostStrength, min: 0, max: 3, step: 0.05, label: 'brush' },
      frostDamping: { value: DEFAULTS.frostDamping, min: 0.9, max: 0.999, step: 0.001, label: 'hold' },
      frostSpeed: { value: DEFAULTS.frostSpeed, min: 0, max: 4, step: 0.05, label: 'spread' },
      frostAdvect: { value: DEFAULTS.frostAdvect, min: 0, max: 6, step: 0.1, label: 'noise' },
    }),
    Scene: folder({
      envMap: { value: DEFAULTS.envMap, options: ENV_OPTIONS, label: 'env map' },
      envIntensity: { value: DEFAULTS.envIntensity, min: 0, max: 3, step: 0.05, label: 'env' },
      autoRotate: { value: DEFAULTS.autoRotate, min: 0, max: 1.5, step: 0.02, label: 'spin glass' },
      spin: { value: DEFAULTS.spin, min: 0, max: 0.5, step: 0.01, label: 'spin backdrop' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0.6, 4.6], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#070a10']} />

      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 2]} intensity={1.6} />

      <Backdrop spin={params.spin} />
      <GlassObject params={params} />

      {/* HDR を読み込まずに環境光を作る。透過に映り込みが無いとのっぺりする */}
      {/* 実写の環境マップ。板で代用すると映り込みが板に見える */}
      <Suspense fallback={null}>
        {params.envMap === 'lightformer' ? (
          <Environment resolution={256}>
            <Lightformer intensity={2.4} position={[0, 4, 2]} scale={[8, 3, 1]} color="#dceaff" />
            <Lightformer intensity={1.2} position={[-4, 1, -2]} scale={[4, 6, 1]} color="#ff9bd0" />
            <Lightformer intensity={1.4} position={[4, -1, -1]} scale={[4, 6, 1]} color="#7fd9ff" />
            <Lightformer intensity={0.8} position={[0, -4, 1]} scale={[8, 3, 1]} color="#ffd9a0" />
          </Environment>
        ) : (
          <Environment files={ENV_MAPS[params.envMap]?.url ?? ENV_MAPS.studio.url} />
        )}
      </Suspense>

      <OrbitControls enablePan={false} minDistance={2.4} maxDistance={9} />
    </Canvas>
  )
}
