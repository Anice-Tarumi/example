import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * 屈折させる対象。
 *
 * transmission は「背景をもう一度描いてサンプルする」仕組みなので、
 * 後ろに構造と色が無いと何も起きていないように見える。
 * 分散（RGB のずれ）が読み取れるよう、色相の離れた細い縦帯を並べている。
 */

const BAR_COLORS = ['#ff4d5a', '#ffb03a', '#3ce88f', '#33b9ff', '#a361ff', '#ff5ec4']

export function Backdrop({ spin = 0.06 }) {
  const group = useRef(null)

  useFrame((state, delta) => {
    if (group.current) group.current.rotation.y += delta * spin
  })

  const bars = useMemo(() => {
    const items = []
    const count = 26
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      // カメラを囲まないよう十分外側に置く。近すぎると画面を覆ってしまう
      const r = 7.5
      items.push({
        key: i,
        position: [Math.cos(a) * r, 0, Math.sin(a) * r],
        rotation: [0, -a, 0],
        color: BAR_COLORS[i % BAR_COLORS.length],
        height: 3.2 + (i % 3) * 1.4,
      })
    }
    return items
  }, [])

  // 屈折光は大きく曲がるので、背後の広い範囲に色が無いと暗いところを拾ってしまう。
  // 円筒状の色面で全周を覆っておく。
  const wallTex = useMemo(() => {
    const w = 1024
    const h = 256
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, w, 0)
    BAR_COLORS.forEach((c, i) => g.addColorStop(i / (BAR_COLORS.length - 1), c))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // 上下を落として、屈折で上下を拾ったときに白飛びしないようにする
    const v = ctx.createLinearGradient(0, 0, 0, h)
    v.addColorStop(0, 'rgba(0,0,0,0.55)')
    v.addColorStop(0.5, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    return tex
  }, [])

  const checker = useMemo(() => {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const n = 12
    const c = size / n
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#0d1118' : '#1b2432'
        ctx.fillRect(x * c, y * c, c, c)
      }
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 3)
    return tex
  }, [])

  return (
    <group ref={group}>
      {bars.map((b) => (
        <mesh key={b.key} position={b.position} rotation={b.rotation}>
          <boxGeometry args={[0.5, b.height, 0.5]} />
          <meshStandardMaterial
            color={b.color}
            emissive={b.color}
            emissiveIntensity={0.55}
            roughness={0.4}
          />
        </mesh>
      ))}

      <mesh>
        <cylinderGeometry args={[11, 11, 9, 64, 1, true]} />
        <meshBasicMaterial map={wallTex} side={THREE.BackSide} toneMapped={false} />
      </mesh>

      <mesh position={[0, -2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial map={checker} roughness={0.85} color="#8fa6c0" />
      </mesh>
    </group>
  )
}
