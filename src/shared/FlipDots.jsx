import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { generateBlueNoise } from './blueNoise'

/**
 * 機械式フリップドットの盤。
 *
 * 呼び手は `bits`（0/1 の Uint8Array）を書き換えるだけ。
 * **こちらは差分を見て、変わったマスだけ裏返す。**
 * 毎回すべて裏返すと、掲示板ではなく点滅する板になる。
 *
 * 1 マスは薄い箱で、回転は CPU で組む。数百枚なら行列計算は問題にならず、
 * 頂点シェーダーを書かないぶん影も環境光もそのまま効く。
 */

const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()

export const FLIP_ORDERS = { Sweep: 'sweep', Radial: 'radial', 'Blue noise': 'blue', Instant: 'instant' }

export function FlipDots({
  cols, rows, bits,
  pitch = 1.06, flipTime = 0.16, stagger = 0.32, order = 'sweep',
  onColor = '#f2e9c9', offColor = '#1b1c20', dot = 0.86, thickness = 0.14,
}) {
  const count = cols * rows
  const mesh = useRef(null)

  const geo = useMemo(() => new THREE.BoxGeometry(dot, dot, thickness), [dot, thickness])
  useEffect(() => () => geo.dispose(), [geo])

  // 盤が今出している状態。呼び手の bits との差分を取るために持つ
  const shown = useMemo(() => new Uint8Array(count), [count])
  const prog = useMemo(() => new Float32Array(count), [count])
  const delay = useMemo(() => new Float32Array(count), [count])
  const noise = useMemo(() => generateBlueNoise(Math.max(8, Math.max(cols, rows))), [cols, rows])
  // 初回だけ全マス書く。以後は動いたマスだけ書き直す
  const primed = useRef(false)
  useEffect(() => { primed.current = false }, [count])

  const moved = useMemo(() => [], [])

  const orderOf = (x, y) => {
    if (order === 'instant') return 0
    if (order === 'sweep') return x / Math.max(1, cols - 1)
    if (order === 'radial') {
      return Math.hypot(x - (cols - 1) / 2, y - (rows - 1) / 2) / (Math.hypot(cols, rows) * 0.5)
    }
    // data は 0..255。0..1 のつもりで掛けると 255 倍の待ちになる
    return noise.data[(y % noise.size) * noise.size + (x % noise.size)] / 255
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)

    // --- 差分を拾って予約する ---
    for (let i = 0; i < count; i++) {
      if (bits[i] === shown[i]) continue
      shown[i] = bits[i]
      delay[i] = orderOf(i % cols, (i / cols) | 0) * stagger
    }

    /*
     * 進行度を目標へ寄せる。**動いたマスだけ**を控えておく。
     * 千枚を毎フレーム書き直すと、静止していても CPU を使い切る。
     * 実際に動くのは秒あたり数枚から数十枚しかない。
     */
    const speed = dt / Math.max(0.02, flipTime)
    moved.length = 0
    for (let i = 0; i < count; i++) {
      if (delay[i] > 0) { delay[i] = Math.max(0, delay[i] - dt); continue }
      const d = shown[i] - prog[i]
      if (d === 0) continue
      prog[i] += Math.sign(d) * Math.min(Math.abs(d), speed)
      moved.push(i)
    }

    const m = mesh.current
    if (!m) return

    const halfX = (cols - 1) / 2
    const halfY = (rows - 1) / 2
    const write = (i) => {
      const p = prog[i]
      dummy.position.set(((i % cols) - halfX) * pitch, (((i / cols) | 0) - halfY) * pitch, 0)
      dummy.rotation.set(p * Math.PI, 0, 0)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      // 半分を越えた瞬間に色が入れ替わる。回転と一致するので板に見える
      tmpColor.set(p > 0.5 ? onColor : offColor)
      m.setColorAt(i, tmpColor)
    }

    if (!primed.current) {
      for (let i = 0; i < count; i++) write(i)
      primed.current = true
    } else {
      for (const i of moved) write(i)
      if (!moved.length) return
    }

    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[geo, undefined, count]} castShadow receiveShadow key={count}>
      <meshStandardMaterial roughness={0.5} metalness={0.05} />
    </instancedMesh>
  )
}

/**
 * 盤の上のどのマスを指しているか。
 *
 * ドット自体に当たり判定を持たせない。回転中のマスは形が変わるうえ、
 * 数百枚に個別のイベントを付けると重い。**平らな板を 1 枚重ねて**、
 * その uv から列と行を割り出す。
 */
export function FlipPicker({ cols, rows, pitch, onCell }) {
  const prev = useRef(null)

  const handle = (e) => {
    if (!e.uv) return
    const cur = { x: e.uv.x, y: e.uv.y }
    const from = prev.current ?? cur
    prev.current = cur

    // 通り道も拾う。pointermove は軌跡を全点くれない
    const step = Math.min(1 / cols, 1 / rows) * 0.5
    const dist = Math.hypot(cur.x - from.x, cur.y - from.y)
    const n = Math.min(64, Math.max(1, Math.ceil(dist / step)))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      const u = from.x + (cur.x - from.x) * t
      const v = from.y + (cur.y - from.y) * t
      const x = Math.min(cols - 1, Math.max(0, Math.floor(u * cols)))
      const y = Math.min(rows - 1, Math.max(0, Math.floor(v * rows)))
      onCell(x, y, e)
    }
  }

  return (
    <mesh
      scale={[cols * pitch, rows * pitch, 1]}
      position={[0, 0, 0.2]}
      onPointerMove={handle}
      onPointerDown={handle}
      onPointerOut={() => { prev.current = null }}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  )
}
