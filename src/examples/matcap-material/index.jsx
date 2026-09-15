import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bakeMatcap } from './matcap'
import { matcapVertexShader, matcapFragmentShader } from './glsl/matcap'
import { ENV_MAPS } from '../../shared/env'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/**
 * matcap の多チャンネル活用。
 *
 * matcap は「球に当たった光を 1 枚に焼いたもの」。ライトも環境マップも要らず、
 * 引くのはテクスチャ 1 回だけ。そのぶん**光は世界ではなくカメラに固定**され、
 * 物を回しても光の来る向きが変わらない。
 *
 * ここでは素材を持たず**その場で焼く**。焼き方が分かっていれば、色も硬さも
 * 実行時に変えられる。拡散・粗い鏡面・鋭い鏡面を別チャンネルに詰めて、
 * 材質ごとに配合を変える。
 */

/** 並べる形。曲率の違う物を混ぜないと matcap の効きが分からない */
function useShapes() {
  return useMemo(() => {
    const knot = new THREE.TorusKnotGeometry(0.62, 0.21, 180, 28)
    const sphere = new THREE.SphereGeometry(0.85, 64, 48)
    const cyl = new THREE.CylinderGeometry(0.55, 0.7, 1.5, 48, 1)
    const ico = new THREE.IcosahedronGeometry(0.9, 1)
    return [
      { geo: knot, pos: [-2.2, 0.1, 0] },
      { geo: sphere, pos: [0, 0.1, 0] },
      { geo: cyl, pos: [2.1, 0.1, 0] },
      { geo: ico, pos: [0, 0.1, -2.4] },
    ]
  }, [])
}

function Showcase({ params }) {
  const shapes = useShapes()
  const group = useRef(null)
  const preview = useRef(null)

  // matcap は設定が変わったときだけ焼き直す。毎フレーム焼くと当然もたない
  const matcap = useMemo(() => bakeMatcap(256, {
    roughPower: params.roughPower,
    sharpPower: params.sharpPower,
    fresnelPower: params.fresnel,
    lightA: [params.lightX, params.lightY, 0.55],
  }), [params.roughPower, params.sharpPower, params.fresnel, params.lightX, params.lightY])
  useEffect(() => () => matcap.dispose(), [matcap])

  const uniforms = useMemo(() => ({
    tMatcap: { value: matcap },
    uBase: { value: new THREE.Color(DEFAULTS.baseColor) },
    uRough: { value: new THREE.Color(DEFAULTS.roughColor) },
    uSharp: { value: new THREE.Color(DEFAULTS.sharpColor) },
    uBaseAmt: { value: DEFAULTS.baseAmt },
    uRoughAmt: { value: DEFAULTS.roughAmt },
    uSharpAmt: { value: DEFAULTS.sharpAmt },
    uChannels: { value: 1 },
  }), [matcap])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: matcapVertexShader,
    fragmentShader: matcapFragmentShader,
    uniforms,
  }), [uniforms])
  useEffect(() => () => material.dispose(), [material])

  /*
   * 比較用の PBR。**同じ形に同じ色**で並べないと、matcap が安いのか
   * 手抜きなのか分からない。
   */
  const pbr = useMemo(() => new THREE.MeshStandardMaterial({
    color: DEFAULTS.baseColor,
    roughness: 0.28,
    metalness: 0.55,
  }), [])
  useEffect(() => () => pbr.dispose(), [pbr])

  const previewMat = useMemo(() => new THREE.MeshBasicMaterial({ map: matcap }), [matcap])
  useEffect(() => () => previewMat.dispose(), [previewMat])

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    g.rotation.y += delta * params.spin
    uniforms.uBase.value.set(params.baseColor)
    uniforms.uRough.value.set(params.roughColor)
    uniforms.uSharp.value.set(params.sharpColor)
    uniforms.uBaseAmt.value = params.baseAmt
    uniforms.uRoughAmt.value = params.roughAmt
    uniforms.uSharpAmt.value = params.sharpAmt
    uniforms.uChannels.value = params.mode === 'single' ? 0 : 1
    pbr.color.set(params.baseColor)
    if (preview.current) preview.current.visible = params.showMatcap
  })

  const usePbr = params.mode === 'pbr'

  return (
    <>
      <group ref={group}>
        {shapes.map((s, i) => (
          <mesh key={i} geometry={s.geo} position={s.pos} material={usePbr ? pbr : material} castShadow />
        ))}
      </group>

      {/*
        * 焼いた matcap をそのまま出す。**仕組みが見えることが大事。**
        * 球に光を当てた 1 枚だと分かれば、なぜ回しても光が動かないかも分かる。
        */}
      <mesh ref={preview} position={[2.3, 2.35, -1.2]} material={previewMat}>
        <planeGeometry args={[1.5, 1.5]} />
      </mesh>

      {/*
        * PBR のときだけライトを出す。**matcap のときは 1 灯も無い**ことを
        * 示すため、常設しない。
        */}
      {usePbr && (
        <>
          <directionalLight position={[4, 6, 4]} intensity={2.2} />
          <directionalLight position={[-5, 2, -3]} intensity={0.8} color="#9fc2ff" />
          <Suspense fallback={null}>
            <Environment files={ENV_MAPS.studio.url} />
          </Suspense>
        </>
      )}
    </>
  )
}

/**
 * 右上の leva ぶんだけ寄せる。
 *
 * **カメラを `lookAt` で向けても OrbitControls に上書きされる。** 操作を
 * 握っているのは controls なので、寄せるなら注視点ごと動かす。
 */
const DIST = 9.6

function Rig() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const size = useThree((s) => s.size)

  useEffect(() => {
    if (!controls) return
    const panel = size.width > 900 ? 300 : 0
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    const unit = (2 * DIST * tan) / size.height
    const shift = (panel / 2) * unit
    controls.target.set(shift, 0.2, 0)
    camera.position.set(shift, 2.0, DIST)
    controls.update()
  }, [camera, controls, size.width, size.height])

  return null
}

export default function MatcapMaterial() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    mode: {
      value: DEFAULTS.mode,
      options: { 'Multi-channel matcap': 'multi', 'Single matcap': 'single', 'PBR + lights': 'pbr' },
    },
    Mix: folder({
      baseAmt: { value: DEFAULTS.baseAmt, min: 0, max: 2, step: 0.05, label: 'diffuse' },
      roughAmt: { value: DEFAULTS.roughAmt, min: 0, max: 2, step: 0.05, label: 'rough spec' },
      sharpAmt: { value: DEFAULTS.sharpAmt, min: 0, max: 2, step: 0.05, label: 'sharp spec' },
    }),
    Bake: folder({
      roughPower: { value: DEFAULTS.roughPower, min: 2, max: 48, step: 1, label: 'rough tight' },
      sharpPower: { value: DEFAULTS.sharpPower, min: 20, max: 400, step: 5, label: 'sharp tight' },
      fresnel: { value: DEFAULTS.fresnel, min: 0.5, max: 8, step: 0.1, label: 'rim' },
      lightX: { value: DEFAULTS.lightX, min: -1, max: 1, step: 0.05, label: 'light x' },
      lightY: { value: DEFAULTS.lightY, min: -1, max: 1, step: 0.05, label: 'light y' },
    }),
    Look: folder({
      baseColor: { value: DEFAULTS.baseColor, label: 'diffuse tint' },
      roughColor: { value: DEFAULTS.roughColor, label: 'rough tint' },
      sharpColor: { value: DEFAULTS.sharpColor, label: 'sharp tint' },
      background: { value: DEFAULTS.background, label: 'bg' },
      spin: { value: DEFAULTS.spin, min: 0, max: 1.5, step: 0.05 },
      showMatcap: { value: DEFAULTS.showMatcap, label: 'show matcap' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 2, 9.6], fov: 38 }} dpr={[1, 2]}>
      <color attach="background" args={[params.background]} />
      <Showcase params={params} />
      <Rig />
      <OrbitControls makeDefault enablePan={false} minDistance={4} maxDistance={20} />
    </Canvas>
  )
}
