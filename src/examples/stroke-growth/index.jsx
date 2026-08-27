import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder, button } from 'leva'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Stroke, SEGS, buildSplineUniforms, resample } from './stroke'
import { stemVertexShader, stemFragmentShader } from './glsl/catmull'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/** ドラッグ面。真正面（0,0,1）だと茎が板に見えるので、手前に倒しておく */
const PICK_NORMAL = new THREE.Vector3(0, -0.5, 1).normalize()

/** 根元の落ち影。放射グラデーションを 1 枚だけ焼いて使い回す */
function makeShadowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(0,0,0,0.55)')
  grd.addColorStop(0.55, 'rgba(0,0,0,0.22)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

let nextId = 1

function createPlant(origin, params) {
  const stroke = new Stroke(params.segLength)
  stroke.step(origin.clone())
  return {
    id: nextId++,
    stroke,
    nodes: Array.from({ length: SEGS + 1 }, () => origin.clone()),
    iv: Array.from({ length: SEGS * 4 }, () => new THREE.Vector4()),
    nrm: Array.from({ length: SEGS + 1 }, () => new THREE.Vector3(0, 0, 1)),
    smooth: origin.clone(),
    grow: 0,
    opening: 0,
    bloomed: false,
    drawing: true,
    hue: Math.random(),
    phase: Math.PI * Math.random(),
  }
}

/** 茎 1 本。ジオメトリは全個体で共有し、uniform だけ個別に持つ */
function Stem({ plant, params, geometry }) {
  const camera = useThree((s) => s.camera)

  const uniforms = useMemo(
    () => ({
      uSplineIv: { value: plant.iv },
      uSplineNrm: { value: plant.nrm },
      uSplineParams: { value: new THREE.Vector2(0, 1) },
      uRadius: { value: params.radius },
      uTaper: { value: params.taper },
      uGrow: { value: 0 },
      uColorBase: { value: new THREE.Color(params.colorBase) },
      uColorTip: { value: new THREE.Color(params.colorTip) },
      uLightDir: { value: new THREE.Vector3(0.4, 0.9, 0.4).normalize() },
      uCameraPos: { value: new THREE.Vector3() },
    }),
    // 初期値だけ。以後は useFrame から毎フレーム書き換える
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plant],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: stemVertexShader,
        fragmentShader: stemFragmentShader,
        uniforms,
        side: THREE.DoubleSide,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    uniforms.uRadius.value = params.radius
    uniforms.uTaper.value = params.taper
    uniforms.uGrow.value = plant.grow
    uniforms.uColorBase.value.set(params.colorBase)
    uniforms.uColorTip.value.set(params.colorTip)
    uniforms.uCameraPos.value.copy(camera.position)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

/** 花。開花は 1 本のパラメータで、花弁ごとに時間差をつける */
function Flower({ plant, params }) {
  const group = useRef(null)
  const petals = useRef([])

  const count = params.petals
  const items = useMemo(() => Array.from({ length: count }, (_, i) => i), [count])

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0 }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const coreMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 }),
    [],
  )
  useEffect(() => () => coreMaterial.dispose(), [coreMaterial])

  useFrame(() => {
    // setHSL の既定は作業色空間（リニア）。sRGB を明示しないと彩度が抜ける
    material.color.setHSL(
      (params.hueBase + plant.hue * params.hueSpread) % 1,
      0.68,
      0.58,
      THREE.SRGBColorSpace,
    )
    coreMaterial.color.set(params.coreColor)

    const g = group.current
    if (!g) return

    // 先端の位置と向きを、再サンプルした節点から拾う
    const t = THREE.MathUtils.clamp(plant.grow, 0, 1) * SEGS
    const i = Math.min(Math.floor(t), SEGS - 1)
    const f = t - i
    const a = plant.nodes[i]
    const b = plant.nodes[i + 1]
    g.position.lerpVectors(a, b, f)

    const dir = b.clone().sub(a)
    if (dir.lengthSq() > 1e-8) {
      dir.normalize()
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    }

    const open = plant.opening
    g.scale.setScalar(THREE.MathUtils.lerp(0.05, 1, open) * params.flowerScale)

    petals.current.forEach((p, k) => {
      if (!p) return
      // 花弁ごとに遅れを入れる。一斉に開くと機械的に見える
      const delay = (k / Math.max(count, 1)) * 0.35
      const local = THREE.MathUtils.clamp((open - delay) / (1 - delay + 1e-4), 0, 1)
      const eased = 1 - Math.pow(1 - local, 3)
      p.rotation.x = THREE.MathUtils.lerp(0.12, 1.28, eased)
      p.scale.setScalar(THREE.MathUtils.lerp(0.4, 1, eased))
    })
  })

  return (
    <group ref={group}>
      {items.map((i) => (
        <group key={i} rotation={[0, (i / count) * Math.PI * 2, 0]}>
          <group ref={(el) => (petals.current[i] = el)} position={[0, 0.02, 0]}>
            {/* 花弁。球の一部を縦に伸ばして平たく潰すと、丸い塊でなく花弁に見える */}
            <mesh position={[0, 0.16, 0.07]} scale={[0.62, 1.7, 0.3]} material={material}>
              <sphereGeometry args={[0.11, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            </mesh>
          </group>
        </group>
      ))}
      <mesh material={coreMaterial} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[0.062, 16, 12]} />
      </mesh>
    </group>
  )
}

function Garden({ params }) {
  const { camera, gl } = useThree()
  const [plants, setPlants] = useState([])
  const active = useRef(null)
  const idle = useRef(0)

  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 12, 64, true)
    g.rotateX(Math.PI / 2)
    g.translate(0, 0, 0.5) // z を 0..1 に
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100)
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const ground = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const shadowTex = useMemo(() => makeShadowTexture(), [])
  useEffect(() => () => shadowTex.dispose(), [shadowTex])

  /** 任意の平面へレイを落とす */
  const pickOn = useCallback(
    (plane, clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(plane, hit) ? hit : null
    },
    [camera, gl, ndc, raycaster, hit],
  )

  const finish = useCallback((plant) => {
    if (!plant) return
    plant.drawing = false
    // 短すぎる入力は捨てる。これを忘れるとクリックのたびに極小の花が量産される
    if (plant.stroke.length < 0.5) {
      setPlants((prev) => prev.filter((p) => p.id !== plant.id))
    } else {
      plant.bloomed = true
    }
  }, [])

  useEffect(() => {
    const el = gl.domElement

    const down = (e) => {
      // 根元は必ず地面の上。押した場所を地面へ落として決める
      ground.constant = -params.groundY
      const root = pickOn(ground, e.clientX, e.clientY)
      if (!root) return
      idle.current = 0

      const origin = root.clone()
      origin.y = params.groundY
      const plant = createPlant(origin, params)
      // ドラッグ面は根元を通す。そうしないと茎が地面から離れて生える
      plant.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(PICK_NORMAL, origin)
      active.current = plant
      setPlants((prev) => [...prev.slice(-(params.maxPlants - 1)), plant])
    }

    const move = (e) => {
      idle.current = 0
      const plant = active.current
      if (!plant) return
      const p = pickOn(plant.plane, e.clientX, e.clientY)
      if (!p) return
      const t = p.clone()
      // 地面より下へは描かせない
      t.y = Math.max(t.y, params.groundY)
      plant.target = t
    }

    const up = () => {
      finish(active.current)
      active.current = null
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    // 画面外へ出たままだとストロークが終わらない
    el.addEventListener('pointerleave', up)

    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointerleave', up)
    }
  }, [gl, pickOn, ground, finish, params])

  // 放置していると自分で描く。触っていない状態で空の画面を見せない
  const demo = useRef({ t: 0, plant: null })

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30)
    idle.current += dt

    if (params.autoDemo && !active.current) {
      const d = demo.current
      if (!d.plant && idle.current > params.idleDelay) {
        const x = (Math.random() - 0.5) * 3.6
        const z = (Math.random() - 0.5) * 1.6
        const origin = new THREE.Vector3(x, params.groundY, z)
        d.plant = createPlant(origin, params)
        d.plant.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(PICK_NORMAL, origin)
        d.t = 0
        setPlants((prev) => [...prev.slice(-(params.maxPlants - 1)), d.plant])
      }
      if (d.plant) {
        d.t += dt
        const p = d.plant
        const o = p.stroke.points[0]
        // 上へ伸びつつ左右に揺れる。手で描いた軌跡に近い形にする
        const s = d.t * params.demoSpeed
        // 横揺れは立ち上がりで 0 にする。根元でいきなり横へ飛ぶのを防ぐ
        const ramp = Math.min(1, s * 1.4)
        p.target = new THREE.Vector3(
          o.x + Math.sin(s * 1.7 + p.phase) * 0.5 * ramp,
          o.y + s,
          o.z + Math.sin(s * 1.1 + p.phase * 2.0) * 0.35 * ramp,
        )
        if (s > params.demoLength) {
          finish(p)
          d.plant = null
          idle.current = 0
        }
      }
    }

    for (const plant of plants) {
      // 生の入力は使わない。指数追従で滑らかにしてからストロークへ渡す
      if (plant.target) {
        const k = 1 - Math.exp(-params.smoothing * dt)
        plant.smooth.lerp(plant.target, k)
      }
      if (plant.drawing) plant.stroke.step(plant.smooth)

      resample(plant.stroke.points, plant.nodes)
      buildSplineUniforms(plant.nodes, plant.iv, plant.nrm)

      // 進行度が上がるほど追従を鈍らせる。終端が自然に詰まる
      const d = Math.min(plant.stroke.length / params.maxLength, 1)
      const ease = Math.pow(1 - d, 0.6)
      plant.grow += (1 - plant.grow) * Math.min(1, ease * params.growSpeed * dt + 0.02)

      // 一定以上伸びたら、離すのを待たずに咲き始める
      if (!plant.bloomed && plant.stroke.length > params.bloomAt) plant.bloomed = true
      if (plant.bloomed) {
        plant.opening = Math.min(1, plant.opening + dt / Math.max(params.bloomTime, 0.1))
      }
    }
  })

  return (
    <>
      {/* 地面。ここから生える */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, params.groundY, 0]} receiveShadow={false}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={params.groundColor} roughness={0.95} metalness={0} />
      </mesh>

      {plants.map((p) => (
        <group key={p.id}>
          {/* 根元の落ち影。接地しているように見せる */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[p.stroke.points[0].x, params.groundY + 0.004, p.stroke.points[0].z]}
          >
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
          </mesh>
          <Stem plant={p} params={params} geometry={geometry} />
          <Flower plant={p} params={params} />
        </group>
      ))}
    </>
  )
}

export default function StrokeGrowth() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Stroke: folder({
      segLength: { value: DEFAULTS.segLength, min: 0.04, max: 0.4, step: 0.01, label: 'seg' },
      smoothing: { value: DEFAULTS.smoothing, min: 1, max: 20, step: 0.5 },
      maxLength: { value: DEFAULTS.maxLength, min: 1, max: 12, step: 0.2, label: 'max len' },
      growSpeed: { value: DEFAULTS.growSpeed, min: 0.5, max: 12, step: 0.1, label: 'grow' },
    }),
    Plant: folder({
      radius: { value: DEFAULTS.radius, min: 0.01, max: 0.12, step: 0.002 },
      taper: { value: DEFAULTS.taper, min: 0, max: 0.9, step: 0.02 },
      petals: { value: DEFAULTS.petals, min: 3, max: 12, step: 1 },
      flowerScale: { value: DEFAULTS.flowerScale, min: 0.3, max: 3, step: 0.05, label: 'flower' },
      bloomAt: { value: DEFAULTS.bloomAt, min: 0.5, max: 6, step: 0.1, label: 'bloom at' },
      bloomTime: { value: DEFAULTS.bloomTime, min: 0.3, max: 6, step: 0.1, label: 'bloom sec' },
      maxPlants: { value: DEFAULTS.maxPlants, min: 1, max: 24, step: 1, label: 'max' },
      groundY: { value: DEFAULTS.groundY, min: -3, max: 0, step: 0.05, label: 'ground y' },
    }),
    Look: folder({
      colorBase: { value: DEFAULTS.colorBase, label: 'stem base' },
      colorTip: { value: DEFAULTS.colorTip, label: 'stem tip' },
      hueBase: { value: DEFAULTS.hueBase, min: 0, max: 1, step: 0.01, label: 'hue' },
      hueSpread: { value: DEFAULTS.hueSpread, min: 0, max: 1, step: 0.01, label: 'hue var' },
      coreColor: { value: DEFAULTS.coreColor, label: 'core' },
      groundColor: { value: DEFAULTS.groundColor, label: 'ground' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
    Demo: folder({
      autoDemo: { value: DEFAULTS.autoDemo, label: 'auto' },
      idleDelay: { value: DEFAULTS.idleDelay, min: 0.2, max: 6, step: 0.1, label: 'delay' },
      demoSpeed: { value: DEFAULTS.demoSpeed, min: 0.2, max: 4, step: 0.1, label: 'speed' },
      demoLength: { value: DEFAULTS.demoLength, min: 1, max: 6, step: 0.1, label: 'length' },
      clear: button(() => window.location.reload()),
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas
      camera={{ position: [0, 1.55, 7.4], fov: 42 }}
      dpr={[1, 2]}
      onCreated={({ camera }) => camera.lookAt(0, -0.15, 0)}
    >
      <color attach="background" args={[params.background]} />
      {/* 地面の奥を背景に溶かす */}
      <fogExp2 attach="fog" args={[params.background, 0.055]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[2, 5, 3]} intensity={2.0} />
      <directionalLight position={[-3, 1, -2]} intensity={0.6} color="#9fd0ff" />
      {/* 地面が沈まないよう下からも少し当てる */}
      <hemisphereLight args={['#9fd0ff', '#3a5a44', 0.5]} />
      <Garden params={params} />
    </Canvas>
  )
}
