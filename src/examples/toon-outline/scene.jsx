import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createGBufferMaterial } from './material'

/**
 * 低ポリの島。全メッシュが同じ規約で G-Buffer へ書き出す。
 *
 * surfaceId はメッシュごとに違う値を振る。地面は「草」と「土」で
 * 同一平面上に別 ID を置いてあり、深度も法線も連続なのに線が引かれることを見せる。
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const PALETTE = {
  grass: { color: '#7fc45f', shadow: '#2f6b3c' },
  dirt: { color: '#c99a5e', shadow: '#6b4a2a' },
  rock: { color: '#9aa4b0', shadow: '#454f5c' },
  trunk: { color: '#8a5a34', shadow: '#3d2416' },
  leaf: { color: '#4fae63', shadow: '#1f5b34' },
  roof: { color: '#d8604f', shadow: '#6d2620' },
  wall: { color: '#f0e2c8', shadow: '#8d7c62' },
  water: { color: '#59b8d8', shadow: '#245d7d' },
}

export function Island({ params }) {
  const group = useRef(null)

  const items = useMemo(() => {
    const rand = makeRandom(0xa17e5)
    const list = []
    let id = 0
    const nextId = () => {
      id += 1
      // 0..1 に収める。近い ID でも差が出るよう間隔を空ける
      return (id * 0.137) % 1
    }

    const push = (key, geometry, position, rotation, scale) =>
      list.push({
        key: `${key}-${list.length}`,
        geometry,
        position,
        rotation: rotation || [0, 0, 0],
        scale: scale || 1,
        palette: PALETTE[key],
        surfaceId: nextId(),
      })

    // 島の土台。低ポリに見せるため分割数を落とす
    push('dirt', new THREE.CylinderGeometry(2.6, 2.0, 1.1, 9, 1), [0, -0.75, 0])

    // 草地。土台と同じ高さに乗せる＝深度も法線もほぼ同じで、ID だけが違う
    push('grass', new THREE.CylinderGeometry(2.62, 2.62, 0.24, 9, 1), [0, -0.08, 0])

    // 池。これも同一平面上の別 ID
    push('water', new THREE.CylinderGeometry(0.78, 0.78, 0.26, 12, 1), [0.95, -0.05, 0.5])

    // 木
    const treeSpots = [
      [-1.25, 0.35], [-0.55, -1.05], [0.3, -0.45], [-1.5, -0.55], [0.15, 1.2],
    ]
    for (const [x, z] of treeSpots) {
      const h = 0.9 + rand() * 0.5
      push('trunk', new THREE.CylinderGeometry(0.09, 0.12, h, 6), [x, 0.04 + h / 2, z])
      push('leaf', new THREE.ConeGeometry(0.46, 1.0, 7), [x, 0.04 + h + 0.4, z])
      push('leaf', new THREE.ConeGeometry(0.34, 0.8, 7), [x, 0.04 + h + 0.85, z])
    }

    // 岩
    for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2
      const r = 0.9 + rand() * 1.1
      const s = 0.16 + rand() * 0.16
      push(
        'rock',
        new THREE.IcosahedronGeometry(1, 0),
        [Math.cos(a) * r, 0.06, Math.sin(a) * r],
        [rand() * 3, rand() * 3, rand() * 3],
        s,
      )
    }

    // 小屋
    push('wall', new THREE.BoxGeometry(0.72, 0.55, 0.62), [1.15, 0.32, -0.75])
    push('roof', new THREE.ConeGeometry(0.62, 0.42, 4), [1.15, 0.79, -0.75], [0, Math.PI / 4, 0])

    return list
  }, [])

  const materials = useMemo(
    () =>
      items.map((it) =>
        createGBufferMaterial({
          color: it.palette.color,
          shadowColor: it.palette.shadow,
          surfaceId: it.surfaceId,
        }),
      ),
    [items],
  )

  useFrame((state, delta) => {
    if (group.current) group.current.rotation.y += delta * params.spin
    for (const m of materials) {
      if (!m.uniforms) continue
      m.uniforms.uSteps.value = params.toonSteps
      m.uniforms.uSketch.value = params.sketch
      m.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh
          key={it.key}
          geometry={it.geometry}
          material={materials[i]}
          position={it.position}
          rotation={it.rotation}
          scale={it.scale}
        />
      ))}
    </group>
  )
}
