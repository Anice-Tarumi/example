import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'
import { ENV_MAPS } from '../../shared/env'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createSolver } from './physics'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/** グリッドの 1 辺。最大直径より大きくしないと隣接 27 セルで拾い漏れる */
const CELL = 0.32
const BOUNDS = 6

const tmpMatrix = new THREE.Matrix4()
const tmpVec = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpScale = new THREE.Vector3()

function Bodies({ params }) {
  const { camera, size } = useThree()

  // 体数を変えるとバッファごと作り直す
  const solver = useMemo(
    () => createSolver({ count: params.count, bounds: BOUNDS, cell: CELL }),
    [params.count],
  )

  const mesh = useRef(null)
  const gridMesh = useRef(null)

  const colors = useMemo(() => new Float32Array(params.count * 3), [params.count])
  const colorSlow = useMemo(() => new THREE.Color(params.colorSlow), [params.colorSlow])
  const colorFast = useMemo(() => new THREE.Color(params.colorFast), [params.colorFast])

  // 初期配置。半径や初速の設定が変わったら撒き直す
  useEffect(() => {
    solver.reset(params.radiusMin, params.radiusMax, 1.2, params.container * 0.92, params.spin)
  }, [solver, params.radiusMin, params.radiusMax, params.container, params.spin])

  // ---- カーソル。カメラ方向に垂直な、原点を通る平面へ落とす ----
  const pointer = useRef({ x: 0, y: 0, z: 0, active: false })
  const plane = useMemo(() => new THREE.Plane(), [])
  const ray = useMemo(() => new THREE.Raycaster(), [])

  useEffect(() => {
    const el = document.body
    const leave = () => (pointer.current.active = false)
    el.addEventListener('pointerleave', leave)
    return () => el.removeEventListener('pointerleave', leave)
  }, [])

  useFrame((state, rawDelta) => {
    // タブ復帰などで巨大な dt が来ると一気に破綻する
    const delta = Math.min(rawDelta, 1 / 30)

    // カーソル位置を世界座標へ
    const p = state.pointer
    if (Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1) {
      camera.getWorldDirection(tmpVec)
      plane.setFromNormalAndCoplanarPoint(tmpVec, new THREE.Vector3(0, 0, 0))
      ray.setFromCamera(p, camera)
      const hit = ray.ray.intersectPlane(plane, tmpVec)
      if (hit) {
        pointer.current.x = hit.x
        pointer.current.y = hit.y
        pointer.current.z = hit.z
        pointer.current.active = true
      }
    }

    const sub = Math.max(1, params.substeps)
    const dt = delta / sub
    const opts = {
      dt,
      gravity: params.gravity,
      downward: params.downward,
      damping: params.damping,
      restitution: params.restitution,
      container: params.container,
      floor: params.floor ? -params.container * 0.72 : null,
      pointer: pointer.current,
      pointerRadius: params.pointerRadius,
      pointerForce: params.pointerForce,
    }
    for (let s = 0; s < sub; s++) solver.step(opts)

    // ---- 描画へ反映 ----
    const m = mesh.current
    if (!m) return

    const { pos, vel, radius, count } = solver
    const invSpeed = 1 / Math.max(params.speedScale, 1e-3)
    tmpQuat.identity()

    for (let i = 0; i < count; i++) {
      const ix = i * 3
      tmpVec.set(pos[ix], pos[ix + 1], pos[ix + 2])
      const r = radius[i]
      tmpScale.set(r, r, r)
      tmpMatrix.compose(tmpVec, tmpQuat, tmpScale)
      m.setMatrixAt(i, tmpMatrix)

      // 速い球ほど明るい色。衝突の伝わり方が目で追える
      const sp = Math.sqrt(vel[ix] * vel[ix] + vel[ix + 1] * vel[ix + 1] + vel[ix + 2] * vel[ix + 2])
      const t = Math.min(1, sp * invSpeed)
      colors[ix] = colorSlow.r + (colorFast.r - colorSlow.r) * t
      colors[ix + 1] = colorSlow.g + (colorFast.g - colorSlow.g) * t
      colors[ix + 2] = colorSlow.b + (colorFast.b - colorSlow.b) * t
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true

    // ---- ブロードフェーズの可視化。中身のあるセルだけ描く ----
    const g = gridMesh.current
    if (g) {
      if (!params.showGrid) {
        g.count = 0
      } else {
        const { dim, occupied } = solver
        const occ = Math.min(solver.occupiedCount(), g.instanceMatrix.count)
        let n = 0
        for (let oi = 0; oi < occ; oi++) {
          const c = occupied[oi]
          const cx = c % dim
          const cy = ((c / dim) | 0) % dim
          const cz = (c / (dim * dim)) | 0
          tmpVec.set(
            (cx + 0.5) * CELL - BOUNDS,
            (cy + 0.5) * CELL - BOUNDS,
            (cz + 0.5) * CELL - BOUNDS,
          )
          tmpScale.set(CELL, CELL, CELL)
          tmpMatrix.compose(tmpVec, tmpQuat, tmpScale)
          g.setMatrixAt(n++, tmpMatrix)
        }
        g.count = n
        g.instanceMatrix.needsUpdate = true
      }
    }

    void size
  })

  return (
    <>
      <instancedMesh
        ref={(el) => {
          mesh.current = el
          if (el && !el.instanceColor) {
            const attr = new THREE.InstancedBufferAttribute(colors, 3)
            attr.setUsage(THREE.DynamicDrawUsage)
            el.instanceColor = attr
          }
        }}
        args={[undefined, undefined, params.count]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 8]} />
        {/*
          vertexColors は付けない。geometry の color 属性を要求されるが持っていないので
          (0,0,0) が乗って真っ黒になる。instanceColor だけで色は付く
        */}
        <meshStandardMaterial metalness={0.25} roughness={0.42} />
      </instancedMesh>

      {/* 占有セル。境界だけ見せたいので wireframe */}
      <instancedMesh ref={gridMesh} args={[undefined, undefined, 6000]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#4f7fff" wireframe transparent opacity={0.16} />
      </instancedMesh>

      {/* 容器。内側から見る想定なので裏面を描く */}
      <mesh>
        <sphereGeometry args={[params.container, 48, 32]} />
        <meshBasicMaterial color="#243040" wireframe transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>
    </>
  )
}

export default function PhysicsPlayground() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    World: folder({
      count: { value: DEFAULTS.count, min: 100, max: 3000, step: 50 },
      gravity: { value: DEFAULTS.gravity, min: 0, max: 14, step: 0.1, label: 'center g' },
      downward: { value: DEFAULTS.downward, min: 0, max: 20, step: 0.2, label: 'down g' },
      container: { value: DEFAULTS.container, min: 2, max: 5.6, step: 0.05 },
      floor: { value: DEFAULTS.floor },
    }),
    Bodies: folder({
      radiusMin: { value: DEFAULTS.radiusMin, min: 0.03, max: 0.14, step: 0.005, label: 'r min' },
      radiusMax: { value: DEFAULTS.radiusMax, min: 0.04, max: 0.15, step: 0.005, label: 'r max' },
      restitution: { value: DEFAULTS.restitution, min: 0, max: 0.9, step: 0.01, label: 'bounce' },
      damping: { value: DEFAULTS.damping, min: 0, max: 1.2, step: 0.01 },
      spin: { value: DEFAULTS.spin, min: 0, max: 1.2, step: 0.02, label: 'init spin' },
      substeps: { value: DEFAULTS.substeps, min: 1, max: 5, step: 1 },
    }),
    Cursor: folder({
      pointerRadius: { value: DEFAULTS.pointerRadius, min: 0.4, max: 3.5, step: 0.05, label: 'radius' },
      pointerForce: { value: DEFAULTS.pointerForce, min: 0, max: 200, step: 2, label: 'force' },
    }),
    Look: folder({
      colorSlow: { value: DEFAULTS.colorSlow, label: 'slow' },
      colorFast: { value: DEFAULTS.colorFast, label: 'fast' },
      speedScale: { value: DEFAULTS.speedScale, min: 0.5, max: 8, step: 0.1, label: 'speed max' },
      showGrid: { value: DEFAULTS.showGrid, label: 'broadphase' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 1.6, 11], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#080b11']} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 7, 5]} intensity={1.6} />
      <directionalLight position={[-5, -3, -4]} intensity={0.5} color="#7fa6ff" />

      {/* 金属の映り込みは実写の環境が要る。板で代用すると板が映る */}
      <Suspense fallback={null}>
        <Environment files={ENV_MAPS.studio.url} />
      </Suspense>

      <Bodies params={params} />

      <OrbitControls enablePan={false} minDistance={4} maxDistance={20} />
    </Canvas>
  )
}
