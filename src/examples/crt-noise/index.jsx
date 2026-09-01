import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { MeshReflectorMaterial, OrbitControls, useGLTF } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { crtVertexShader, crtFragmentShader } from './glsl/crt'
import { TV_MODELS, LAYOUT, createScreenGeometry } from './screens'
import { buildCables } from './cables'
import { detectScreen } from './detectScreen'
import { createRandomTexture } from './randomTexture'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, CHANNELS } from './presets'

TV_MODELS.forEach((m) => useGLTF.preload(m.url))

/** 検出結果はモデル 1 種につき 1 回。台ごとにやり直す必要はない */
const screenCache = new Map()

/** 乱数列は全台で共有。読む位置（位相）だけ台ごとにずらす */
const randomTex = createRandomTexture()

/**
 * ブラウン管 1 台。モデルと、その前面に重ねた画面板。
 *
 * 画面が唯一の光源なので、**画面の明るさをそのまま点光源に反映**する。
 * 砂嵐がバチバチすると筐体と床も一緒に明滅する。
 */
function Television({ def, place, params, channel, seed }) {
  const { scene } = useGLTF(def.url)

  /*
   * マテリアルは個体ごとに複製する。clone(true) は共有したままなので、
   * 1 台の色を変えると全部変わる。
   * 生成モデルは白基調で来ることが多く、そのままだと暗い部屋にならない。
   */
  const model = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((o) => {
      if (!o.isMesh) return
      o.material = o.material.clone()
      o.material.roughness = 0.72
      o.material.metalness = 0.12
    })
    return copy
  }, [scene])
  const group = useRef(null)
  const light = useRef(null)


  const geometry = useMemo(() => createScreenGeometry(params.bulge), [params.bulge])
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRandom: { value: randomTex },
      uChannelA: { value: 0 },
      uChannelB: { value: 1 },
      // 台ごとの位相。同じ乱数列を別の場所から読ませて、切替をずらす
      uOffset: { value: seed * 0.137 },
      uSwitchSpeed: { value: DEFAULTS.switchSpeed },
      uAuto: { value: DEFAULTS.autoSwitch ? 1 : 0 },
      uNoise: { value: DEFAULTS.noise },
      uScan: { value: DEFAULTS.scan },
      uMask: { value: DEFAULTS.mask },
      uBarrel: { value: DEFAULTS.barrel },
      uRoll: { value: DEFAULTS.roll },
      uChroma: { value: DEFAULTS.chroma },
      uTear: { value: DEFAULTS.tear },
      uInvert: { value: DEFAULTS.invert },
      uVignette: { value: DEFAULTS.vignette },
      uBright: { value: DEFAULTS.bright },
      uFlicker: { value: DEFAULTS.flicker },
      uTint: { value: new THREE.Color(DEFAULTS.tint) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: crtVertexShader,
        fragmentShader: crtFragmentShader,
        uniforms,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  /*
   * 画面の位置・大きさ・奥行きは**モデルから自動検出する**。
   * 機種ごとに縁の太さも画面位置も違うので、比率を手で当てると必ずずれる。
   * 検出はモデル 1 種につき 1 回だけ（結果はキャッシュ）。
   */
  const gl = useThree((st) => st.gl)
  const fit = useMemo(() => {
    if (!screenCache.has(def.id)) screenCache.set(def.id, detectScreen(gl, scene))
    const rect = screenCache.get(def.id)
    const box = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    box.getSize(size)
    return { size, rect }
  }, [gl, scene, model, def.id])

  // 筐体の色。テクスチャに乗算されるので暗く落とせる
  useEffect(() => {
    model.traverse((o) => {
      if (o.isMesh) o.material.color.set(params.caseTint)
    })
  }, [model, params.caseTint])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime + seed * 13.7

    /*
     * 切替は完全にシェーダー側。CPU は「A と B が何か」を渡すだけ。
     * 前フレームの値も、偶奇の数え上げも要らない。
     */
    uniforms.uTime.value = t
    uniforms.uChannelA.value = channel
    uniforms.uChannelB.value = (channel + 1 + (seed % 2)) % 4
    uniforms.uSwitchSpeed.value = params.switchSpeed
    uniforms.uAuto.value = params.autoSwitch ? 1 : 0
    uniforms.uNoise.value = params.noise
    uniforms.uScan.value = params.scan
    uniforms.uMask.value = params.mask
    uniforms.uBarrel.value = params.barrel
    uniforms.uRoll.value = params.roll
    uniforms.uChroma.value = params.chroma
    uniforms.uTear.value = params.tear
    uniforms.uInvert.value = params.invert
    uniforms.uVignette.value = params.vignette
    uniforms.uBright.value = params.bright
    uniforms.uFlicker.value = params.flicker
    uniforms.uTint.value.set(params.tint)

    /*
     * 画面の明るさを点光源に流す。厳密に平均輝度を測るには
     * 画面を RT に描いてミップを下ろす必要があるが、ここは
     * 同じ式で近似する（砂嵐の平均は 0.5、映像は明るめ）。
     */
    if (light.current) {
      const base = 0.45 + 0.25 * params.noise
      const flick = 1 + (Math.sin(t * 37.0) * 0.5 + 0.5) * params.flicker
      const target = base * params.bright * params.glow * flick
      light.current.intensity += (target - light.current.intensity) * Math.min(1, delta * 18)
    }
  })

  /*
   * 画面板の位置。
   *
   * bbox の前面は「筐体の一番手前」であって画面ではない。ツマミや縁の厚みぶん
   * 手前に出るので、そのまま置くと板が浮く。**内側へ引っ込める**必要がある。
   * 機種ごとの比率は screens.js に持ち、全体の微調整を leva から掛ける。
   */
  const r = fit.rect
  const w = r.w * place.scale * params.screenScale
  const h = r.h * place.scale * params.screenScale
  const y = (r.cy + params.screenY) * place.scale
  const z = (r.z + params.screenZ + 0.002) * place.scale
  const x = r.cx * place.scale

  return (
    <group ref={group} position={place.pos} rotation={[0, place.rot, 0]}>
      <primitive object={model} scale={place.scale} />
      <mesh geometry={geometry} material={material} scale={[w, h, 1]} position={[x, y, z]} />
      {/* 光源は必ずガラスより前。筐体の中に入れると内側から白く光ってしまう */}
      <pointLight
        ref={light}
        position={[x, y, z + 0.18 * place.scale]}
        intensity={0}
        distance={4.5 * place.scale + 1.5}
        decay={2}
        color={params.tint}
      />
    </group>
  )
}

/** 配線。モニターの座標から自動生成するので、配置を変えても追従する */
function Cables({ params }) {
  const geometry = useMemo(
    () => buildCables({ layout: LAYOUT, sag: params.cableSag, front: params.cableFront, radius: params.cableRadius }),
    [params.cableSag, params.cableFront, params.cableRadius],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={params.cableColor} roughness={0.85} metalness={0.1} />
    </mesh>
  )
}

function Room({ params }) {
  // チャンネルは台ごとに散らす。全部同じ絵だと壁紙に見える
  const channels = useMemo(
    () => LAYOUT.map((_, i) => (params.sameChannel ? CHANNELS.indexOf(params.channel) : i % 4)),
    [params.sameChannel, params.channel],
  )

  return (
    <>
      {LAYOUT.map((place, i) => (
        <Television
          key={i}
          def={TV_MODELS[place.model]}
          place={place}
          params={params}
          channel={channels[i]}
          seed={i}
        />
      ))}

      <Cables params={params} />

      {/* 濡れた床。画面の光だけを映す */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <planeGeometry args={[40, 40]} />
        <MeshReflectorMaterial
          resolution={512}
          mixBlur={params.floorBlur}
          mixStrength={params.floorMix}
          blur={[params.floorBlur * 300, params.floorBlur * 100]}
          roughness={params.floorRough}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color={params.floorColor}
          metalness={params.floorMetal}
        />
      </mesh>
    </>
  )
}

export default function CrtNoise() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Signal: folder({
      channel: { value: DEFAULTS.channel, options: CHANNELS },
      sameChannel: { value: DEFAULTS.sameChannel, label: 'same ch' },
      autoSwitch: { value: DEFAULTS.autoSwitch, label: 'auto switch' },
      switchSpeed: { value: DEFAULTS.switchSpeed, min: 0.0002, max: 0.01, step: 0.0002, label: 'switch speed' },
      noise: { value: DEFAULTS.noise, min: 0, max: 1, step: 0.01 },
      roll: { value: DEFAULTS.roll, min: 0, max: 2, step: 0.02 },
      flicker: { value: DEFAULTS.flicker, min: 0, max: 0.6, step: 0.01 },
    }),
    Tube: folder({
      scan: { value: DEFAULTS.scan, min: 0, max: 1, step: 0.02, label: 'scanlines' },
      mask: { value: DEFAULTS.mask, min: 0, max: 1, step: 0.02, label: 'phosphor' },
      barrel: { value: DEFAULTS.barrel, min: 0, max: 0.6, step: 0.01 },
      chroma: { value: DEFAULTS.chroma, min: 0, max: 3, step: 0.05 },
      tear: { value: DEFAULTS.tear, min: 0, max: 2, step: 0.05 },
      invert: { value: DEFAULTS.invert, min: 0, max: 1, step: 0.05 },
      vignette: { value: DEFAULTS.vignette, min: 0, max: 1, step: 0.02 },
      bulge: { value: DEFAULTS.bulge, min: 0, max: 0.2, step: 0.005 },
      bright: { value: DEFAULTS.bright, min: 0, max: 3, step: 0.05 },
      tint: { value: DEFAULTS.tint },
      screenY: { value: DEFAULTS.screenY, min: -0.3, max: 0.3, step: 0.005, label: 'screen y' },
      screenZ: { value: DEFAULTS.screenZ, min: -0.4, max: 0.2, step: 0.005, label: 'screen z' },
      screenScale: { value: DEFAULTS.screenScale, min: 0.4, max: 1.4, step: 0.01, label: 'screen size' },
    }),
    Cables: folder({
      cableSag: { value: DEFAULTS.cableSag, min: 0, max: 1, step: 0.02, label: 'sag' },
      cableFront: { value: DEFAULTS.cableFront, min: 0.2, max: 2.5, step: 0.05, label: 'front z' },
      cableRadius: { value: DEFAULTS.cableRadius, min: 0.003, max: 0.05, step: 0.001, label: 'radius' },
      cableColor: { value: DEFAULTS.cableColor, label: 'color' },
    }),
    Room: folder({
      glow: { value: DEFAULTS.glow, min: 0, max: 30, step: 0.5, label: 'screen light' },
      ambient: { value: DEFAULTS.ambient, min: 0, max: 0.4, step: 0.01 },
      caseTint: { value: DEFAULTS.caseTint, label: 'case' },
      floorRough: { value: DEFAULTS.floorRough, min: 0.05, max: 1, step: 0.02, label: 'floor rough' },
      floorBlur: { value: DEFAULTS.floorBlur, min: 0, max: 1.5, step: 0.05, label: 'floor blur' },
      floorMix: { value: DEFAULTS.floorMix, min: 0, max: 2, step: 0.05, label: 'floor mix' },
      floorMetal: { value: DEFAULTS.floorMetal, min: 0, max: 1, step: 0.02, label: 'floor metal' },
      floorColor: { value: DEFAULTS.floorColor, label: 'floor' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 1.3, 4.7], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={[params.background]} />
      {/* 画面が唯一の光源。環境光はほぼゼロに保つ */}
      <ambientLight intensity={params.ambient} />

      <Suspense fallback={null}>
        <Room params={params} />
      </Suspense>

      <OrbitControls enablePan={false} minDistance={1.5} maxDistance={9} target={[0, 0.55, 0]} />
    </Canvas>
  )
}
