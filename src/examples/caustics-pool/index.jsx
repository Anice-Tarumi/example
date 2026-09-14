import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useFBO } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { photonVertexShader, photonFragmentShader, blurFragmentShader, quadVertexShader } from './glsl/caustics'
import { floorVertexShader, floorFragmentShader, waterVertexShader, waterFragmentShader } from './glsl/water'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/** 池の一辺（世界単位） */
const POOL = 10
/** 焦線テクスチャの解像度 */
const CAUSTIC_RES = 512
/** 水面の分割。法線は画素ごとに取り直すので、形が出る程度で足りる */
const WATER_SEG = 128
/** 同時に持てる波紋の数。シェーダーの配列長と合わせる */
const DROPS = 8

function Pool({ params }) {
  // --- 波の共有 uniform。光子側と水面側で同じ面を見る ---
  const waves = useMemo(() => ({
    uTime: { value: 0 },
    uSwell: { value: DEFAULTS.swell },
    uRipple: { value: DEFAULTS.ripple },
    uSwellScale: { value: DEFAULTS.swellScale },
    uRippleScale: { value: DEFAULTS.rippleScale },
    uSpeed: { value: DEFAULTS.speed },
    uDrops: { value: Array.from({ length: DROPS }, () => new THREE.Vector4(0, 0, -1e3, 0)) },
    uDropSpeed: { value: DEFAULTS.dropSpeed },
    uDropDecay: { value: DEFAULTS.dropDecay },
  }), [])

  const shared = useMemo(() => ({
    uSun: { value: new THREE.Vector3() },
    uIor: { value: DEFAULTS.ior },
    uDepth: { value: DEFAULTS.depth },
    uPoolSize: { value: POOL },
    uCausticGain: { value: DEFAULTS.causticGain },
    uSkylight: { value: DEFAULTS.skylight },
    uAbsorb: { value: DEFAULTS.absorb },
    uWaterColor: { value: new THREE.Color(DEFAULTS.waterColor) },
    uFloorA: { value: new THREE.Color(DEFAULTS.floorA) },
    uFloorB: { value: new THREE.Color(DEFAULTS.floorB) },
    uTile: { value: DEFAULTS.tile },
  }), [])

  // --- 焦線を焼く先。加算で溜めるので浮動小数 ---
  const opts = useMemo(() => ({
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  }), [])
  const fboA = useFBO(CAUSTIC_RES, CAUSTIC_RES, opts)
  const fboB = useFBO(CAUSTIC_RES, CAUSTIC_RES, opts)

  // --- 光子。水面に格子状に撒く ---
  const photons = useMemo(() => {
    const n = Math.round(params.photons)
    const pos = new Float32Array(n * n * 3)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 3
        // 格子のままだと縞が出る。半セルずらして散らす
        pos[i] = ((x + 0.5) / n - 0.5) * POOL
        pos[i + 1] = 0
        pos[i + 2] = ((y + 0.5) / n - 0.5) * POOL
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geo, count: n * n }
  }, [params.photons])
  useEffect(() => () => photons.geo.dispose(), [photons])

  const photonUniforms = useMemo(() => ({
    ...waves,
    ...shared,
    uSize: { value: DEFAULTS.photonSize },
    uUnit: { value: 1 },
  }), [waves, shared])

  const photonMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: photonVertexShader,
    fragmentShader: photonFragmentShader,
    uniforms: photonUniforms,
    // 密度を数えるので加算。深度は要らない
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  }), [photonUniforms])
  useEffect(() => () => photonMat.dispose(), [photonMat])

  /*
   * 焦線は本編とは別の場面に描く。**真下を向いた正射影**で、池の広さを
   * そのままテクスチャに写す。上向きを -z に取っているので、世界の z は
   * 画面では反転する（uv 側で合わせてある）。
   */
  const { photonScene, photonCam, points } = useMemo(() => {
    const s = new THREE.Scene()
    const c = new THREE.OrthographicCamera(-POOL / 2, POOL / 2, POOL / 2, -POOL / 2, 0.1, 100)
    c.up.set(0, 0, -1)
    c.position.set(0, 10, 0)
    c.lookAt(0, 0, 0)
    const pts = new THREE.Points(photons.geo, photonMat)
    pts.frustumCulled = false
    s.add(pts)
    return { photonScene: s, photonCam: c, points: pts }
  }, [photons, photonMat])
  useEffect(() => () => photonScene.remove(points), [photonScene, points])

  // --- にじませる 2 パス ---
  const blurUniforms = useMemo(() => ({
    tSrc: { value: null },
    uTexel: { value: new THREE.Vector2(1 / CAUSTIC_RES, 1 / CAUSTIC_RES) },
    uDir: { value: new THREE.Vector2(1, 0) },
  }), [])
  const blurQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: blurFragmentShader,
    uniforms: blurUniforms,
    depthTest: false,
    depthWrite: false,
  })), [blurUniforms])
  useEffect(() => () => blurQuad.dispose(), [blurQuad])

  // --- 底と水面 ---
  const floorUniforms = useMemo(() => ({ ...shared, tCaustic: { value: null } }), [shared])
  const waterUniforms = useMemo(() => ({
    ...waves,
    ...shared,
    tCaustic: { value: null },
    uSunColor: { value: new THREE.Color(DEFAULTS.sunColor) },
    uSkyColor: { value: new THREE.Color(DEFAULTS.skyColor) },
    uSpecular: { value: DEFAULTS.specular },
    uShine: { value: DEFAULTS.shine },
  }), [waves, shared])

  const floorMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: floorVertexShader,
    fragmentShader: floorFragmentShader,
    uniforms: floorUniforms,
  }), [floorUniforms])
  const waterMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    uniforms: waterUniforms,
    side: THREE.DoubleSide,
  }), [waterUniforms])
  useEffect(() => () => { floorMat.dispose(); waterMat.dispose() }, [floorMat, waterMat])

  // --- 触れて波紋を落とす ---
  const drops = useRef({ next: 0 })
  const addDrop = (x, z, t, strength) => {
    const v = waves.uDrops.value[drops.current.next % DROPS]
    v.set(x, z, t, strength)
    drops.current.next++
  }

  const clear = useMemo(() => new THREE.Color(), [])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    waves.uTime.value = t
    waves.uSwell.value = params.swell
    waves.uRipple.value = params.ripple
    waves.uSwellScale.value = params.swellScale
    waves.uRippleScale.value = params.rippleScale
    waves.uSpeed.value = params.speed
    waves.uDropSpeed.value = params.dropSpeed
    waves.uDropDecay.value = params.dropDecay

    const a = (params.sunAzimuth * Math.PI) / 180
    const e = (params.sunElevation * Math.PI) / 180
    shared.uSun.value.set(Math.cos(e) * Math.cos(a), -Math.sin(e), Math.cos(e) * Math.sin(a)).normalize()
    shared.uIor.value = params.ior
    shared.uDepth.value = params.depth
    shared.uCausticGain.value = params.causticGain
    shared.uSkylight.value = params.skylight
    shared.uAbsorb.value = params.absorb
    shared.uWaterColor.value.set(params.waterColor)
    shared.uFloorA.value.set(params.floorA)
    shared.uFloorB.value.set(params.floorB)
    shared.uTile.value = params.tile
    photonUniforms.uSize.value = params.photonSize
    /*
     * 1 発ぶんの明るさ。
     *
     * **平らな水面のとき、テクセルの平均がちょうど 1 になるよう決める。**
     * こうしておけば、テクスチャの値がそのまま「平らな水面の何倍明るいか」
     * になり、光子の数や解像度を変えても絵の明るさが動かない。
     *
     * 1 発が塗る面積も勘定に入れる。点は丸く中心が濃いので、実効の重みの
     * 総和は π r² の半分ほど。ここを忘れると、点を大きくしただけで白飛びする。
     */
    const spread = (Math.PI * params.photonSize * params.photonSize) / 8
    photonUniforms.uUnit.value = params.brightness
      * (CAUSTIC_RES * CAUSTIC_RES) / (photons.count * Math.max(0.25, spread))
    waterUniforms.uSunColor.value.set(params.sunColor)
    waterUniforms.uSkyColor.value.set(params.skyColor)
    waterUniforms.uSpecular.value = params.specular
    waterUniforms.uShine.value = params.shine

    if (params.rain > 0 && Math.random() < params.rain * delta) {
      addDrop((Math.random() - 0.5) * POOL, (Math.random() - 0.5) * POOL, t, 0.5 + Math.random() * 0.5)
    }

    const { gl: r, scene, camera } = state
    r.getClearColor(clear)
    const alpha = r.getClearAlpha()

    // 1. 光子を撒いて数える
    r.setRenderTarget(fboA)
    r.setClearColor(0x000000, 1)
    r.clear(true, false, false)
    r.render(photonScene, photonCam)

    // 2. にじませる。横 → 縦
    blurUniforms.tSrc.value = fboA.texture
    blurUniforms.uDir.value.set(1, 0)
    r.setRenderTarget(fboB)
    blurQuad.render(r)
    blurUniforms.tSrc.value = fboB.texture
    blurUniforms.uDir.value.set(0, 1)
    r.setRenderTarget(fboA)
    blurQuad.render(r)

    r.setRenderTarget(null)
    r.setClearColor(clear, alpha)

    floorUniforms.tCaustic.value = fboA.texture
    waterUniforms.tCaustic.value = fboA.texture

    r.render(scene, camera)
  }, 1)

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -params.depth, 0]}
        material={floorMat}
      >
        <planeGeometry args={[POOL * 2.2, POOL * 2.2]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        material={waterMat}
        onPointerDown={(e) => {
          addDrop(e.point.x, e.point.z, e.ray ? performance.now() / 1000 : 0, 1)
        }}
      >
        <planeGeometry args={[POOL, POOL, WATER_SEG, WATER_SEG]} />
      </mesh>
    </>
  )
}

export default function CausticsPool() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Water: folder({
      depth: { value: DEFAULTS.depth, min: 0.5, max: 6, step: 0.1 },
      swell: { value: DEFAULTS.swell, min: 0, max: 0.4, step: 0.005 },
      ripple: { value: DEFAULTS.ripple, min: 0, max: 0.15, step: 0.002 },
      swellScale: { value: DEFAULTS.swellScale, min: 0.2, max: 3, step: 0.05, label: 'swell scale' },
      rippleScale: { value: DEFAULTS.rippleScale, min: 1, max: 12, step: 0.2, label: 'ripple scale' },
      speed: { value: DEFAULTS.speed, min: 0, max: 3, step: 0.05 },
      ior: { value: DEFAULTS.ior, min: 1.0, max: 1.8, step: 0.01 },
    }),
    Caustics: folder({
      photons: { value: DEFAULTS.photons, min: 96, max: 384, step: 32, label: 'grid' },
      photonSize: { value: DEFAULTS.photonSize, min: 1, max: 6, step: 0.5, label: 'photon px' },
      brightness: { value: DEFAULTS.brightness, min: 0, max: 4, step: 0.05 },
      causticGain: { value: DEFAULTS.causticGain, min: 0, max: 3, step: 0.05, label: 'sun share' },
      skylight: { value: DEFAULTS.skylight, min: 0, max: 1, step: 0.02, label: 'skylight' },
    }),
    Drops: folder({
      dropSpeed: { value: DEFAULTS.dropSpeed, min: 0.2, max: 6, step: 0.1, label: 'ring speed' },
      dropDecay: { value: DEFAULTS.dropDecay, min: 0.1, max: 4, step: 0.05, label: 'decay' },
      rain: { value: DEFAULTS.rain, min: 0, max: 8, step: 0.2 },
    }),
    Light: folder({
      sunAzimuth: { value: DEFAULTS.sunAzimuth, min: 0, max: 360, step: 1, label: 'sun az' },
      sunElevation: { value: DEFAULTS.sunElevation, min: 10, max: 90, step: 1, label: 'sun el' },
      specular: { value: DEFAULTS.specular, min: 0, max: 4, step: 0.05 },
      shine: { value: DEFAULTS.shine, min: 8, max: 400, step: 4 },
      absorb: { value: DEFAULTS.absorb, min: 0, max: 1.2, step: 0.02 },
    }),
    Look: folder({
      waterColor: { value: DEFAULTS.waterColor, label: 'water' },
      floorA: { value: DEFAULTS.floorA, label: 'tile' },
      floorB: { value: DEFAULTS.floorB, label: 'grout' },
      skyColor: { value: DEFAULTS.skyColor, label: 'sky' },
      sunColor: { value: DEFAULTS.sunColor, label: 'sun' },
      tile: { value: DEFAULTS.tile, min: 0.2, max: 4, step: 0.1, label: 'tile scale' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    {/*
      * 画素ごとに波の式を解くので、この例だけ倍率の上限を下げる。
      * Retina の 2 倍で 4 倍の面積を計算しても、水の絵はほとんど変わらない。
      */}
    <Canvas camera={{ position: [0.5, 7.2, 12.5], fov: 40 }} dpr={[1, 1.6]}>
      <color attach="background" args={[params.skyColor]} />
      <Pool params={params} />
      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0, -params.depth * 0.4, 0]}
        minPolarAngle={0.15}
        maxPolarAngle={1.45}
        minDistance={5}
        maxDistance={24}
      />
    </Canvas>
  )
}
