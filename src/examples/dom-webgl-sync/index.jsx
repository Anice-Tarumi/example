import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { tileVertexShader, tileFragmentShader } from './glsl/tile'
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
                onPointerEnter={() => { shared.hover.current = i }}
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
