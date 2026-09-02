import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder, button } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { LEVEL, pointOn, solidSpans } from './level'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS, START_AZIMUTH } from './presets'
import './styles.css'

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpC = new THREE.Vector3()

/** 梁 1 本ぶんの板。穴の部分は描かない */
function Beam({ b, color, edge }) {
  const parts = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b.b, b.a)
    const len = dir.length()
    const yaw = Math.atan2(dir.x, dir.z)
    return solidSpans(b).map(([t0, t1]) => {
      const mid = pointOn(b, (t0 + t1) / 2, new THREE.Vector3())
      return { pos: mid.toArray(), len: len * (t1 - t0), yaw }
    })
  }, [b])

  return parts.map((p, i) => (
    <group key={i} position={p.pos} rotation={[0, p.yaw, 0]}>
      <mesh>
        <boxGeometry args={[0.9, 0.22, p.len]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* 輪郭。白い面だけだと角が読めない */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(0.9, 0.22, p.len)]} />
        <lineBasicMaterial color={edge} />
      </lineSegments>
    </group>
  ))
}

function Pillar({ pos, size, color, edge }) {
  const geo = useMemo(() => new THREE.BoxGeometry(...size), [size])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <group position={pos}>
      <mesh geometry={geo}>
        <meshBasicMaterial color={color} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geo]} />
        <lineBasicMaterial color={edge} />
      </lineSegments>
    </group>
  )
}

/**
 * 歩行体と規則。
 *
 * 判定は**到達した瞬間にだけ**下す。毎フレーム連続で判定すると、
 * 閾値の付近で「繋がった / 切れた」が高速に入れ替わってちらつく。
 * 端に着いた時、穴に入る時、という離散的な瞬間に確定させれば起きない。
 */
function Walker({ params, onState }) {
  const { camera, size, scene } = useThree()
  const ref = useRef(null)
  const pos = useRef({ ...LEVEL.start })
  const state = useRef('walk')
  const fallY = useRef(0)
  const ray = useMemo(() => new THREE.Raycaster(), [])

  const reset = () => {
    pos.current = { ...LEVEL.start }
    state.current = 'walk'
    fallY.current = 0
    onState('walk')
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [])

  /** ワールド座標 → 画面座標（px） */
  const toScreen = (v, out) => {
    tmpC.copy(v).project(camera)
    out.x = (tmpC.x * 0.5 + 0.5) * size.width
    out.y = (-tmpC.y * 0.5 + 0.5) * size.height
    return out
  }

  /**
   * 端に着いたとき、画面上で重なって見える別の梁の端を探す。
   *
   * 物理的に繋がっている角も、離れているのに繋がって見える錯視も、
   * これ一本で扱える。**世界の距離は一切見ない。**
   */
  const findLink = (fromBeam, atEnd) => {
    const here = toScreen(pointOn(LEVEL.beams[fromBeam], atEnd ? 1 : 0, tmpA), { x: 0, y: 0 })
    let best = null
    let bestD = params.snapPx

    LEVEL.beams.forEach((b, i) => {
      for (const t of [0, 1]) {
        if (i === fromBeam && t === (atEnd ? 1 : 0)) continue
        const p = toScreen(pointOn(b, t, tmpB), { x: 0, y: 0 })
        const d = Math.hypot(p.x - here.x, p.y - here.y)
        if (d < bestD) {
          bestD = d
          best = { beam: i, t, dir: t === 0 ? 1 : -1 }
        }
      }
    })
    return best
  }

  /**
   * 穴が手前の何かで隠れているか。
   *
   * カメラから穴へレイを飛ばし、**穴より手前に何かが当たれば隠れている**。
   * 正射影なのでレイの向きはカメラの前方で固定。穴の中心 1 点だけでなく
   * 幅も見ないと、端がわずかに覗いているのに通れてしまう。
   */
  const isCovered = (b, hole) => {
    const dir = camera.getWorldDirection(tmpC).clone()
    const targets = scene.children.filter((o) => o.userData.occluder)
    if (!targets.length) return false

    const samples = [0.2, 0.5, 0.8]
    for (const s of samples) {
      const t = hole[0] + (hole[1] - hole[0]) * s
      const point = pointOn(b, t, tmpA)
      const origin = tmpB.copy(point).addScaledVector(dir, -60)
      ray.set(origin, dir)
      ray.far = 120
      const hits = ray.intersectObjects(targets, true)
      const distToPoint = origin.distanceTo(point)
      // 穴より手前にある当たりだけを数える。板自身は除いてある
      if (!hits.some((h) => h.distance < distToPoint - 0.05)) return false
    }
    return true
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const p = pos.current

    if (state.current === 'fall') {
      fallY.current -= dt * 9
      if (ref.current) {
        pointOn(LEVEL.beams[p.beam], p.t, tmpA)
        ref.current.position.set(tmpA.x, tmpA.y + 0.42 + fallY.current, tmpA.z)
      }
      if (fallY.current < -8) reset()
      return
    }

    if (state.current === 'goal') return

    const b = LEVEL.beams[p.beam]
    const len = b.a.distanceTo(b.b)
    const before = p.t
    p.t += (p.dir * params.speed * dt) / len

    // --- 穴 ---
    for (const hole of b.holes) {
      const entering = p.dir > 0 ? before < hole[0] && p.t >= hole[0] : before > hole[1] && p.t <= hole[1]
      if (!entering) continue
      if (!isCovered(b, hole)) {
        state.current = 'fall'
        p.t = p.dir > 0 ? hole[0] : hole[1]
        onState('fall')
        return
      }
    }

    // --- 端 ---
    if (p.t >= 1 || p.t <= 0) {
      const atEnd = p.t >= 1
      if (p.beam === LEVEL.goal.beam && atEnd === (LEVEL.goal.t === 1)) {
        p.t = LEVEL.goal.t
        state.current = 'goal'
        onState('goal')
        return
      }
      const link = findLink(p.beam, atEnd)
      if (link) {
        pos.current = { beam: link.beam, t: link.t, dir: link.dir }
      } else {
        p.t = atEnd ? 1 : 0
        state.current = 'fall'
        onState('fall')
        return
      }
    }

    if (ref.current) {
      const cur = LEVEL.beams[pos.current.beam]
      pointOn(cur, pos.current.t, tmpA)
      ref.current.position.set(tmpA.x, tmpA.y + 0.42, tmpA.z)
    }
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.3, 24, 18]} />
      <meshBasicMaterial color={params.walker} />
    </mesh>
  )
}

/** ドラッグで回す正射影のカメラ。透視だと重なりの判定が曖昧になる */
function Rig({ azimuth, elevation, zoom, onDrag }) {
  const { camera, gl } = useThree()

  useEffect(() => {
    const a = (azimuth * Math.PI) / 180
    const e = (elevation * Math.PI) / 180
    const r = 20
    camera.position.set(Math.cos(e) * Math.sin(a) * r, Math.sin(e) * r, Math.cos(e) * Math.cos(a) * r)
    camera.lookAt(0, 0.4, 0)
    camera.zoom = zoom
    camera.updateProjectionMatrix()
  }, [camera, azimuth, elevation, zoom])

  useEffect(() => {
    const el = gl.domElement
    let last = null
    const down = (e) => { last = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId) }
    const move = (e) => {
      if (!last) return
      onDrag(e.clientX - last.x, e.clientY - last.y)
      last = { x: e.clientX, y: e.clientY }
    }
    const up = (e) => { last = null; el.releasePointerCapture?.(e.pointerId) }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [gl, onDrag])

  return null
}

/** 遮蔽の判定に使う物だけ userData に印を付けて集める */
function Occluders({ children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.occluder = true
  }, [])
  return <group ref={ref}>{children}</group>
}

export default function ImpossibleWalk() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [status, setStatus] = useState('walk')
  const [view, setView] = useState({ azimuth: START_AZIMUTH, elevation: DEFAULTS.elevation })
  const [resetKey, setResetKey] = useState(0)

  const [params, setParams] = useControls(() => ({
    Rule: folder({
      speed: { value: DEFAULTS.speed, min: 0.4, max: 4, step: 0.1, label: 'walk speed' },
      snapPx: { value: DEFAULTS.snapPx, min: 2, max: 60, step: 1, label: 'snap (px)' },
    }),
    View: folder({
      zoom: { value: DEFAULTS.zoom, min: 20, max: 140, step: 1 },
      elevation: { value: DEFAULTS.elevation, min: 5, max: 80, step: 1 },
    }),
    Look: folder({
      face: { value: DEFAULTS.face },
      edge: { value: DEFAULTS.edge },
      walker: { value: DEFAULTS.walker },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
    Restart: button(() => setResetKey((k) => k + 1)),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  useEffect(() => {
    setView((v) => ({ ...v, elevation: params.elevation }))
  }, [params.elevation])

  const onDrag = (dx, dy) => {
    setView((v) => ({
      azimuth: v.azimuth - dx * 0.35,
      elevation: Math.min(80, Math.max(5, v.elevation - dy * 0.2)),
    }))
  }

  return (
    <div className="iwk">
      <Canvas
        orthographic
        camera={{ position: [12, 10, 12], zoom: DEFAULTS.zoom, near: -100, far: 200 }}
        dpr={[1, 2]}
      >
        <color attach="background" args={[params.background]} />

        <Occluders>
          {LEVEL.beams.map((b, i) => (
            <Beam key={`${resetKey}-${i}`} b={b} color={params.face} edge={params.edge} />
          ))}
          {LEVEL.pillars.map((p, i) => (
            <Pillar key={i} pos={p.pos} size={p.size} color={params.face} edge={params.edge} />
          ))}
        </Occluders>

        {/* ゴールの印 */}
        <mesh position={pointOn(LEVEL.beams[LEVEL.goal.beam], LEVEL.goal.t, new THREE.Vector3()).toArray()}>
          <torusGeometry args={[0.34, 0.05, 10, 28]} />
          <meshBasicMaterial color={params.walker} />
        </mesh>

        <Walker key={resetKey} params={params} onState={setStatus} />
        <Rig azimuth={view.azimuth} elevation={view.elevation} zoom={params.zoom} onDrag={onDrag} />
      </Canvas>

      <div className="iwk__hud">
        <span className="iwk__label">
          {status === 'goal' ? 'REACHED' : status === 'fall' ? 'FELL — RESPAWNING' : 'DRAG TO ROTATE'}
        </span>
      </div>

      <div className="iwk__hint">
        LINE UP THE EDGES TO CONNECT · HIDE THE GAP TO CROSS
      </div>
    </div>
  )
}
