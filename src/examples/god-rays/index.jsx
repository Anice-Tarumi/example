import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useFBO } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import {
  quadVertexShader, radialBlurShader, compositeFragmentShader,
  shaftVertexShader, shaftFragmentShader,
} from './glsl/rays'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/** 放射ブラーのサンプル数。シェーダーへ定数として埋めるので変えたら作り直す */
const SAMPLES = 64
/** 光芒を焼く解像度の割合。裾のぼけた絵なので半分で足りる */
const SCALE = 0.5

/** 柱の林。太陽を細かく遮るほど光芒が出る */
function Pillars({ params }) {
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => geo.dispose(), [geo])

  const items = useMemo(() => {
    const out = []
    let s = 0x2f19
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    /*
     * 光芒は**遮る物があって初めて形になる**。林が疎だと、太陽のまわりが
     * ただ白く滲むだけになる。奥ほど細かく、広い範囲に散らす。
     */
    for (let i = 0; i < 46; i++) {
      const x = (rand() - 0.5) * 44
      const z = -3 - rand() * 40
      const h = 3 + rand() * 11
      const w = 0.3 + rand() * 0.8
      out.push({ pos: [x, h / 2, z], scale: [w, h, w * (0.7 + rand() * 0.6)], rot: rand() * 0.6 - 0.3 })
    }

    /*
     * 手前の柱。**光芒の形を決めるのはここ。** 奥の細い柱だけだと、太陽の
     * まわりがぼんやり滲むだけで筋にならない。近くの太い影が halo を裂く。
     */
    for (let i = 0; i < 5; i++) {
      const x = (rand() - 0.5) * 19
      const z = -1 - rand() * 8
      const h = 7 + rand() * 9
      const w = 0.4 + rand() * 0.7
      out.push({ pos: [x, h / 2, z], scale: [w, h, w * (0.8 + rand() * 0.5)], rot: rand() * 0.5 - 0.25 })
    }
    return out
  }, [])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color={params.ground} roughness={0.95} />
      </mesh>
      {items.map((p, i) => (
        <mesh key={i} geometry={geo} position={p.pos} scale={p.scale} rotation={[0, p.rot, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={params.pillar} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function Scene({ params }) {
  const { size } = useThree()
  const sun = useRef(null)
  const shafts = useRef(null)

  // --- 焼き先。遮蔽の下絵 → 放射ブラー → 本編の取り込み ---
  const opts = useMemo(() => ({
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  }), [])
  const w = Math.max(2, Math.round(size.width * SCALE))
  const h = Math.max(2, Math.round(size.height * SCALE))
  const maskFbo = useFBO(w, h, opts)
  const rayFbo = useFBO(w, h, { ...opts, depthBuffer: false })
  const sceneFbo = useFBO(size.width, size.height, opts)

  /** 遮る物を黒く塗る。下絵は「空が白、遮る物が黒」の遮蔽マスク */
  const blackMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x000000 }), [])
  useEffect(() => () => blackMat.dispose(), [blackMat])

  const blurUniforms = useMemo(() => ({
    tMask: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uSunRadius: { value: 0.05 },
    uAspect: { value: 1 },
    uDensity: { value: DEFAULTS.density },
    uDecay: { value: DEFAULTS.decay },
    uWeight: { value: DEFAULTS.weight },
    uExposure: { value: DEFAULTS.exposure },
  }), [])
  const blurQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: radialBlurShader(SAMPLES),
    uniforms: blurUniforms,
    depthTest: false,
    depthWrite: false,
  })), [blurUniforms])
  useEffect(() => () => blurQuad.dispose(), [blurQuad])

  const compUniforms = useMemo(() => ({
    tScene: { value: null },
    tRays: { value: null },
    uColor: { value: new THREE.Color(DEFAULTS.rayColor) },
    uGain: { value: DEFAULTS.gain },
  }), [])
  const compQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: compositeFragmentShader,
    uniforms: compUniforms,
    depthTest: false,
    depthWrite: false,
  })), [compUniforms])
  useEffect(() => () => compQuad.dispose(), [compQuad])

  // --- 板ポリ式の束 ---
  const shaftGeo = useMemo(() => {
    const count = 28
    const base = new THREE.PlaneGeometry(1.1, 1, 1, 1)
    base.translate(0, 0.5, 0)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.attributes = base.attributes
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) seed[i] = i / count + (i % 7) * 0.013
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1))
    geo.instanceCount = count
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200)
    base.dispose()
    return geo
  }, [])
  useEffect(() => () => shaftGeo.dispose(), [shaftGeo])

  const shaftUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uLength: { value: DEFAULTS.shaftLength },
    uSpin: { value: DEFAULTS.shaftSpin },
    uColor: { value: new THREE.Color(DEFAULTS.rayColor) },
    uGain: { value: DEFAULTS.shaftGain },
  }), [])
  const shaftMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: shaftVertexShader,
    fragmentShader: shaftFragmentShader,
    uniforms: shaftUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [shaftUniforms])
  useEffect(() => () => shaftMat.dispose(), [shaftMat])

  const sunWorld = useMemo(() => new THREE.Vector3(), [])
  const projected = useMemo(() => new THREE.Vector3(), [])
  const clearColor = useMemo(() => new THREE.Color(), [])

  useFrame((state) => {
    const { gl, scene, camera, clock } = state
    if (!sun.current) return

    // --- 太陽の位置 ---
    const a = (params.sunAzimuth * Math.PI) / 180
    const e = (params.sunElevation * Math.PI) / 180
    sunWorld.set(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).multiplyScalar(params.sunDistance)
    sun.current.position.copy(sunWorld)
    sun.current.scale.setScalar(params.sunSize)
    sun.current.visible = true

    if (shafts.current) {
      shafts.current.position.copy(sunWorld)
      // 束はカメラへ正対させる。向きが固定だと横から見たとき紙になる
      shafts.current.quaternion.copy(camera.quaternion)
      shafts.current.visible = params.mode !== 'screen'
    }

    shaftUniforms.uTime.value = clock.elapsedTime
    shaftUniforms.uLength.value = params.shaftLength
    shaftUniforms.uSpin.value = params.shaftSpin
    shaftUniforms.uGain.value = params.shaftGain
    shaftUniforms.uColor.value.set(params.rayColor)

    /*
     * 太陽の画面位置。**カメラの後ろにあるときは使えない。**
     * 射影は後ろの点も画面内の座標へ写してしまうので、そのまま使うと
     * 見えない太陽から光芒が伸びる。
     */
    projected.copy(sunWorld).project(camera)
    const behind = projected.z > 1
    const sunUv = new THREE.Vector2(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5)
    // 画面から離れるほど弱める。端で急に消えると不自然
    const off = Math.max(Math.abs(projected.x), Math.abs(projected.y))
    const edgeFade = behind ? 0 : 1 - THREE.MathUtils.smoothstep(off, 1, 2.2)

    const useScreen = params.mode !== 'shafts' && edgeFade > 0.001

    gl.getClearColor(clearColor)
    const alpha = gl.getClearAlpha()
    gl.autoClear = true

    if (useScreen) {
      /*
       * --- 1. 遮蔽マスク ---
       *
       * 白で塗り潰してから、遮る物だけを黒で描く。**太陽はここに描かない。**
       * 光源をメッシュのまま下絵へ混ぜると、上書き用の材質や背景の塗り直しと
       * 絡んで消える。太陽はぼかす側で円として置く。
       *
       * 背景色も外す。`scene.background` に色が入っていると、
       * `autoClear = false` でも `gl.render()` のたびに three が塗り直す。
       */
      const bg = scene.background
      scene.background = null
      sun.current.visible = false

      gl.setRenderTarget(maskFbo)
      gl.setClearColor(0xffffff, 1)
      scene.overrideMaterial = blackMat
      gl.render(scene, camera)
      scene.overrideMaterial = null

      sun.current.visible = true
      scene.background = bg

      // --- 2. 太陽の位置から放射状にぼかす ---
      blurUniforms.tMask.value = maskFbo.texture
      blurUniforms.uSun.value.copy(sunUv)
      /*
       * 見かけの半径。**世界の大きさを距離で割り、縦の画角で正規化する。**
       * 固定値にすると、太陽を近づけたときに光芒の芯だけ取り残される。
       */
      const toCam = camera.position.distanceTo(sunWorld)
      const tan = Math.tan((camera.fov * Math.PI) / 360)
      blurUniforms.uSunRadius.value = params.sunSize / Math.max(0.001, toCam) / (2 * tan)
      blurUniforms.uAspect.value = camera.aspect
      blurUniforms.uDensity.value = params.density
      blurUniforms.uDecay.value = params.decay
      blurUniforms.uWeight.value = params.weight
      blurUniforms.uExposure.value = params.exposure * edgeFade
      gl.setRenderTarget(rayFbo)
      blurQuad.render(gl)
    }

    // --- 3. 本編 ---
    camera.layers.enableAll()
    gl.setClearColor(clearColor, alpha)
    gl.setRenderTarget(useScreen ? sceneFbo : null)
    gl.render(scene, camera)

    if (useScreen) {
      compUniforms.tScene.value = sceneFbo.texture
      compUniforms.tRays.value = rayFbo.texture
      compUniforms.uColor.value.set(params.rayColor)
      compUniforms.uGain.value = params.gain
      gl.setRenderTarget(null)
      compQuad.render(gl)
    }
  }, 1)

  return (
    <>
      <hemisphereLight intensity={0.25} groundColor="#20242c" />
      <directionalLight position={[6, 12, -8]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <Pillars params={params} />

      {/* 太陽。下絵では**これだけ**を描くので層を分ける */}
      <mesh ref={sun}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial color={params.sunColor} />
      </mesh>

      <mesh ref={shafts} geometry={shaftGeo} material={shaftMat} frustumCulled={false} />
    </>
  )
}

export default function GodRays() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    mode: {
      value: DEFAULTS.mode,
      options: { 'Screen space': 'screen', 'Billboard shafts': 'shafts', Both: 'both' },
    },
    Screen: folder({
      density: { value: DEFAULTS.density, min: 0.1, max: 1.5, step: 0.02 },
      decay: { value: DEFAULTS.decay, min: 0.8, max: 1, step: 0.002 },
      weight: { value: DEFAULTS.weight, min: 0, max: 0.2, step: 0.002 },
      exposure: { value: DEFAULTS.exposure, min: 0, max: 2, step: 0.02 },
      gain: { value: DEFAULTS.gain, min: 0, max: 4, step: 0.05 },
    }),
    Shafts: folder({
      shaftLength: { value: DEFAULTS.shaftLength, min: 2, max: 60, step: 1, label: 'length' },
      shaftGain: { value: DEFAULTS.shaftGain, min: 0, max: 2, step: 0.05, label: 'glow' },
      shaftSpin: { value: DEFAULTS.shaftSpin, min: 0, max: 0.6, step: 0.02, label: 'drift' },
    }),
    Sun: folder({
      sunAzimuth: { value: DEFAULTS.sunAzimuth, min: -180, max: 180, step: 1, label: 'azimuth' },
      sunElevation: { value: DEFAULTS.sunElevation, min: -5, max: 70, step: 1, label: 'elevation' },
      sunDistance: { value: DEFAULTS.sunDistance, min: 20, max: 120, step: 1, label: 'distance' },
      sunSize: { value: DEFAULTS.sunSize, min: 0.5, max: 8, step: 0.1, label: 'size' },
    }),
    Look: folder({
      rayColor: { value: DEFAULTS.rayColor, label: 'rays' },
      sunColor: { value: DEFAULTS.sunColor, label: 'sun' },
      pillar: { value: DEFAULTS.pillar },
      ground: { value: DEFAULTS.ground },
      sky: { value: DEFAULTS.sky },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 2.6, 12], fov: 48, near: 0.1, far: 300 }} dpr={[1, 1.75]} shadows>
      <color attach="background" args={[params.sky]} />
      <Scene params={params} />
      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0, 2.5, -4]}
        minPolarAngle={0.2}
        maxPolarAngle={1.5}
        minDistance={5}
        maxDistance={40}
      />
    </Canvas>
  )
}
