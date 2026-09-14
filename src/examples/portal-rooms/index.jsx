import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoomWarm, RoomCold, ROOM } from './rooms'
import { pairMatrix, placeVirtualCamera, obliqueNearPlane, crossed } from './portal'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'
import './styles.css'

/**
 * 窓 B の置き場所。
 *
 * **既定は「向かい合わせ」ではなく「平行」。** 対の変換は
 * `B × rotY(180°) × A⁻¹` なので、B が A と 180° 違う向きなら回転が打ち消し
 * 合って**ただの平行移動**になる。くぐっても向きが変わらない。
 *
 * 横壁に置くと 90° 回る。ポータルとしては正しい挙動だが、初見では
 * 「勝手に向きが変わった」と感じる。見せたいときだけ変種で出す。
 */
const PLACEMENT = {
  parallel: { pos: (R) => [0, 0, R.d / 2 - 0.12], rot: [0, Math.PI, 0] },
  turn: { pos: (R) => [R.w / 2 - 0.12, 0, 0], rot: [0, -Math.PI / 2, 0] },
}

/** 窓の大きさ */
const PW = 1.5
const PH = 2.4
/** 目の高さ */
const EYE = 1.6

/**
 * ステンシルでくり抜くポータル。
 *
 * 手順は 4 つ。
 *
 *   1. いまいる部屋を描く（窓は色を書かない）
 *   2. 窓の形をステンシルへ書く。**深度も見る**ので、手前に物があれば書けない
 *   3. 深度を捨てて、ステンシルの立った所にだけ向こうの部屋を描く
 *   4. 仮想カメラの near 面を窓の面へ倒す
 *
 * 4 が要。倒さないと、**窓より手前にある向こうの部屋の物まで写り込む**。
 */
function Portals({ params, mode }) {
  const { scene } = useThree()

  const warm = useRef(null)
  const cold = useRef(null)
  const portalA = useRef(null)
  const portalB = useRef(null)
  const maskA = useRef(null)
  const maskB = useRef(null)

  const clearColor = useMemo(() => new THREE.Color('#05060a'), [])
  const camLocal = useMemo(() => new THREE.Vector3(), [])
  const travel = useMemo(() => new THREE.Vector3(), [])
  const placeB = useMemo(() => {
    const p = PLACEMENT[params.placement] || PLACEMENT.parallel
    const [x, , z] = p.pos(ROOM)
    return { pos: [x, PH / 2 + 0.05, z], rot: p.rot }
  }, [params.placement])
  const virtual = useMemo(() => new THREE.PerspectiveCamera(), [])
  const pair = useMemo(() => new THREE.Matrix4(), [])
  const prevPos = useMemo(() => new THREE.Vector3(), [])
  const here = useRef(0) // 0 = 暖かい部屋 / 1 = 冷たい部屋

  /** 向こうの部屋の材質にステンシル判定を入れる。参照値が合う所にしか描かない */
  const applyStencil = (root, on, ref) => {
    root.traverse((o) => {
      const m = o.material
      if (!m) return
      const list = Array.isArray(m) ? m : [m]
      for (const mm of list) {
        mm.stencilWrite = on
        mm.stencilRef = ref
        mm.stencilFunc = THREE.EqualStencilFunc
        mm.stencilFail = THREE.KeepStencilOp
        mm.stencilZFail = THREE.KeepStencilOp
        mm.stencilZPass = THREE.KeepStencilOp
      }
    })
  }

  // 窓は「くり抜き用の板」。色は書かず、深度も書かない
  const maskMat = useMemo(() => new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    /*
     * 壁と 2cm しか離れていないと、浅い角度で深度が競って**ステンシルが
     * 書かれない瞬間が出る**（窓が消えたり点いたりする）。手前へ寄せる。
     */
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  }), [])
  useEffect(() => () => maskMat.dispose(), [maskMat])

  useFrame((state) => {
    const { gl, camera } = state
    const a = portalA.current
    const b = portalB.current
    if (!a || !b || !warm.current || !cold.current) return

    /*
     * --- 通り抜け。枠の中で面を跨いだときだけ ---
     *
     * **跨いだ地点まで戻してから転送する。** 越えた場所のまま転送すると、
     * 行き先でも同じだけ深く入る。フレームが落ちると 1 フレームで 0.3 単位
     * 進むので、壁の厚み（0.2）を越えて壁の中に出てしまい、画面が一瞬黒く
     * なる。戻したうえで、面のごくわずか先へ置き直す。
     */
    const from = here.current === 0 ? a : b
    const to = here.current === 0 ? b : a
    const t = crossed(prevPos, camera.position, from, PW / 2, PH / 2)
    if (t >= 0) {
      travel.subVectors(camera.position, prevPos)
      camera.position.copy(prevPos).addScaledVector(travel, t)
      if (travel.lengthSq() > 1e-12) camera.position.addScaledVector(travel.normalize(), 0.02)
      camera.updateMatrixWorld(true)
      pairMatrix(from, to, pair)
      camera.matrixWorld.premultiply(pair)
      camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale)
      camera.updateMatrixWorld(true)
      here.current = here.current === 0 ? 1 : 0
    }
    prevPos.copy(camera.position)

    const inWarm = here.current === 0
    const near = inWarm ? a : b
    const far = inWarm ? b : a
    const nearMask = inWarm ? maskA.current : maskB.current
    const thisRoom = inWarm ? warm.current : cold.current
    const thatRoom = inWarm ? cold.current : warm.current

    /*
     * --- 1. いまいる部屋 ---
     *
     * 背景色は `scene.background` に置かない。**色が入っていると、
     * `autoClear = false` でも `gl.render()` のたびに three が色バッファを
     * 消す**（背景色があるときは forceClear が立つ）。1 枚の絵を数回に
     * 分けて描くこの手順では、2 回目の描画で前の絵が消える。
     * 消すのはこちらで 1 回だけ。
     */
    gl.autoClear = false
    gl.setClearColor(clearColor, 1)
    gl.clear(true, true, true)

    thisRoom.visible = true
    thatRoom.visible = false
    // 板は 2 枚とも隠す。出したままだと両方の窓にステンシルが立つ
    maskA.current.visible = false
    maskB.current.visible = false
    gl.render(scene, camera)

    if (params.portalOn) {
      /*
       * --- 2. 窓の形をステンシルへ ---
       *
       * 部屋を隠して板だけ描く。**深度は 1 の結果を残したまま**なので、
       * 窓の手前に物があればステンシルは書かれない。
       *
       * ただし窓に顔を寄せると、板が near 面で切られて**ステンシルが 1
       * フレーム抜ける**（くぐる瞬間に画面がちらつく）。近づいたら板を
       * 面の裏へ下げ、深度判定も切る。そこまで近ければ、間に物は入らない。
       */
      camLocal.copy(camera.position)
      near.worldToLocal(camLocal)
      const dist = camLocal.z
      const veryClose = dist < 0.3
      maskMat.depthTest = !veryClose
      nearMask.position.z = veryClose ? Math.min(0, dist - 0.2) : 0

      nearMask.visible = true
      thisRoom.visible = false
      gl.render(scene, camera)
      nearMask.visible = false

      // --- 3. 深度を捨てて、向こうの部屋を窓の中だけに ---
      gl.clear(false, true, false)
      thatRoom.visible = true
      applyStencil(thatRoom, true, 1)

      pairMatrix(near, far, pair)
      placeVirtualCamera(camera, pair, virtual)
      virtual.updateMatrixWorld(true)
      if (params.oblique) {
        /*
         * 符号は「窓の裏側を切る」向き。仮想カメラは far 側の窓の**裏**に
         * いるので、法線の逆を near 面にする。
         */
        obliqueNearPlane(virtual, far, -1)
      }
      gl.render(scene, virtual)

      applyStencil(thatRoom, false, 0)
      thatRoom.visible = false
    }

    thisRoom.visible = true
  }, 1)


  return (
    <>
      {/* 部屋の中身。窓の枠は部屋ごとに色が違うのでここに置く */}
      <group ref={warm}>
        <RoomWarm params={params} />
        <group position={[0, PH / 2 + 0.05, -ROOM.d / 2 + 0.12]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.PlaneGeometry(PW + 0.12, PH + 0.12)]} />
            <lineBasicMaterial color={params.frameWarm} />
          </lineSegments>
        </group>
      </group>

      <group ref={cold} visible={false}>
        <RoomCold params={params} />
        <group position={placeB.pos} rotation={placeB.rot}>
          <lineSegments>
            <edgesGeometry args={[new THREE.PlaneGeometry(PW + 0.12, PH + 0.12)]} />
            <lineBasicMaterial color={params.frameCold} />
          </lineSegments>
        </group>
      </group>

      {/*
        * くり抜き用の板は**部屋の外**に置く。部屋の子にすると、ステンシルを
        * 書く番で部屋ごと隠したときに板まで消えて、何も書かれない。
        */}
      <group ref={portalA} position={[0, PH / 2 + 0.05, -ROOM.d / 2 + 0.12]}>
        <mesh ref={maskA} material={maskMat} visible={false}>
          <planeGeometry args={[PW, PH]} />
        </mesh>
      </group>
      <group ref={portalB} position={placeB.pos} rotation={placeB.rot}>
        <mesh ref={maskB} material={maskMat} visible={false}>
          <planeGeometry args={[PW, PH]} />
        </mesh>
      </group>

      <Walker params={params} mode={mode} />
    </>
  )
}

/**
 * 歩く。
 *
 * ドラッグで向きを変え、WASD で進む。ポインタロックは使わない。
 * **例の一覧から入ってきた人がいきなり画面を奪われるのは良くない。**
 */
function Walker({ params }) {
  const { camera, gl } = useThree()
  const keys = useRef({})
  const look = useRef({ yaw: 0, pitch: 0, dragging: false, x: 0, y: 0 })

  useEffect(() => {
    const el = gl.domElement
    const down = (e) => {
      look.current.dragging = true
      look.current.x = e.clientX
      look.current.y = e.clientY
      el.setPointerCapture?.(e.pointerId)
    }
    const move = (e) => {
      const l = look.current
      if (!l.dragging) return
      l.yaw -= (e.clientX - l.x) * 0.004
      l.pitch = THREE.MathUtils.clamp(l.pitch - (e.clientY - l.y) * 0.003, -1.2, 1.2)
      l.x = e.clientX
      l.y = e.clientY
    }
    const up = () => { look.current.dragging = false }
    const kd = (e) => { keys.current[e.code] = true }
    const ku = (e) => { keys.current[e.code] = false }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [gl])

  // 転送でカメラの姿勢が書き換わるので、向きは毎フレーム読み戻す
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const side = useMemo(() => new THREE.Vector3(), [])
  const synced = useRef(false)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const l = look.current

    /*
     * 転送はカメラの行列を丸ごと差し替える。**こちらが持っている yaw と
     * ずれる**ので、差し替えられたことに気付いたら読み戻す。
     */
    euler.setFromQuaternion(camera.quaternion, 'YXZ')
    if (!synced.current || Math.abs(euler.y - l.yaw) > 1e-4 || Math.abs(euler.x - l.pitch) > 1e-4) {
      if (!l.dragging && synced.current) {
        l.yaw = euler.y
        l.pitch = euler.x
      }
      synced.current = true
    }

    euler.set(l.pitch, l.yaw, 0, 'YXZ')
    camera.quaternion.setFromEuler(euler)

    dir.set(-Math.sin(l.yaw), 0, -Math.cos(l.yaw))
    side.set(Math.cos(l.yaw), 0, -Math.sin(l.yaw))

    const k = keys.current
    let mx = 0
    let mz = 0
    if (k.KeyW || k.ArrowUp) mz += 1
    if (k.KeyS || k.ArrowDown) mz -= 1
    if (k.KeyD || k.ArrowRight) mx += 1
    if (k.KeyA || k.ArrowLeft) mx -= 1
    if (mx || mz) {
      const len = Math.hypot(mx, mz)
      const v = params.walkSpeed * dt
      camera.position.addScaledVector(dir, (mz / len) * v)
      camera.position.addScaledVector(side, (mx / len) * v)
    }

    /*
     * 部屋の外へは出さない。ただし**窓のあたりだけは通す**。
     * 一律に閉じ込めると、通り抜けようとして壁に弾かれる。
     */
    const pad = 0.45
    const gap = PW / 2 + 0.2
    const nearGate = Math.abs(camera.position.x) < gap || Math.abs(camera.position.z) < gap
    const limX = ROOM.w / 2 - pad
    const limZ = ROOM.d / 2 - pad
    if (!nearGate) {
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -limX, limX)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -limZ, limZ)
    } else {
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -limX - 1.2, limX + 1.2)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -limZ - 1.2, limZ + 1.2)
    }
    camera.position.y = EYE
  })

  return null
}

export default function PortalRooms() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Portal: folder({
      portalOn: { value: DEFAULTS.portalOn, label: 'portal' },
      oblique: { value: DEFAULTS.oblique, label: 'oblique near' },
      placement: { value: DEFAULTS.placement, options: { 'Parallel (no turn)': 'parallel', 'Side wall (turns 90°)': 'turn' }, label: 'exit' },
      walkSpeed: { value: DEFAULTS.walkSpeed, min: 1, max: 8, step: 0.5, label: 'walk' },
    }),
    Warm: folder({
      warmWall: { value: DEFAULTS.warmWall, label: 'wall' },
      warmFloor: { value: DEFAULTS.warmFloor, label: 'floor' },
      warmProp: { value: DEFAULTS.warmProp, label: 'props' },
      warmLight: { value: DEFAULTS.warmLight, label: 'light' },
      frameWarm: { value: DEFAULTS.frameWarm, label: 'frame' },
    }),
    Cold: folder({
      coldWall: { value: DEFAULTS.coldWall, label: 'wall' },
      coldFloor: { value: DEFAULTS.coldFloor, label: 'floor' },
      coldProp: { value: DEFAULTS.coldProp, label: 'pillars' },
      coldLight: { value: DEFAULTS.coldLight, label: 'light' },
      frameCold: { value: DEFAULTS.frameCold, label: 'frame' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <div className="pr">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [0, EYE, 3.5], fov: 62, near: 0.05, far: 60 }}
        // ステンシルを使うので明示的に要求する。既定では付かない
        gl={{ stencil: true, antialias: true }}
      >
        <Portals params={params} />
      </Canvas>
      <div className="pr__hint">ドラッグで見回す / WASD で歩く / 窓をくぐる</div>
    </div>
  )
}
