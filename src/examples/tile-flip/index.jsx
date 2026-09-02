import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import frontUrl from '../../assets/photos/scene-a.jpg'
import backUrl from '../../assets/photos/scene-b.jpg'
import { generateBlueNoise } from '../../shared/blueNoise'
import { tileVertexShader, tileFragmentShader } from './glsl/tiles'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

const ORDERS = { Row: 'row', Column: 'column', Diagonal: 'diagonal', Radial: 'radial', 'Blue noise': 'blue' }
const AXES = { 'Horizontal axis': 'x', 'Vertical axis': 'y' }
const MODES = { 'Hover each tile': 'hover', 'Auto sweep': 'auto' }

/**
 * めくる順番。
 *
 * 乱数を毎回引くと固まりや空白ができて「散らばった」に見えない。
 * 青ノイズは低周波成分を持たないので、値が均等に散る。
 */
function buildDelays(cols, rows, order) {
  const n = cols * rows
  const delay = new Float32Array(n)
  // generateBlueNoise は { data, size }。size は 1 辺なので、そこから引く
  const noise = order === 'blue' ? generateBlueNoise(Math.max(cols, rows)) : null
  const maxD = Math.hypot(cols - 1, rows - 1)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      let d
      if (order === 'row') d = y / Math.max(1, rows - 1)
      else if (order === 'column') d = x / Math.max(1, cols - 1)
      else if (order === 'diagonal') d = (x + y) / Math.max(1, cols + rows - 2)
      else if (order === 'radial') d = Math.hypot(x - (cols - 1) / 2, y - (rows - 1) / 2) / (maxD * 0.5)
      else d = noise.data[(y % noise.size) * noise.size + (x % noise.size)]
      delay[i] = Math.min(1, Math.max(0, d))
    }
  }
  return delay
}

function Tiles({ params }) {
  const viewport = useThree((s) => s.viewport)
  const [front, back] = useTexture([frontUrl, backUrl])

  useEffect(() => {
    for (const t of [front, back]) {
      t.colorSpace = THREE.SRGBColorSpace
      t.needsUpdate = true
    }
  }, [front, back])

  const cols = Math.round(params.cols)
  const rows = Math.round(params.rows)

  // 板は画面の幅いっぱい。高さは 3:2 で置いて、はみ出しは cover で吸収する
  const size = useMemo(() => {
    const w = Math.min(viewport.width * 0.86, 6.4)
    return new THREE.Vector2(w, w * 0.62)
  }, [viewport.width])

  const geometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.attributes.position = base.attributes.position
    geo.attributes.uv = base.attributes.uv

    const n = cols * rows
    const tile = new Float32Array(n * 2)
    const spin = new Float32Array(n)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        tile[i * 2] = x
        tile[i * 2 + 1] = y
        // 手前へ出る量のばらつき。全部同じだと板が一枚の面に見える
        spin[i] = ((x * 73856093) ^ (y * 19349663)) % 1000 / 1000
      }
    }
    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tile, 2))
    geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 1))
    // 板ごとの進行度。hover モードで CPU が毎フレーム書く
    geo.setAttribute('aProg', new THREE.InstancedBufferAttribute(new Float32Array(n), 1))
    geo.instanceCount = n
    base.dispose()
    return geo
  }, [cols, rows])
  useEffect(() => () => geometry.dispose(), [geometry])

  // 順番だけ差し替えられるよう、delay は別 attribute にしておく
  useEffect(() => {
    const delay = buildDelays(cols, rows, params.order)
    geometry.setAttribute('aDelay', new THREE.InstancedBufferAttribute(delay, 1))
  }, [geometry, cols, rows, params.order])

  const uniforms = useMemo(
    () => ({
      uFront: { value: front },
      uBack: { value: back },
      uFrontScale: { value: new THREE.Vector2(1, 1) },
      uBackScale: { value: new THREE.Vector2(1, 1) },
      uGrid: { value: new THREE.Vector2(cols, rows) },
      uSize: { value: size.clone() },
      uProgress: { value: 0 },
      uStagger: { value: DEFAULTS.stagger },
      uLift: { value: DEFAULTS.lift },
      uGap: { value: DEFAULTS.gap },
      uAxisMix: { value: 0 },
      uHover: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0.4, 0.6, 1) },
      uAmbient: { value: DEFAULTS.ambient },
      uEdge: { value: DEFAULTS.edge },
    }),
    // 中身は useFrame で毎フレーム入れ直すので、作り直すのは初回だけでよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [front, back],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: tileVertexShader,
        fragmentShader: tileFragmentShader,
        uniforms,
        side: THREE.DoubleSide,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  /** cover。画像とタイル面の縦横比の差を uv 側で吸収する */
  const coverScale = (tex, out) => {
    const img = tex.image
    if (!img) return out
    const target = size.x / size.y
    const src = img.width / img.height
    if (src > target) out.set(target / src, 1)
    else out.set(1, src / target)
    return out
  }

  const progress = useRef(0)
  const dir = useRef(1)
  const wait = useRef(0)

  /*
   * 板ごとのめくり。
   *
   * 目標（0 か 1）を持ち、進行度をそこへ寄せる。カーソルが乗った瞬間に
   * 目標を反転させるだけなので、行き帰りが同じコードで済む。
   * **入ったタイルが変わったときだけ**反転させないと、同じ板の上で
   * 動かしている間ずっと裏返り続ける。
   */
  const target = useRef(new Float32Array(0))
  const lastTile = useRef(-1)
  const prevUv = useRef(null)

  useEffect(() => {
    target.current = new Float32Array(cols * rows)
    lastTile.current = -1
  }, [cols, rows])

  const flipAt = (u, v) => {
    const x = Math.min(cols - 1, Math.max(0, Math.floor(u * cols)))
    const y = Math.min(rows - 1, Math.max(0, Math.floor(v * rows)))
    const i = y * cols + x
    if (i === lastTile.current) return
    lastTile.current = i
    const t = target.current
    if (i < t.length) t[i] = t[i] > 0.5 ? 0 : 1
  }

  /*
   * 判定は**別に置いた板**で取る。
   *
   * タイルのジオメトリは原点にある 1×1 の板 1 枚で、格子への配置は全部
   * 頂点シェーダーの中。レイキャストは CPU 側のジオメトリを見るので、
   * このメッシュを直接触らせると原点の 1 ユニット四方しか当たらず、
   * uv も格子と対応しない。
   *
   * 通り道も補間する。pointermove は軌跡を全点くれないので、速く動かすと
   * 横切ったタイルの大半が素通りになる。
   */
  const onMove = (e) => {
    if (params.mode !== 'hover' || !e.uv) return
    const cur = { x: e.uv.x, y: e.uv.y }
    const prev = prevUv.current ?? cur
    prevUv.current = cur

    const step = Math.min(1 / cols, 1 / rows) * 0.5
    const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const n = Math.min(48, Math.max(1, Math.ceil(dist / step)))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      flipAt(prev.x + (cur.x - prev.x) * t, prev.y + (cur.y - prev.y) * t)
    }
  }

  useFrame((_, delta) => {
    const hover = params.mode === 'hover'
    uniforms.uHover.value = hover ? 1 : 0

    if (hover) {
      // 目標へ寄せる。指数で寄せると最後がだらだら残るので線形で詰める
      const attr = geometry.getAttribute('aProg')
      const arr = attr.array
      const step = delta / Math.max(0.05, params.flipTime)
      const tg = target.current
      let dirty = false
      for (let i = 0; i < arr.length && i < tg.length; i++) {
        const d = tg[i] - arr[i]
        if (d === 0) continue
        arr[i] += Math.sign(d) * Math.min(Math.abs(d), step)
        dirty = true
      }
      if (dirty) attr.needsUpdate = true
    } else if (params.autoplay) {
      if (wait.current > 0) {
        wait.current -= delta
      } else {
        progress.current += dir.current * delta * params.speed
        if (progress.current >= 1) { progress.current = 1; dir.current = -1; wait.current = params.hold }
        if (progress.current <= 0) { progress.current = 0; dir.current = 1; wait.current = params.hold }
      }
    } else if (!hover) {
      progress.current = params.progress
    }

    uniforms.uProgress.value = progress.current
    uniforms.uGrid.value.set(cols, rows)
    uniforms.uSize.value.copy(size)
    uniforms.uStagger.value = params.stagger
    uniforms.uLift.value = params.lift
    uniforms.uGap.value = params.gap
    uniforms.uAxisMix.value = params.axis === 'y' ? 1 : 0
    uniforms.uAmbient.value = params.ambient
    uniforms.uEdge.value = params.edge

    const a = (params.lightAngle * Math.PI) / 180
    uniforms.uLightDir.value.set(Math.cos(a), Math.sin(a), 1).normalize()

    coverScale(front, uniforms.uFrontScale.value)
    coverScale(back, uniforms.uBackScale.value)
  })

  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} />

      {/* 判定用。描かないが当たる板。格子と同じ大きさに合わせる */}
      <mesh
        scale={[size.x, size.y, 1]}
        position={[0, 0, 0.002]}
        onPointerMove={onMove}
        onPointerOut={() => { lastTile.current = -1; prevUv.current = null }}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </>
  )
}

export default function TileFlip() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Grid: folder({
      cols: { value: DEFAULTS.cols, min: 2, max: 40, step: 1 },
      rows: { value: DEFAULTS.rows, min: 2, max: 28, step: 1 },
      gap: { value: DEFAULTS.gap, min: 0, max: 0.3, step: 0.01 },
    }),
    Flip: folder({
      mode: { value: DEFAULTS.mode, options: MODES },
      flipTime: { value: DEFAULTS.flipTime, min: 0.1, max: 2, step: 0.05, label: 'flip time' },
      order: { value: DEFAULTS.order, options: ORDERS },
      axis: { value: DEFAULTS.axis, options: AXES },
      stagger: { value: DEFAULTS.stagger, min: 0, max: 0.95, step: 0.05 },
      lift: { value: DEFAULTS.lift, min: 0, max: 1.2, step: 0.02 },
      autoplay: { value: DEFAULTS.autoplay },
      speed: { value: DEFAULTS.speed, min: 0.05, max: 1.5, step: 0.05 },
      hold: { value: DEFAULTS.hold, min: 0, max: 4, step: 0.1, label: 'hold' },
      progress: { value: DEFAULTS.progress, min: 0, max: 1, step: 0.01 },
    }),
    Look: folder({
      ambient: { value: DEFAULTS.ambient, min: 0, max: 1, step: 0.02 },
      edge: { value: DEFAULTS.edge, min: 0, max: 1, step: 0.02, label: 'edge shade' },
      lightAngle: { value: DEFAULTS.lightAngle, min: 0, max: 360, step: 1, label: 'light' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#0b0c0f']} />
      <Suspense fallback={null}>
        <Tiles params={params} />
      </Suspense>
    </Canvas>
  )
}
