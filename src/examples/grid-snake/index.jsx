import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, ContactShadows } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useControls, folder, button } from 'leva'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ENV_MAPS } from '../../shared/env'
import { createGame, DIRS } from './game'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'
import './styles.css'

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
}

const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()

/** 盤面。セルを 1 枚ずつ置く。市松にすると升目が数えられる */
function Board({ size, params }) {
  const mesh = useRef(null)
  const geometry = useMemo(() => new RoundedBoxGeometry(0.9, 0.14, 0.9, 3, 0.05), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    if (!mesh.current) return
    const half = (size - 1) / 2
    let i = 0
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        dummy.position.set(x - half, -0.08, -(y - half))
        dummy.scale.setScalar(1)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        mesh.current.setMatrixAt(i, dummy.matrix)
        // 市松。差は小さく。強いと盤が主役になる
        tmpColor.set(params.cellColor).multiplyScalar((x + y) % 2 ? 1 : 0.86)
        mesh.current.setColorAt(i, tmpColor)
        i++
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  }, [size, params.cellColor])

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, size * size]} receiveShadow key={size}>
      <meshStandardMaterial roughness={0.85} metalness={0.05} />
    </instancedMesh>
  )
}

/**
 * 盤面の進行と描画。
 *
 * ロジックは 1 ターンずつしか動かない。見た目はその間を補間する。
 * 補間しないと駒が瞬間移動して、いくら質感を上げても安っぽく見える。
 */
function Stage({ params, onScore, onRestart }) {
  const size = Math.round(params.size)
  const game = useMemo(
    () => createGame({ size, fruits: Math.round(params.fruitCount), wrap: params.wrap }),
    // 盤の条件が変わったら作り直す
    [size, params.fruitCount, params.wrap],
  )

  const bodyMesh = useRef(null)
  const fruitMesh = useRef(null)

  const blockColor = useMemo(() => new THREE.Color(), [])
  const bodyGeo = useMemo(() => new RoundedBoxGeometry(0.86, 0.86, 0.86, 4, 0.22), [])
  const fruitGeo = useMemo(() => new THREE.IcosahedronGeometry(0.3, 2), [])
  useEffect(() => () => { bodyGeo.dispose(); fruitGeo.dispose() }, [bodyGeo, fruitGeo])

  const max = size * size

  /*
   * 入力。
   *
   * OS のキーリピートは速すぎて効かせられないので `e.repeat` は捨て、
   * 押しっぱなしの間隔を自前で持つ。1 手目までは少し待ち、以降は詰める。
   * こうしないと「1 マスだけ動かす」ができない。
   */
  const held = useRef(null)
  const queue = useRef([])
  const sinceStep = useRef(0)
  const repeats = useRef(0)
  const anim = useRef(1)
  const eatPop = useRef(0)
  /*
   * 進めなかったときの手応え。
   * その方向へ小さく跳ねて戻り、赤く光って減衰する。
   * 0 に落ちきる前は撃ち直さない。押しっぱなしだと震えっぱなしになる。
   */
  const bump = useRef(0)
  const bumpDir = useRef({ x: 0, y: 0 })
  // 直前の手で節が増えたか。増えたターンだけ末尾を膨らませる
  const grew = useRef(false)

  useEffect(() => {
    const down = (e) => {
      const name = KEYS[e.code]
      if (!name) {
        // 終了時の再開はキーでもボタンでも同じ経路にする
        if (e.code === 'KeyR' || ((e.code === 'Enter' || e.code === 'Space') && game.state.over)) onRestart()
        return
      }
      e.preventDefault()
      if (e.repeat) return
      held.current = name
      repeats.current = 0
      sinceStep.current = Infinity // 押した瞬間に 1 手進める
      queue.current.push(name)
    }
    const up = (e) => {
      if (KEYS[e.code] && KEYS[e.code] === held.current) held.current = null
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [game, onScore, onRestart])

  const advance = () => {
    const name = queue.current.shift() ?? held.current
    if (!name) return false
    const r = game.step(DIRS[name])

    if (r.blocked) {
      // 揺れが収まる前に撃ち直さない
      if (bump.current < 0.4) {
        bump.current = 1
        bumpDir.current = DIRS[name]
      }
      sinceStep.current = 0
      return false
    }

    if (r.moved) {
      anim.current = 0
      sinceStep.current = 0
      grew.current = !!r.ate
      if (r.ate) eatPop.current = 1
    }
    onScore(game.state.score, !!r.died || game.state.over)
    return r.moved
  }

  useFrame((_, delta) => {
    const s = game.state
    const dt = Math.min(delta, 1 / 20)

    // 補間が終わっていて、入力が溜まっているか押しっぱなしなら次の手へ
    anim.current = Math.min(1, anim.current + dt / Math.max(0.02, params.stepDuration))
    sinceStep.current += dt

    if (anim.current >= 1 && !s.over) {
      const wait = repeats.current === 0 ? 0 : (repeats.current === 1 ? params.repeatDelay : params.repeatInterval)
      if (queue.current.length || (held.current && sinceStep.current >= wait)) {
        if (advance()) repeats.current += 1
      }
    }

    eatPop.current = Math.max(0, eatPop.current - dt * 4)
    bump.current = Math.max(0, bump.current - dt / 0.34)

    /*
     * 減衰する振動。位相を (1 - bump) で進めると、最初が速く最後が遅くなり、
     * ぶつかって収まる感触になる。等速だとブザーのように見える。
     */
    blockColor.set(params.blockColor)
    const wig = Math.sin((1 - bump.current) * Math.PI * 5) * bump.current * params.shake
    const bx = bumpDir.current.x * wig
    const by = bumpDir.current.y * wig

    // --- 体 ---
    const t = anim.current
    // 両端を寝かせる。等速だと機械的に見える
    const e = t * t * (3 - 2 * t)
    const half = (size - 1) / 2
    const body = bodyMesh.current
    if (body) {
      for (let i = 0; i < max; i++) {
        if (i >= s.snake.length) {
          dummy.position.set(0, -50, 0)
          dummy.scale.setScalar(0.0001)
          dummy.rotation.set(0, 0, 0)
          dummy.updateMatrix()
          body.setMatrixAt(i, dummy.matrix)
          continue
        }

        const cur = s.snake[i]
        const prev = s.prev[i] ?? cur
        // 端をまたいだ手は補間すると盤を横切ってしまうので、補間しない
        const jump = Math.abs(cur.x - prev.x) > 1 || Math.abs(cur.y - prev.y) > 1
        const px = jump ? cur.x : prev.x + (cur.x - prev.x) * e
        const py = jump ? cur.y : prev.y + (cur.y - prev.y) * e

        /*
         * 生えたばかりの節だけ膨らみながら出す。
         * 末尾かどうかだけで判定すると、**毎ターン尻尾が 0 から膨らむ**。
         * 実際に増えたターンに限る。
         */
        const grow = grew.current && i === s.snake.length - 1 ? Math.min(1, 0.35 + e * 0.65) : 1
        // 頭は進行方向へ潰れて伸びる
        const isHead = i === 0
        const squash = isHead ? Math.sin(e * Math.PI) * params.squash : 0
        const along = Math.abs(s.dir.x) > 0 ? 'x' : 'z'

        // 頭ほど大きく揺れる。全部同じだと盤ごと動いたように見える
        const fall = 1 / (1 + i * 0.6)
        dummy.position.set(px - half + bx * fall, 0.45, -(py - half) - by * fall)
        dummy.scale.set(1, 1, 1).multiplyScalar(grow * (1 + (isHead ? eatPop.current * 0.25 : 0)))
        if (along === 'x') { dummy.scale.x *= 1 + squash; dummy.scale.z *= 1 - squash * 0.6 }
        else { dummy.scale.z *= 1 + squash; dummy.scale.x *= 1 - squash * 0.6 }
        dummy.scale.y *= 1 - squash * 0.4
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        body.setMatrixAt(i, dummy.matrix)

        tmpColor.set(isHead ? params.headColor : params.snakeColor)
        // 尾へ行くほどわずかに沈める。長さが読める
        if (!isHead) tmpColor.multiplyScalar(1 - Math.min(0.35, i * 0.012))
        // 進めなかったときは赤へ寄せる。頭ほど強く
        if (bump.current > 0) tmpColor.lerp(blockColor, Math.min(1, bump.current * fall * 1.4))
        body.setColorAt(i, tmpColor)
      }
      body.instanceMatrix.needsUpdate = true
      if (body.instanceColor) body.instanceColor.needsUpdate = true
      body.count = max
    }

    // --- 果物 ---
    const fruit = fruitMesh.current
    if (fruit) {
      const now = performance.now() / 1000
      for (let i = 0; i < fruit.count; i++) {
        const f = s.fruits[i]
        if (!f) {
          dummy.position.set(0, -50, 0)
          dummy.scale.setScalar(0.0001)
        } else {
          dummy.position.set(f.x - half, 0.5 + Math.sin(now * 2.4 + i) * 0.08, -(f.y - half))
          dummy.scale.setScalar(1)
        }
        dummy.rotation.set(now * 0.6 + i, now * 0.9 + i, 0)
        dummy.updateMatrix()
        fruit.setMatrixAt(i, dummy.matrix)
      }
      fruit.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <Board size={size} params={params} />

      <instancedMesh ref={bodyMesh} args={[bodyGeo, undefined, max]} castShadow receiveShadow key={`b${size}`}>
        <meshStandardMaterial roughness={0.32} metalness={0.1} />
      </instancedMesh>

      <instancedMesh ref={fruitMesh} args={[fruitGeo, undefined, Math.max(1, Math.round(params.fruitCount))]} castShadow>
        <meshStandardMaterial
          color={params.fruitColor}
          emissive={params.fruitColor}
          emissiveIntensity={0.55}
          roughness={0.25}
          metalness={0}
        />
      </instancedMesh>

      {/* 盤の下敷き。縁を作ると盤が浮いて見える */}
      <mesh position={[0, -0.2, 0]} receiveShadow>
        <boxGeometry args={[size + 0.9, 0.24, size + 0.9]} />
        <meshStandardMaterial color={params.boardColor} roughness={0.95} metalness={0} />
      </mesh>
    </>
  )
}

/**
 * カメラ。
 *
 * 距離を式で一発で出すと必ずはみ出す。俯角が付くと**手前の縁だけカメラに
 * 近づく**ので、見かけの大きさが盤の寸法から線形には決まらない。
 *
 * 四隅を実際に射影して、NDC に収まるまで数回詰める。
 * 透視だと 1 回では合わないが、数回回せば十分収束する。
 */
function Rig({ size, tilt }) {
  const camera = useThree((s) => s.camera)
  const viewport = useThree((s) => s.size)

  useEffect(() => {
    const span = (size + 2.2) / 2
    const corners = []
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) corners.push(new THREE.Vector3(sx * span, 0.9, sz * span))
    }

    const a = (tilt * Math.PI) / 180
    let dist = size * 1.6

    for (let k = 0; k < 12; k++) {
      camera.position.set(0, Math.sin(a) * dist, Math.cos(a) * dist)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      camera.updateProjectionMatrix()

      let m = 0
      for (const c of corners) {
        const v = c.clone().project(camera)
        m = Math.max(m, Math.abs(v.x), Math.abs(v.y))
      }
      // 余白 6%
      const scale = m * 1.06
      dist *= scale
      if (Math.abs(scale - 1) < 0.005) break
    }

    camera.position.set(0, Math.sin(a) * dist, Math.cos(a) * dist)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size, tilt, viewport.width, viewport.height])
  return null
}

export default function GridSnake() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const restart = useCallback(() => {
    setResetKey((k) => k + 1)
    setScore(0)
    setOver(false)
  }, [])

  const [params, setParams] = useControls(() => ({
    Board: folder({
      size: { value: DEFAULTS.size, min: 6, max: 20, step: 1, label: 'grid' },
      fruitCount: { value: DEFAULTS.fruitCount, min: 1, max: 8, step: 1, label: 'fruits' },
      wrap: { value: DEFAULTS.wrap, label: 'wrap edges' },
      tilt: { value: DEFAULTS.tilt, min: 20, max: 85, step: 1, label: 'camera tilt' },
    }),
    Feel: folder({
      stepDuration: { value: DEFAULTS.stepDuration, min: 0.04, max: 0.4, step: 0.01, label: 'step (s)' },
      repeatDelay: { value: DEFAULTS.repeatDelay, min: 0.05, max: 0.6, step: 0.01, label: 'hold delay' },
      repeatInterval: { value: DEFAULTS.repeatInterval, min: 0.04, max: 0.4, step: 0.01, label: 'hold rate' },
      squash: { value: DEFAULTS.squash, min: 0, max: 0.5, step: 0.02 },
      shake: { value: DEFAULTS.shake, min: 0, max: 0.6, step: 0.02, label: 'blocked shake' },
    }),
    Look: folder({
      snakeColor: { value: DEFAULTS.snakeColor, label: 'body' },
      headColor: { value: DEFAULTS.headColor, label: 'head' },
      fruitColor: { value: DEFAULTS.fruitColor, label: 'fruit' },
      blockColor: { value: DEFAULTS.blockColor, label: 'blocked' },
      cellColor: { value: DEFAULTS.cellColor, label: 'cells' },
      boardColor: { value: DEFAULTS.boardColor, label: 'board' },
      background: { value: DEFAULTS.background, label: 'bg' },
      shadows: { value: DEFAULTS.shadows },
    }),
    Restart: button(() => restart()),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  const onScore = (s, dead) => {
    setScore(s)
    setOver(dead)
  }

  return (
    <div className="snk">
      <Canvas
        shadows={params.shadows}
        camera={{ position: [0, 12, 10], fov: 40 }}
        dpr={[1, 2]}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <color attach="background" args={[params.background]} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[6, 12, 6]}
          intensity={1.6}
          castShadow={params.shadows}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-bias={-0.0006}
        />

        <Suspense fallback={null}>
          <Environment files={ENV_MAPS.studio.url} />
          <Stage key={resetKey} params={params} onScore={onScore} onRestart={restart} />
        </Suspense>

        <ContactShadows position={[0, -0.32, 0]} opacity={0.45} scale={params.size * 2} blur={2.6} far={4} />
        <Rig size={params.size} tilt={params.tilt} />
      </Canvas>

      {/* 進行中のスコア。終了したら中央の板に譲る */}
      {!over && (
        <div className="snk__hud">
          <span className="snk__score">{score}</span>
          <span className="snk__label">FRUITS</span>
        </div>
      )}

      {over && (
        <div className="snk__over">
          <div className="snk__card">
            <span className="snk__over-label">NO MOVES LEFT</span>
            <span className="snk__over-score">{score}</span>
            <span className="snk__label">FRUITS EATEN</span>
            <button type="button" className="snk__button" onClick={restart} autoFocus>
              RESTART
            </button>
            <span className="snk__over-hint">OR PRESS R</span>
          </div>
        </div>
      )}

      {!over && <div className="snk__hint">ARROWS OR WASD — ONE PRESS, ONE TURN</div>}
    </div>
  )
}
