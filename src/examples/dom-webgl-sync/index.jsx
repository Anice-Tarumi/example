import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { tileVertexShader, tileFragmentShader } from './glsl/tile'
import { orbVertexShader, orbFragmentShader } from './glsl/orb'
import { measureAll, projectToScreen } from './sync'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'
import './styles.css'

const TILES = [
  { title: 'Measure', body: '矩形は毎フレーム測る。CSS 遷移や遅延読み込みでレイアウトは動く' },
  { title: 'Batch', body: '全部測ってから、全部動かす。1 枚ずつだと測るたびにレイアウトが走る' },
  { title: 'Pixels', body: '1 world = 1 px。正射影を画面と同じ寸法で切れば倍率が要らない' },
  { title: 'Transform', body: 'DOM 側は transform だけで動かす。top / left は毎回レイアウトを起こす' },
  { title: 'Events', body: 'キャンバスは pointer-events: none。当たり判定は DOM に任せる' },
  { title: 'Project', body: 'camera.project は -1〜1。画面の寸法を掛けて左上原点へ直す' },
]

/** 節の名前。3D の頂点に貼り付ける */
const NODES = ['NE', 'NW', 'SE', 'SW', 'TOP']

function Tiles({ shared, params }) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 24, 24), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const materials = useMemo(() => TILES.map((_, i) => new THREE.ShaderMaterial({
    vertexShader: tileVertexShader,
    fragmentShader: tileFragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSize: { value: new THREE.Vector2(1, 1) },
      uScrollV: { value: 0 },
      uBend: { value: DEFAULTS.bend },
      uHover: { value: 0 },
      uEnter: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: i * 0.37 },
      uRadius: { value: DEFAULTS.radius },
      uColorA: { value: new THREE.Color(DEFAULTS.colorA) },
      uColorB: { value: new THREE.Color(DEFAULTS.colorB) },
    },
  })), [])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const meshes = useRef([])

  useFrame((state, delta) => {
    const host = shared.host.current
    const scroller = shared.scroller.current
    if (!host || !scroller) return
    const dt = Math.max(1 / 240, Math.min(delta, 1 / 20))

    // --- 読み。ここでまとめて測る ---
    const top = scroller.scrollTop
    const rects = measureAll(host, shared.items.current, shared.rects.current)
    // 錨は名前で引けるようにしておく。節の位置に使う
    rects.anchor = rects[TILES.length]

    // --- 書き。ここから先はレイアウトを読まない ---
    const v = (top - shared.scroll.current) / dt
    shared.scroll.current = top
    // 速度は均す。生の差分は 1 フレーム抜けただけで跳ねる
    shared.vel.current += (v - shared.vel.current) * Math.min(1, dt * 12)

    for (let i = 0; i < TILES.length; i++) {
      const m = meshes.current[i]
      const r = rects[i]
      if (!m || !r) continue
      m.visible = r.visible && r.w > 0
      if (!m.visible) continue

      /*
       * 遅れを入れられるようにしておく。0 なら DOM と完全に一致する。
       * 上げると板が置いていかれて、**同期が崩れると何が起きるか**が見える。
       */
      const lag = params.lag
      const px = m.userData
      px.x = lag > 0 ? THREE.MathUtils.lerp(px.x ?? r.x, r.x, 1 - lag) : r.x
      px.y = lag > 0 ? THREE.MathUtils.lerp(px.y ?? r.y, r.y, 1 - lag) : r.y

      m.position.set(px.x, px.y, 0)
      const u = materials[i].uniforms
      u.uSize.value.set(r.w, r.h)
      u.uScrollV.value = shared.vel.current
      u.uBend.value = params.bend
      u.uEnter.value = params.reveal ? r.enter : 1
      u.uTime.value = state.clock.elapsedTime
      u.uRadius.value = params.radius
      u.uColorA.value.set(params.colorA)
      u.uColorB.value.set(params.colorB)
      const want = shared.hover.current === i ? 1 : 0
      u.uHover.value += (want - u.uHover.value) * Math.min(1, dt * 10)
    }
  })

  return TILES.map((_, i) => (
    <mesh
      key={i}
      ref={(m) => { meshes.current[i] = m }}
      geometry={geometry}
      material={materials[i]}
      userData={{}}
      frustumCulled={false}
    />
  ))
}

/**
 * 3D の節と、それに追従する HTML ラベル。
 *
 * ラベルは DOM のまま置く。板に文字を焼くと、選べないし、拡大でぼやけるし、
 * 読み上げにも乗らない。**位置だけ WebGL から渡す。**
 */
function Nodes({ shared, params }) {
  const { size, camera } = useThree()
  const group = useRef(null)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const world = useMemo(() => new THREE.Vector3(), [])

  const { geometry, points } = useMemo(() => {
    const base = new THREE.IcosahedronGeometry(1, 0)
    const geo = new THREE.EdgesGeometry(base)
    base.dispose()
    // ラベルを付ける頂点。近すぎると札が重なるので、離れた 5 つを拾う
    const pts = [
      new THREE.Vector3(1, 0.6, 0.4), new THREE.Vector3(-1, 0.6, -0.4),
      new THREE.Vector3(0.4, -0.9, 0.9), new THREE.Vector3(-0.4, -0.9, -0.9),
      new THREE.Vector3(0, 1.1, 0),
    ].map((v) => v.normalize())
    return { geometry: geo, points: pts }
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state, delta) => {
    const g = group.current
    const anchor = shared.rects.current.anchor
    if (!g || !anchor) return

    g.position.set(anchor.x, anchor.y, 200)
    const r = Math.min(anchor.w, anchor.h) * 0.42 * params.nodeScale
    g.scale.setScalar(r)
    g.rotation.y += delta * params.nodeSpin
    g.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.35
    g.visible = anchor.visible

    for (let i = 0; i < points.length; i++) {
      const el = shared.labels.current[i]
      if (!el) continue
      world.copy(points[i]).applyMatrix4(g.matrixWorld)
      const s = projectToScreen(world, camera, size.width, size.height, tmp)

      /*
       * 裏に回った札は隠す。正射影なので視線は +z。
       * **回した後の向き**で見るので、頂点そのものではなく世界座標で判定する。
       */
      const facing = world.clone().sub(g.position).normalize().z
      const hidden = (params.occlude && facing < -0.05) || !anchor.visible
        || s.x < 0 || s.x > size.width || s.y < 0 || s.y > size.height

      // transform だけで動かす。top / left はそのつどレイアウトを起こす
      el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`
      el.style.opacity = hidden ? '0' : String(0.45 + 0.55 * Math.max(0, facing))
      if (params.readout) {
        const text = `${Math.round(s.x)}, ${Math.round(s.y)}`
        // 変わったときだけ書く。毎フレームの textContent は無駄な再計算を呼ぶ
        if (el.dataset.v !== text) {
          el.dataset.v = text
          el.querySelector('.dws__label-xy').textContent = text
        }
      }
    }
  })

  return (
    <group ref={group}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={params.nodeColor} transparent opacity={0.85} />
      </lineSegments>
      <mesh>
        <icosahedronGeometry args={[0.98, 0]} />
        <meshBasicMaterial color={params.nodeColor} transparent opacity={0.07} />
      </mesh>
    </group>
  )
}

/** 尾の節の数。頭を含む */
const TRAIL = 16

/**
 * ホバーしたカードへ渡り歩く印。
 *
 * **キャンバスが 1 枚であることの実演。** カードごとにキャンバスを置いて
 * いたら、自分の矩形の外には 1px も描けないので、カードとカードの隙間を
 * 横切れない。
 *
 * 尾は履歴を溜めずに、前の節へ寄っていく鎖で作る。溜めると frame 落ちの
 * たびに間隔が飛ぶ。
 */
function Traveler({ shared, params }) {
  const mesh = useRef(null)
  const state = useRef({ x: 0, y: 0, vx: 0, vy: 0, size: 0, chain: null })

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: orbVertexShader,
    fragmentShader: orbFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(DEFAULTS.orbColor) },
      uTime: { value: 0 },
      uGlow: { value: DEFAULTS.orbGlow },
    },
  }), [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  /*
   * 色の属性を先に作っておく。**`setColorAt` を一度も呼ばないうちは
   * `instanceColor` が存在せず**、シェーダーの前置きに attribute が入らない
   * まま組まれて落ちる。
   */
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < TRAIL; i++) m.setColorAt(i, color.setRGB(0, 0, 0))
    m.instanceColor.needsUpdate = true
  }, [color])

  useFrame((frame, delta) => {
    const m = mesh.current
    const rects = shared.rects.current
    if (!m || !rects.length) return
    const dt = Math.max(1 / 240, Math.min(delta, 1 / 20))
    const s = state.current

    /*
     * 離れても**直前のカードを追い続ける**。追従先を捨てると world 座標に
     * 留まり、カメラが動かないぶん画面に貼り付いて見える。カードは
     * スクロールで動くので、印だけ取り残される。
     */
    const active = shared.hover.current >= 0
    const i = active ? shared.hover.current : shared.last.current
    const target = i >= 0 ? rects[i] : null
    if (target && !s.chain) {
      // 最初の 1 回だけ跳ばずに置く。原点から飛んでくると何が起きたか分からない
      s.x = target.x
      s.y = target.y
      s.chain = Array.from({ length: TRAIL }, () => ({ x: s.x, y: s.y }))
    }
    // 追う先が画面の外なら描かない。宙に浮いた点だけが残る
    if (!s.chain || (target && !target.visible)) { m.visible = false; return }
    m.visible = true

    /*
     * ばね。減衰は臨界に近づけて、行き過ぎを 1 回だけに抑える。
     * 弱いと届くまでに間延びし、強いと瞬間移動して道筋が見えない。
     */
    if (target) {
      // 離れているときは硬く追う。スクロール中に遅れると置いていかれる
      const k = params.orbSpeed * 60 * (active ? 1 : 3)
      const damp = 2 * Math.sqrt(k) * 0.85
      s.vx += ((target.x - s.x) * k - s.vx * damp) * dt
      s.vy += ((target.y - s.y) * k - s.vy * damp) * dt
    } else {
      s.vx *= 0.9
      s.vy *= 0.9
    }
    s.x += s.vx * dt
    s.y += s.vy * dt

    // 触れていない間は縮んで待つ。消すと、次に現れたとき出所が分からない
    const want = (active && target ? Math.min(target.w, target.h) * 0.42 : 14) * params.orbSize
    s.size += (want - s.size) * Math.min(1, dt * 8)

    // 鎖。前の節へ寄る。頭が速いほど間隔が開いて尾が伸びる
    s.chain[0].x = s.x
    s.chain[0].y = s.y
    for (let n = 1; n < TRAIL; n++) {
      const a = s.chain[n]
      const b = s.chain[n - 1]
      const f = Math.min(1, dt * 26)
      a.x += (b.x - a.x) * f
      a.y += (b.y - a.y) * f
    }

    const speed = Math.hypot(s.vx, s.vy)
    // 進む向きへ伸ばし、直交方向へ潰す。体積を保つと生き物に見える
    const stretch = 1 + Math.min(1.4, speed / 900)

    for (let n = 0; n < TRAIL; n++) {
      const c = s.chain[n]
      const t = n / (TRAIL - 1)
      const sz = s.size * (1 - t * 0.82)
      dummy.position.set(c.x, c.y, 60 - n)
      dummy.rotation.z = n === 0 ? Math.atan2(s.vy, s.vx) : 0
      dummy.scale.set(sz * (n === 0 ? stretch : 1), sz / (n === 0 ? stretch : 1), 1)
      dummy.updateMatrix()
      m.setMatrixAt(n, dummy.matrix)
      // r = 濃さ / g = 頭かどうか
      color.setRGB((1 - t) * (1 - t) * (active ? 1 : 0.45), n === 0 ? 1 : 0, 0)
      m.setColorAt(n, color)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true

    material.uniforms.uTime.value = frame.clock.elapsedTime
    material.uniforms.uGlow.value = params.orbGlow
    material.uniforms.uColor.value.set(params.orbColor)
  })

  return <instancedMesh ref={mesh} args={[geometry, material, TRAIL]} frustumCulled={false} />
}

export default function DomWebglSync() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const shared = useMemo(() => ({
    host: { current: null },
    scroller: { current: null },
    items: { current: [] },
    rects: { current: [] },
    labels: { current: [] },
    hover: { current: -1 },
    // 直前に触れていたカード。離れても居場所を失わないように覚えておく
    last: { current: -1 },
    scroll: { current: 0 },
    vel: { current: 0 },
  }), [])

  const [params, setParams] = useControls(() => ({
    Tiles: folder({
      bend: { value: DEFAULTS.bend, min: 0, max: 3, step: 0.05, label: 'scroll bend' },
      radius: { value: DEFAULTS.radius, min: 0, max: 40, step: 1, label: 'corner (px)' },
      reveal: { value: DEFAULTS.reveal, label: 'wipe in' },
      lag: { value: DEFAULTS.lag, min: 0, max: 0.9, step: 0.02, label: 'desync' },
    }),
    Traveler: folder({
      orbSize: { value: DEFAULTS.orbSize, min: 0.2, max: 2, step: 0.05, label: 'size' },
      orbSpeed: { value: DEFAULTS.orbSpeed, min: 0.05, max: 1.2, step: 0.05, label: 'chase' },
      orbGlow: { value: DEFAULTS.orbGlow, min: 0, max: 3, step: 0.05, label: 'glow' },
      orbColor: { value: DEFAULTS.orbColor, label: 'colour' },
    }),
    Nodes: folder({
      nodeScale: { value: DEFAULTS.nodeScale, min: 0.3, max: 1.6, step: 0.05, label: 'size' },
      nodeSpin: { value: DEFAULTS.nodeSpin, min: -1.5, max: 1.5, step: 0.05, label: 'spin' },
      occlude: { value: DEFAULTS.occlude, label: 'hide behind' },
      readout: { value: DEFAULTS.readout, label: 'show px' },
    }),
    Look: folder({
      colorA: { value: DEFAULTS.colorA },
      colorB: { value: DEFAULTS.colorB },
      nodeColor: { value: DEFAULTS.nodeColor, label: 'node' },
      outline: { value: DEFAULTS.outline, label: 'show rects' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <div className={`dws${params.outline ? ' is-debug' : ''}`} ref={(el) => { shared.host.current = el }}>
      <div className="dws__scroll" ref={(el) => { shared.scroller.current = el }}>
        <article className="dws__article">
          <header className="dws__head">
            <p className="dws__kicker">DOM ↔ WebGL</p>
            <h1>座標を合わせる</h1>
            <p className="dws__lead">
              下の板は DOM ではない。文字と枠だけが DOM で、色の付いた面は
              キャンバスが描いている。スクロールしても重なったままなのは、
              毎フレーム矩形を測り直しているから。
            </p>
          </header>

          <div className="dws__grid">
            {TILES.map((t, i) => (
              <section
                key={t.title}
                className="dws__tile"
                ref={(el) => { shared.items.current[i] = { el } }}
                onPointerEnter={() => { shared.hover.current = i; shared.last.current = i }}
                onPointerLeave={() => { shared.hover.current = -1 }}
              >
                <h2>{t.title}</h2>
                <p>{t.body}</p>
              </section>
            ))}
          </div>

          <div
            className="dws__anchor"
            ref={(el) => { shared.items.current[TILES.length] = { el, key: 'anchor' } }}
          >
            <span>3D の頂点に HTML の札が付いている</span>
          </div>

          <p className="dws__foot">
            札は DOM のまま。板に文字を焼くと選べず、拡大でぼやけ、読み上げにも
            乗らない。位置だけ WebGL から渡す。
          </p>
        </article>
      </div>

      <div className="dws__canvas">
        <Canvas orthographic camera={{ position: [0, 0, 1000], near: 1, far: 3000, zoom: 1 }} dpr={[1, 2]}>
          <Tiles shared={shared} params={params} />
          <Traveler shared={shared} params={params} />
          <Nodes shared={shared} params={params} />
        </Canvas>
      </div>

      <div className="dws__labels">
        {NODES.map((n, i) => (
          <div className="dws__label" key={n} ref={(el) => { shared.labels.current[i] = el }}>
            <i className="dws__label-dot" />
            <span className="dws__label-name">{n}</span>
            {params.readout && <span className="dws__label-xy" />}
          </div>
        ))}
      </div>
    </div>
  )
}
