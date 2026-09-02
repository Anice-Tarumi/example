import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, ContactShadows } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useControls, folder, button } from 'leva'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ENV_MAPS } from '../../shared/env'
import { createGame, DIRS } from './game'
import {
  boardFor, UPGRADES, costOf, derive, loadSave, writeSave,
  autoDirection, wanderDirection, RARE_MULTIPLIER,
  loadBoard, writeBoard, qualifies, insertScore, guessCountry,
} from './modes'
import { Hud, ResultCard, Shop, StartCard, TitleCard, Leaderboard } from './ui'
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
function Stage({ mode, board, derived, params, phase, onStats, onEnd, onRestart }) {
  const size = board.size
  const game = useMemo(
    () => createGame({
      size,
      fruits: board.fruitCount,
      wrap: board.wrap,
      growth: board.growth,
      rareChance: board.rareChance,
    }),
    [size, board.fruitCount, board.wrap, board.growth, board.rareChance],
  )

  const bodyMesh = useRef(null)
  const fruitMesh = useRef(null)

  const blockColor = useMemo(() => new THREE.Color(), [])
  const rareColor = useMemo(() => new THREE.Color('#ffd54a'), [])
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

  /*
   * 集計。毎フレーム親へ渡すと再描画が走り続けるので、間引く。
   * 表示の滑らかさは 10Hz で足りる。
   */
  const turns = useRef(0)
  const earned = useRef(0)
  const elapsed = useRef(0)
  const remaining = useRef(derived.runSeconds)
  const report = useRef(0)
  const autoTimer = useRef(0)

  useEffect(() => { remaining.current = derived.runSeconds }, [derived.runSeconds, phase])

  useEffect(() => {
    const down = (e) => {
      const name = KEYS[e.code]
      if (!name) {
        // 再開はキーでもボタンでも同じ経路にする
        if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') onRestart()
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
  }, [onRestart])

  const snapshot = () => ({
    score: game.state.score,
    turns: turns.current,
    earned: Math.round(earned.current),
    elapsed: elapsed.current,
    remaining: Math.max(0, remaining.current),
  })

  const applyResult = (r) => {
    if (r.blocked) {
      // 揺れが収まる前に撃ち直さない
      if (bump.current < 0.4) {
        bump.current = 1
        bumpDir.current = r.dir
      }
      sinceStep.current = 0
      return false
    }
    if (r.moved) {
      anim.current = 0
      sinceStep.current = 0
      turns.current += 1
      grew.current = !!r.ate
      if (r.ate) {
        eatPop.current = 1
        earned.current += derived.fruitValue * (r.eaten?.rare ? RARE_MULTIPLIER : 1)
      }
    }
    if (r.died) onEnd(r.died, snapshot())
    return r.moved
  }

  useFrame((_, delta) => {
    const s = game.state
    /*
     * 演出の刻みは頭打ちにする。フレームが飛んだときに補間が吹き飛ぶため。
     * **時計は頭打ちにしない。** 実時間で数えるものに上限を掛けると、
     * 描画が重い環境で持ち時間が伸びてしまう。
     */
    const dt = Math.min(delta, 1 / 20)
    const clock = delta
    const live = phase === 'run' && !s.over

    anim.current = Math.min(1, anim.current + dt / Math.max(0.02, params.stepDuration))
    sinceStep.current += dt

    if (live) {
      elapsed.current += clock
      if (mode === 'idle') {
        remaining.current -= clock
        if (remaining.current <= 0) onEnd('time', snapshot())
      }
    }

    // 手動。入力が溜まっているか、押しっぱなしなら次の手へ
    if (live && anim.current >= 1) {
      const wait = repeats.current === 0 ? 0 : (repeats.current === 1 ? params.repeatDelay : params.repeatInterval)
      if (queue.current.length || (held.current && sinceStep.current >= wait)) {
        const name = queue.current.shift() ?? held.current
        if (name && applyResult(game.step(DIRS[name]))) repeats.current += 1
      }
    }

    /*
     * 自動。解禁されている間は入力が無くても一定間隔で進む。
     * 操舵が無いうちは今の向きへ進み、塞がったら通れる方へ折れるだけ。
     * 完全な経路探索にすると詰まなくなって、盤面の強化を買う理由が消える。
     */
    if (live && mode === 'idle' && derived.auto) {
      autoTimer.current += dt
      if (autoTimer.current >= derived.stepDelay && anim.current >= 1) {
        autoTimer.current = 0
        const dir = derived.steer ? autoDirection(game, DIRS) : wanderDirection(game, DIRS)
        if (dir) applyResult(game.step(dir))
      }
    }

    report.current += dt
    if (report.current > 0.08) {
      report.current = 0
      onStats(snapshot())
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
        const grow = grew.current && i >= s.snake.length - board.growth
          ? Math.min(1, 0.35 + e * 0.65)
          : 1
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
          // レアは大きく金色に。数字を見なくても価値が分かる
          dummy.scale.setScalar(f.rare ? 1.45 : 1)
        }
        dummy.rotation.set(now * 0.6 + i, now * 0.9 + i, 0)
        dummy.updateMatrix()
        fruit.setMatrixAt(i, dummy.matrix)
        tmpColor.set(f?.rare ? rareColor : params.fruitColor)
        fruit.setColorAt(i, tmpColor)
      }
      fruit.instanceMatrix.needsUpdate = true
      if (fruit.instanceColor) fruit.instanceColor.needsUpdate = true
    }
  })

  return (
    <>
      <Board size={size} params={params} />

      <instancedMesh ref={bodyMesh} args={[bodyGeo, undefined, max]} castShadow receiveShadow key={`b${size}`}>
        <meshStandardMaterial roughness={0.32} metalness={0.1} />
      </instancedMesh>

      <instancedMesh
        ref={fruitMesh}
        args={[fruitGeo, undefined, Math.max(1, board.fruitCount)]}
        castShadow
        key={`f${board.fruitCount}`}
      >
        <meshStandardMaterial emissiveIntensity={0.5} roughness={0.25} metalness={0} />
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

  const [save, setSave] = useState(() => loadSave())
  const [lb, setLb] = useState(() => loadBoard())
  // 最初はタイトル。モードは leva ではなくここで選ばせる（二重管理を避ける）
  const [mode, setMode] = useState('classic')
  const [phase, setPhase] = useState('title')
  const [stats, setStats] = useState({ score: 0, turns: 0, earned: 0, elapsed: 0, remaining: 10 })
  const [reason, setReason] = useState(null)
  const [resetKey, setResetKey] = useState(0)

  const [params, setParams] = useControls(() => ({
    Board: folder({
      size: { value: DEFAULTS.size, min: 6, max: 20, step: 1, label: 'grid (classic)' },
      fruitCount: { value: DEFAULTS.fruitCount, min: 1, max: 8, step: 1, label: 'fruits (classic)' },
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
    'Wipe save': button(() => {
      const fresh = { money: 0, levels: {}, best: 0, bestTurns: 0 }
      setSave(fresh)
      writeSave(fresh)
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  const derived = useMemo(() => derive(save.levels), [save.levels])

  // classic は leva の盤、それ以外はモードと強化が決める
  const board = useMemo(
    () => boardFor(mode, derived) ?? {
      size: Math.round(params.size),
      fruitCount: Math.round(params.fruitCount),
      wrap: params.wrap,
      growth: 1,
      rareChance: 0,
    },
    [mode, derived, params.size, params.fruitCount, params.wrap],
  )

  const start = useCallback(() => {
    setReason(null)
    setStats({ score: 0, turns: 0, earned: 0, elapsed: 0, remaining: derived.runSeconds })
    setResetKey((k) => k + 1)
    setPhase('run')
  }, [derived.runSeconds])

  /*
   * classic は待たせない。時間制と周回は、始める前に条件を読ませる。
   * いきなり走り出すと、盤を見る前に持ち時間が減る。
   */
  const pickMode = useCallback((m) => {
    setMode(m)
    setReason(null)
    setStats({ score: 0, turns: 0, earned: 0, elapsed: 0, remaining: derived.runSeconds })
    setResetKey((k) => k + 1)
    setPhase(m === 'classic' ? 'run' : 'ready')
  }, [derived.runSeconds])

  const goTitle = useCallback(() => setPhase('title'), [])

  const onEnd = useCallback((why, snap) => {
    setPhase((p) => {
      if (p !== 'run') return p
      setReason(why)
      setStats(snap)
      setSave((prev) => {
        const next = { ...prev }
        if (mode === 'idle') next.money = (prev.money ?? 0) + snap.earned
        if (mode === 'classic') next.best = Math.max(prev.best ?? 0, snap.score)
        if (mode === 'time' && why === 'filled') {
          next.bestTurns = prev.bestTurns ? Math.min(prev.bestTurns, snap.turns) : snap.turns
        }
        writeSave(next)
        return next
      })
      return 'over'
    })
  }, [mode])

  /** 順位表への登録。名前と国は次回のために残す */
  const submitScore = useCallback(({ name, country }) => {
    setLb((prev) => {
      const next = insertScore(prev, {
        name, country, turns: stats.turns, seconds: stats.elapsed, at: Date.now(),
      })
      writeBoard(next)
      return next
    })
    setSave((prev) => {
      const next = { ...prev, name, country }
      writeSave(next)
      return next
    })
  }, [stats.turns, stats.elapsed])

  const buy = useCallback((id) => {
    setSave((prev) => {
      const u = UPGRADES.find((x) => x.id === id)
      const level = prev.levels[id] ?? 0
      const cost = costOf(u, level)
      if (level >= u.max || (prev.money ?? 0) < cost) return prev
      if (u.needs && !(prev.levels[u.needs] > 0)) return prev
      const next = { ...prev, money: prev.money - cost, levels: { ...prev.levels, [id]: level + 1 } }
      writeSave(next)
      return next
    })
  }, [])

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
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={16}
          shadow-camera-bottom={-16}
          shadow-bias={-0.0006}
        />

        <Suspense fallback={null}>
          <Environment files={ENV_MAPS.studio.url} />
          <Stage
            key={resetKey}
            mode={mode}
            board={board}
            derived={derived}
            params={params}
            phase={phase}
            onStats={setStats}
            onEnd={onEnd}
            onRestart={start}
          />
        </Suspense>

        <ContactShadows position={[0, -0.32, 0]} opacity={0.45} scale={board.size * 2} blur={2.6} far={4} />
        <Rig size={board.size} tilt={params.tilt} />
      </Canvas>

      {mode === 'time' && phase !== 'title' && <Leaderboard list={lb} />}

      {phase === 'run' && (
        <Hud
          mode={mode}
          score={stats.score}
          money={(save.money ?? 0) + (mode === 'idle' ? stats.earned : 0)}
          turns={stats.turns}
          remaining={stats.remaining}
          best={save.best ?? 0}
        />
      )}

      {phase === 'title' && <TitleCard onPick={pickMode} />}

      {phase === 'ready' && <StartCard mode={mode} seconds={derived.runSeconds} onStart={start} />}

      {phase === 'over' && mode === 'idle' && (
        <Shop
          money={save.money ?? 0}
          levels={save.levels}
          earned={stats.earned}
          onBuy={buy}
          onStart={start}
          onTitle={goTitle}
        />
      )}

      {phase === 'over' && mode !== 'idle' && (
        <ResultCard
          mode={mode}
          reason={reason}
          score={stats.score}
          turns={stats.turns}
          elapsed={stats.elapsed}
          best={mode === 'time' ? (save.bestTurns ?? 0) : (save.best ?? 0)}
          canRecord={mode === 'time' && reason === 'filled' && qualifies(lb, stats.turns)}
          defaults={{ name: save.name ?? '', country: save.country ?? guessCountry() }}
          onSubmit={submitScore}
          onRestart={start}
          onTitle={goTitle}
        />
      )}

      {phase === 'run' && <div className="snk__hint">ARROWS OR WASD — ONE PRESS, ONE TURN</div>}
    </div>
  )
}
