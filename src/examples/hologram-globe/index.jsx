import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  dotVertexShader, dotFragmentShader,
  lineVertexShader, lineFragmentShader,
  shellVertexShader, shellFragmentShader,
  coneVertexShader, coneFragmentShader,
} from './glsl/globe'
import { arcVertexShader, arcFragmentShader } from './glsl/arc'
import { buildArc, latLngToVec3, pickRoute, makeRandom } from './arcs'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'
import dotsUrl from './assets/land-dots.bin?url'
import coastUrl from './assets/coastlines.json?url'

const GLOBE_R = 2.2
/** 弧を刻む数。粗いと大圏が折れ線に見える */
const ARC_SEG = 44

/** 焼いた素材を読む。点は Int16 なので 1/32767 で戻す */
function useGlobeData() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch(dotsUrl).then((r) => r.arrayBuffer()),
      fetch(coastUrl).then((r) => r.json()),
    ]).then(([bin, rings]) => {
      if (!alive) return
      const q = new Int16Array(bin)
      const dots = new Float32Array(q.length)
      for (let i = 0; i < q.length; i++) dots[i] = q[i] / 32767
      setData({ dots, rings })
    })
    return () => { alive = false }
  }, [])

  return data
}

/** 陸の点。前から N 個取る。焼くときに混ぜてあるので、どこで切っても全球に散る */
function LandDots({ dots, count, uniforms, proj }) {
  const geometry = useMemo(() => {
    const n = Math.min(count, dots.length / 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(dots.subarray(0, n * 3), 3))
    // 頂点がずれるので、three が計算した範囲は当てにならない
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_R * 2)
    return geo
  }, [dots, count])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: dotVertexShader,
    fragmentShader: dotFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [uniforms])
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => { uniforms.uProj.value = proj.current })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

/** 海岸線。点だけでは大陸の形が読めない */
function Coastlines({ rings, uniforms }) {
  const geometry = useMemo(() => {
    const pos = []
    const v = new THREE.Vector3()
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        for (const [lng, lat] of [ring[i], ring[i + 1]]) {
          latLngToVec3(lat, lng, 1, v)
          pos.push(v.x, v.y, v.z)
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_R * 2)
    return geo
  }, [rings])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: lineVertexShader,
    fragmentShader: lineFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [uniforms])
  useEffect(() => () => material.dispose(), [material])

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />
}

/**
 * 都市を結ぶ弧。
 *
 * 本数ぶんの帯を最初に作っておき、着いたものから行き先を書き換えて使い回す。
 * 都度ジオメトリを作ると、飛ぶたびに GC が走って画がつまずく。
 */
function Arcs({ uniforms, params }) {
  const count = Math.round(params.arcs)
  const rand = useMemo(() => makeRandom(0x7f2a), [])

  const { geometry, birth, attrs } = useMemo(() => {
    // 帯の下地。長さ方向に刻み、幅は 2 点だけ
    const pos = new Float32Array((ARC_SEG + 1) * 2 * 3)
    const uv = new Float32Array((ARC_SEG + 1) * 2 * 2)
    const index = []
    for (let i = 0; i <= ARC_SEG; i++) {
      const t = i / ARC_SEG
      for (let s = 0; s < 2; s++) {
        uv[(i * 2 + s) * 2] = s
        uv[(i * 2 + s) * 2 + 1] = t
      }
      if (i < ARC_SEG) {
        const a = i * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    const geo = new THREE.InstancedBufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(index)

    const mk = (size) => new THREE.InstancedBufferAttribute(new Float32Array(count * size), size)
    const attrs = {
      aStart: mk(3), aC1: mk(3), aC2: mk(3), aEnd: mk(3), aSeed: mk(1), aBirth: mk(1),
    }
    for (const [k, v] of Object.entries(attrs)) geo.setAttribute(k, v)
    for (let i = 0; i < count; i++) attrs.aSeed.array[i] = rand() * 100
    geo.instanceCount = count
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_R * 3)

    // 着く予定の時刻。過ぎたものから撃ち直す
    return { geometry: geo, birth: new Float32Array(count).fill(-1e3), attrs }
  }, [count, rand])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: arcVertexShader,
    fragmentShader: arcFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [uniforms])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const life = params.arcDuration * (1 + params.arcTail * 2.5)
    let dirty = false
    for (let i = 0; i < count; i++) {
      if (t - birth[i] < life) continue
      const [from, to] = pickRoute(rand)
      const a = buildArc(from, to, params.arcLift)
      const o = i * 3
      attrs.aStart.array.set([a.start.x, a.start.y, a.start.z], o)
      attrs.aC1.array.set([a.c1.x, a.c1.y, a.c1.z], o)
      attrs.aC2.array.set([a.c2.x, a.c2.y, a.c2.z], o)
      attrs.aEnd.array.set([a.end.x, a.end.y, a.end.z], o)
      // 撃ち直しをばらす。揃うと一斉に飛んで機械に見える
      birth[i] = t + rand() * params.arcGap
      attrs.aBirth.array[i] = birth[i]
      dirty = true
    }
    if (dirty) for (const v of Object.values(attrs)) v.needsUpdate = true
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

/** 台座から像へ広がる光錐と、足元の輪 */
function Projector({ uniforms, tint }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: coneVertexShader,
    fragmentShader: coneFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [uniforms])
  useEffect(() => () => material.dispose(), [material])

  const base = -GLOBE_R * 1.85
  const h = Math.abs(base)

  return (
    <group>
      <mesh material={material} position={[0, base + h / 2, 0]}>
        {/* 上が広い開いた筒。閉じると光ではなく物体に見える */}
        <cylinderGeometry args={[GLOBE_R * 0.95, GLOBE_R * 0.12, h, 64, 1, true]} />
      </mesh>
      <mesh position={[0, base, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[GLOBE_R * 0.1, GLOBE_R * 0.34, 64]} />
        <meshBasicMaterial color={tint} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** 右上の leva が覆う幅。像がこの下に入ると何も見えない */
const PANEL_PX = 300

/**
 * 画面に収める。
 *
 * 像は球だけではない。**下に伸びた光錐まで含めて**中心を取る。球だけで
 * 合わせると、錐が画面の下へ突き抜ける。
 */
function Rig() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const top = GLOBE_R * 1.15
    const bottom = -GLOBE_R * 1.95
    const h = (top - bottom) / 0.88
    const w = GLOBE_R * 2.6

    const tan = Math.tan((camera.fov * Math.PI) / 360)
    const panel = size.width > 900 ? PANEL_PX : 0
    const usable = Math.max(200, size.width - panel)
    const dist = Math.max(h / 2 / tan, w / 2 / (tan * (usable / size.height)))

    // 1px あたりの世界の長さ。覆われる幅の半分だけ像を左へ寄せる
    const unit = (2 * dist * tan) / size.height
    const cx = (panel / 2) * unit
    const cy = (top + bottom) / 2

    camera.position.set(cx, cy + dist * 0.12, dist)
    // 中心を見る。原点を見ると寄せたぶんが打ち消される
    camera.lookAt(cx, cy, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  return null
}

/** 掴んで回す。離しても勢いが残る */
function useSpin(params) {
  const group = useRef(null)
  const drag = useRef({ on: false, x: 0, y: 0, vx: 0, vy: 0 })

  useEffect(() => {
    const d = drag.current
    const down = (e) => { d.on = true; d.x = e.clientX; d.y = e.clientY }
    const move = (e) => {
      if (!d.on) return
      d.vx = (e.clientX - d.x) * 0.006
      d.vy = (e.clientY - d.y) * 0.004
      d.x = e.clientX
      d.y = e.clientY
      const g = group.current
      if (!g) return
      g.rotation.y += d.vx
      // 極を越えさせない。越えると上下が反転して操作が分からなくなる
      g.rotation.x = THREE.MathUtils.clamp(g.rotation.x + d.vy, -0.7, 0.7)
    }
    const up = () => { d.on = false }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const g = group.current
    const d = drag.current
    if (!g) return
    if (!d.on) {
      // 慣性。急に止めると掴んだ手応えが消える
      g.rotation.y += d.vx
      g.rotation.x = THREE.MathUtils.clamp(g.rotation.x + d.vy, -0.7, 0.7)
      d.vx *= 0.94
      d.vy *= 0.94
      g.rotation.y += params.spin * dt
    }
  })

  return group
}

function Scene({ params, proj }) {
  const data = useGlobeData()
  const size = useThree((s) => s.size)
  const group = useSpin(params)

  /*
   * 見た目の値は 1 か所にまとめる。層ごとに持つと、同じ装置から出た光に
   * 見えない。強さだけ層ごとに変える。
   */
  const holo = useMemo(() => ({
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(DEFAULTS.tint) },
    uScanFreq: { value: DEFAULTS.scanFreq },
    uScanSpeed: { value: DEFAULTS.scanSpeed },
    uScanGain: { value: DEFAULTS.scanGain },
    uGlitch: { value: DEFAULTS.glitch },
    uFlicker: { value: DEFAULTS.flicker },
    uRadius: { value: GLOBE_R },
  }), [])

  const dotU = useMemo(() => ({ ...holo, uProj: { value: 800 }, uSize: { value: DEFAULTS.dot }, uGain: { value: 1 } }), [holo])
  const lineU = useMemo(() => ({ ...holo, uGain: { value: DEFAULTS.lineGain } }), [holo])
  const shellU = useMemo(() => ({ ...holo, uGain: { value: DEFAULTS.shellGain }, uPower: { value: DEFAULTS.shellPower } }), [holo])
  const coneU = useMemo(() => ({ ...holo, uGain: { value: DEFAULTS.coneGain } }), [holo])
  const arcU = useMemo(() => ({
    ...holo,
    uGain: { value: DEFAULTS.arcGain },
    uThickness: { value: DEFAULTS.arcWidth },
    uDuration: { value: DEFAULTS.arcDuration },
    uTail: { value: DEFAULTS.arcTail },
    uHeadTint: { value: new THREE.Color(DEFAULTS.arcTint) },
  }), [holo])

  const shellMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: shellVertexShader,
    fragmentShader: shellFragmentShader,
    uniforms: shellU,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  }), [shellU])
  useEffect(() => () => shellMat.dispose(), [shellMat])

  useFrame((state) => {
    holo.uTime.value = state.clock.elapsedTime
    holo.uTint.value.set(params.tint)
    holo.uScanFreq.value = params.scanFreq
    holo.uScanSpeed.value = params.scanSpeed
    holo.uScanGain.value = params.scanGain
    holo.uGlitch.value = params.glitch
    holo.uFlicker.value = params.flicker
    dotU.uSize.value = params.dot
    lineU.uGain.value = params.lineGain
    shellU.uGain.value = params.shellGain
    shellU.uPower.value = params.shellPower
    coneU.uGain.value = params.coneGain
    arcU.uGain.value = params.arcGain
    arcU.uThickness.value = params.arcWidth
    arcU.uDuration.value = params.arcDuration
    arcU.uTail.value = params.arcTail
    arcU.uHeadTint.value.set(params.arcTint)
    // 深さ 1 での 1 単位あたりの画素数。点の大きさを遠近に合わせる
    proj.current = size.height / (2 * Math.tan((state.camera.fov * Math.PI) / 360))
  })

  return (
    <>
      <Rig />
      <Projector uniforms={coneU} tint={params.tint} />
      <group ref={group} rotation={[0.28, 0, 0.1]}>
        {data && <LandDots dots={data.dots} count={Math.round(params.dots)} uniforms={dotU} proj={proj} />}
        {data && <Coastlines rings={data.rings} uniforms={lineU} />}
        <mesh material={shellMat}>
          <sphereGeometry args={[GLOBE_R * 1.02, 64, 48]} />
        </mesh>
        <Arcs uniforms={arcU} params={params} />
      </group>
    </>
  )
}

export default function HologramGlobe() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })
  const proj = useRef(800)

  const [params, setParams] = useControls(() => ({
    Globe: folder({
      dots: { value: DEFAULTS.dots, min: 2000, max: 26000, step: 500 },
      dot: { value: DEFAULTS.dot, min: 0.5, max: 5, step: 0.1, label: 'dot size' },
      lineGain: { value: DEFAULTS.lineGain, min: 0, max: 2, step: 0.05, label: 'coastline' },
      spin: { value: DEFAULTS.spin, min: -0.6, max: 0.6, step: 0.01 },
    }),
    Signal: folder({
      scanFreq: { value: DEFAULTS.scanFreq, min: 0.5, max: 30, step: 0.5, label: 'scan lines' },
      scanSpeed: { value: DEFAULTS.scanSpeed, min: 0, max: 2, step: 0.02, label: 'scan speed' },
      scanGain: { value: DEFAULTS.scanGain, min: 0, max: 2, step: 0.05, label: 'scan gain' },
      glitch: { value: DEFAULTS.glitch, min: 0, max: 0.6, step: 0.01 },
      flicker: { value: DEFAULTS.flicker, min: 0, max: 0.6, step: 0.01 },
    }),
    Volume: folder({
      shellGain: { value: DEFAULTS.shellGain, min: 0, max: 2, step: 0.05, label: 'rim' },
      shellPower: { value: DEFAULTS.shellPower, min: 0.5, max: 6, step: 0.1, label: 'rim falloff' },
      coneGain: { value: DEFAULTS.coneGain, min: 0, max: 2, step: 0.05, label: 'beam' },
    }),
    Arcs: folder({
      arcs: { value: DEFAULTS.arcs, min: 0, max: 80, step: 1, label: 'count' },
      arcDuration: { value: DEFAULTS.arcDuration, min: 0.3, max: 6, step: 0.1, label: 'travel (s)' },
      arcGap: { value: DEFAULTS.arcGap, min: 0, max: 8, step: 0.1, label: 'restagger' },
      arcTail: { value: DEFAULTS.arcTail, min: 0.05, max: 1, step: 0.05, label: 'tail' },
      arcWidth: { value: DEFAULTS.arcWidth, min: 0.002, max: 0.06, step: 0.002, label: 'width' },
      arcLift: { value: DEFAULTS.arcLift, min: 0, max: 1.2, step: 0.05, label: 'lift' },
      arcGain: { value: DEFAULTS.arcGain, min: 0, max: 3, step: 0.05, label: 'glow' },
    }),
    Look: folder({
      tint: { value: DEFAULTS.tint },
      arcTint: { value: DEFAULTS.arcTint, label: 'arc head' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ fov: 34, position: [0, 1.6, 13], near: 0.1, far: 100 }} dpr={[1, 2]}>
      <color attach="background" args={[params.background]} />
      <Scene params={params} proj={proj} />
    </Canvas>
  )
}
