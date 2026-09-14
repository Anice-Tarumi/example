import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { useControls, folder, button } from 'leva'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createCloth, applyPins, step, nearest, PINS } from './cloth'
import { makeWeaveNormal } from './weave'
import { ENV_MAPS } from '../../shared/env'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/**
 * 布。XPBD の拘束投影で解く。
 *
 * 物理は `cloth.js` に閉じてある（three に依存しない）。ここは描画と操作。
 */

/** 四角 1 枚を作る 4 本の辺。1 本でも切れたら、その四角は落とす */
function quadEdges(cols, x, y) {
  const i = y * cols + x
  return [
    [i, i + 1],
    [i + cols, i + cols + 1],
    [i, i + cols],
    [i + 1, i + 1 + cols],
  ]
}

function Cloth({ params, cloth }) {
  const mesh = useRef(null)
  // 織り目。単色の面はどれだけ揺れても紙かゴムに見える
  const weave = useMemo(() => makeWeaveNormal(128, 8, 1), [])
  useEffect(() => () => weave.dispose(), [weave])
  const { camera, gl } = useThree()
  const controls = useThree((s) => s.controls)

  const geometry = useMemo(() => {
    const { cols, rows } = cloth
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * rows * 3), 3))
    const uv = new Float32Array(cols * rows * 2)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        uv[(y * cols + x) * 2] = x / (cols - 1)
        uv[(y * cols + x) * 2 + 1] = 1 - y / (rows - 1)
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array((cols - 1) * (rows - 1) * 6), 1))
    return geo
  }, [cloth])
  useEffect(() => () => geometry.dispose(), [geometry])

  /*
   * 辺 → 拘束番号の対応。破れたときに「その四角の辺が生きているか」を
   * 引くのに使う。毎フレーム線形探索すると、四角の数だけ拘束を舐めることに
   * なって重い。
   */
  const edgeMap = useMemo(() => {
    const map = new Map()
    for (let k = 0; k < cloth.ia.length; k++) {
      if (cloth.kind[k] !== 0) continue
      map.set(cloth.ia[k] * cloth.pos.length + cloth.ib[k], k)
    }
    return map
  }, [cloth])

  const edgeOf = (a, b) => edgeMap.get(a * cloth.pos.length + b) ?? edgeMap.get(b * cloth.pos.length + a)

  /** 生きている四角だけで索引を組み直す */
  const rebuildIndex = useMemo(() => () => {
    const { cols, rows, alive } = cloth
    const idx = geometry.index.array
    let n = 0
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        let ok = true
        for (const [a, b] of quadEdges(cols, x, y)) {
          const k = edgeOf(a, b)
          if (k !== undefined && !alive[k]) { ok = false; break }
        }
        if (!ok) continue
        const i = y * cols + x
        idx[n++] = i
        idx[n++] = i + cols
        idx[n++] = i + 1
        idx[n++] = i + 1
        idx[n++] = i + cols
        idx[n++] = i + cols + 1
      }
    }
    geometry.index.needsUpdate = true
    geometry.setDrawRange(0, n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloth, geometry])

  useEffect(() => { rebuildIndex() }, [rebuildIndex])

  // --- 掴む ---
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const dragging = useRef(false)

  useEffect(() => {
    const el = gl.domElement

    const toNdc = (e) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }

    const down = (e) => {
      if (e.button !== 0) return
      toNdc(e)
      raycaster.setFromCamera(ndc, camera)
      const h = raycaster.intersectObject(mesh.current, false)[0]
      if (!h) return
      const { index, dist } = nearest(cloth, h.point.x, h.point.y, h.point.z)
      // 遠い点を掴むと、触っていない場所が飛んでくる
      if (dist > cloth.size / cloth.cols * 2.5) return
      cloth.grabbed = index
      cloth.grabTarget[0] = h.point.x
      cloth.grabTarget[1] = h.point.y
      cloth.grabTarget[2] = h.point.z
      /*
       * 掴んだ点を通る**カメラに正対した面**の上で引く。奥行きを決めずに
       * 引くと、視線方向に無限に伸びるか、まったく動かないかになる。
       */
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), h.point)
      dragging.current = true
      // 掴んでいる間はカメラを止める。同じドラッグで視点まで回ると操作にならない
      if (controls) controls.enabled = false
      el.setPointerCapture?.(e.pointerId)
    }

    const move = (e) => {
      if (!dragging.current) return
      toNdc(e)
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return
      cloth.grabTarget[0] = hit.x
      cloth.grabTarget[1] = hit.y
      cloth.grabTarget[2] = hit.z
    }

    const up = () => {
      if (!dragging.current) return
      dragging.current = false
      cloth.grabbed = -1
      if (controls) controls.enabled = true
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [camera, gl, cloth, controls, raycaster, plane, hit, ndc])

  const sphere = useRef(null)
  const time = useRef(0)

  useFrame((state, delta) => {
    // 落ちたフレームぶんをまとめて進めない。破綻したまま固まる
    const dt = Math.min(Math.max(delta, 1 / 240), 1 / 30)
    time.current += dt

    const sy = params.sphereOn
      ? params.sphereY + Math.sin(time.current * params.sphereSpeed) * params.sphereSwing
      : 0
    if (sphere.current) {
      sphere.current.visible = params.sphereOn
      sphere.current.position.set(0, sy, params.sphereZ)
      sphere.current.scale.setScalar(params.sphereR)
    }

    step(cloth, dt, {
      substeps: params.substeps,
      strainPasses: params.strainPasses,
      maxStrain: params.maxStrain,
      gravity: params.gravity,
      windX: params.windX,
      windZ: params.windZ,
      damping: params.damping,
      time: time.current,
      structural: params.structural,
      shear: params.shear,
      bend: params.bend,
      sphere: [0, sy, params.sphereZ],
      sphereR: params.sphereOn ? params.sphereR : 0,
      floor: params.floor,
      friction: params.friction,
      tear: params.tear,
      tearStrain: params.tearStrain,
    })

    const pos = geometry.attributes.position
    pos.array.set(cloth.pos)
    pos.needsUpdate = true
    // 面の向きが変わるので毎フレーム取り直す。しないと影が固まったままになる
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()

    if (cloth.torn) {
      cloth.torn = false
      rebuildIndex()
    }

  })

  return (
    <>
      <mesh ref={mesh} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={params.color}
          roughness={params.roughness}
          metalness={params.metalness}
          side={THREE.DoubleSide}
          // 影も両面で落とす。既定は表だけで、裏返った所の影が抜ける
          shadowSide={THREE.DoubleSide}
          normalMap={weave}
          normalScale={new THREE.Vector2(params.weave, params.weave)}
          sheen={params.sheen}
          sheenColor={params.color}
        />
      </mesh>
      {/* 床。落ちた布が着く場所が無いと、宙に浮いた実験に見える */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, params.floor - 0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={params.floorColor} roughness={0.95} metalness={0} />
      </mesh>
      <mesh ref={sphere} castShadow>
        <sphereGeometry args={[1, 48, 32]} />
        <meshStandardMaterial color={params.sphereColor} roughness={0.25} metalness={0.6} />
      </mesh>
    </>
  )
}

export default function ClothXpbd() {
  // 作り直しの合図。留め方や格子を変えなくても畳み直せるようにする
  const [seed, setSeed] = useState(0)

  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Cloth: folder({
      grid: { value: DEFAULTS.grid, min: 16, max: 48, step: 4 },
      pin: { value: DEFAULTS.pin, options: PINS },
      slack: { value: DEFAULTS.slack, min: 0, max: 0.45, step: 0.01, label: 'slack' },
      flat: { value: DEFAULTS.flat, label: 'lay flat' },
      dropHeight: { value: DEFAULTS.dropHeight, min: 0, max: 4, step: 0.1, label: 'drop from' },
      substeps: { value: DEFAULTS.substeps, min: 1, max: 20, step: 1 },
      strainPasses: { value: DEFAULTS.strainPasses, min: 0, max: 8, step: 1, label: 'strain passes' },
      maxStrain: { value: DEFAULTS.maxStrain, min: 0, max: 0.2, step: 0.005, label: 'max strain' },
    }),
    Material: folder({
      shear: { value: DEFAULTS.shear, min: 0, max: 1e-4, step: 1e-6, label: 'shear give' },
      bend: { value: DEFAULTS.bend, min: 0, max: 2e-3, step: 1e-5, label: 'bend give' },
      damping: { value: DEFAULTS.damping, min: 0, max: 6, step: 0.1 },
      friction: { value: DEFAULTS.friction, min: 0, max: 1, step: 0.05, label: 'friction' },
    }),
    Forces: folder({
      gravity: { value: DEFAULTS.gravity, min: -25, max: 0, step: 0.5 },
      windX: { value: DEFAULTS.windX, min: -20, max: 20, step: 0.5, label: 'wind x' },
      windZ: { value: DEFAULTS.windZ, min: -20, max: 20, step: 0.5, label: 'wind z' },
      floor: { value: DEFAULTS.floor, min: -6, max: 0, step: 0.1 },
    }),
    Tear: folder({
      tear: { value: DEFAULTS.tear },
      tearStrain: { value: DEFAULTS.tearStrain, min: 0.05, max: 1.5, step: 0.05, label: 'tear at' },
    }),
    Obstacle: folder({
      sphereOn: { value: DEFAULTS.sphereOn, label: 'sphere' },
      sphereR: { value: DEFAULTS.sphereR, min: 0.2, max: 1.6, step: 0.05, label: 'radius' },
      sphereY: { value: DEFAULTS.sphereY, min: -3, max: 1, step: 0.1, label: 'height' },
      sphereZ: { value: DEFAULTS.sphereZ, min: -1.5, max: 1.5, step: 0.05, label: 'depth' },
      sphereSwing: { value: DEFAULTS.sphereSwing, min: 0, max: 1.5, step: 0.05, label: 'swing' },
      sphereSpeed: { value: DEFAULTS.sphereSpeed, min: 0, max: 3, step: 0.1, label: 'swing speed' },
    }),
    Look: folder({
      color: { value: DEFAULTS.color },
      roughness: { value: DEFAULTS.roughness, min: 0, max: 1, step: 0.05 },
      weave: { value: DEFAULTS.weave, min: 0, max: 3, step: 0.05, label: 'weave' },
      sheen: { value: DEFAULTS.sheen, min: 0, max: 1, step: 0.05 },
      floorColor: { value: DEFAULTS.floorColor, label: 'floor' },
      metalness: { value: DEFAULTS.metalness, min: 0, max: 1, step: 0.05 },
      sphereColor: { value: DEFAULTS.sphereColor, label: 'sphere tint' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
    Reset: button(() => setSeed((v) => v + 1)),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  /*
   * 布は作り直しが要る条件（格子・留め方・リセット）でだけ作る。
   * 毎フレーム作ると、掴んだ点も破れも消える。
   */
  const cloth = useMemo(() => {
    const c = createCloth({
      cols: params.grid, rows: params.grid, size: 4,
      flat: params.flat, height: params.dropHeight,
    })
    applyPins(c, params.pin, params.slack)
    return c
    // seed は畳み直しの合図。値そのものは使わないが、変わったら作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.grid, params.pin, params.slack, params.flat, params.dropHeight, seed])

  return (
    <Canvas
      shadows
      camera={{ position: [0.6, 1.2, 10.5], fov: 38 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[params.background]} />
      <hemisphereLight intensity={0.35} groundColor="#2b2b33" />
      <directionalLight position={[4, 6, 5]} intensity={1.7} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, -2, -4]} intensity={0.45} color="#89a8ff" />
      <Cloth params={params} cloth={cloth} />
      <Suspense fallback={null}>
        <Environment files={ENV_MAPS.studio.url} />
      </Suspense>
      <OrbitControls enablePan={false} makeDefault target={[0, -0.4, 0]} minDistance={4} maxDistance={20} />
    </Canvas>
  )
}
