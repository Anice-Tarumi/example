import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * 2 つの部屋。素材は持たず、箱と色だけで作る。
 *
 * **見分けが付くことが最優先。** 窓の向こうが同じ質感だと、ポータルが
 * 効いているのか、ただ壁に穴が開いているのか分からない。
 * 明るさ・色・物の形をまとめて変える。
 */

export const ROOM = { w: 12, h: 4.2, d: 12 }

function Walls({ color, floor, ceiling }) {
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const half = { x: ROOM.w / 2, y: ROOM.h / 2, z: ROOM.d / 2 }
  const t = 0.2

  return (
    <group>
      {/* 床 */}
      <mesh geometry={geo} position={[0, -t / 2, 0]} scale={[ROOM.w, t, ROOM.d]} receiveShadow>
        <meshStandardMaterial color={floor} roughness={0.85} />
      </mesh>
      {/* 天井 */}
      <mesh geometry={geo} position={[0, ROOM.h, 0]} scale={[ROOM.w, t, ROOM.d]}>
        <meshStandardMaterial color={ceiling} roughness={0.95} />
      </mesh>
      {/* 壁 4 枚。内側だけ見えればいいので裏面は描かない */}
      {[
        [0, half.y, -half.z, ROOM.w, ROOM.h, t],
        [0, half.y, half.z, ROOM.w, ROOM.h, t],
        [-half.x, half.y, 0, t, ROOM.h, ROOM.d],
        [half.x, half.y, 0, t, ROOM.h, ROOM.d],
      ].map(([x, y, z, sx, sy, sz], i) => (
        <mesh key={i} geometry={geo} position={[x, y, z]} scale={[sx, sy, sz]} receiveShadow>
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** 暖かい部屋。木の床、低い天井、置き物 */
export function RoomWarm({ params }) {
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const props = useMemo(() => {
    const out = []
    let s = 0x51ab
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    /*
     * 置き物は**立ち位置と窓の前を避ける**。避けないと、入った瞬間に箱で
     * 視界が塞がり、窓がどこにあるのか分からない。
     */
    let guard = 0
    while (out.length < 14 && guard++ < 400) {
      const w = 0.35 + rand() * 0.6
      const h = 0.25 + rand() * 1.0
      const x = (rand() - 0.5) * (ROOM.w - 3)
      const z = (rand() - 0.5) * (ROOM.d - 3)
      // 立ち位置のまわり
      if (Math.hypot(x - 0, z - 3.5) < 2.2) continue
      // 窓の正面の通り道
      if (Math.abs(x) < 1.6 && z < 3.5) continue
      out.push({ pos: [x, h / 2, z], scale: [w, h, w * (0.6 + rand() * 0.8)], rot: rand() * Math.PI, tint: rand() })
    }
    return out
  }, [])

  return (
    <group>
      <Walls color={params.warmWall} floor={params.warmFloor} ceiling={params.warmWall} />
      <ambientLight intensity={0.45} color={params.warmLight} />
      <pointLight position={[0, ROOM.h - 0.6, 0]} intensity={22} distance={20} color={params.warmLight} castShadow />
      <pointLight position={[-3.5, 1.6, 3]} intensity={6} distance={9} color="#ffb066" />
      {props.map((p, i) => (
        <mesh key={i} geometry={box} position={p.pos} scale={p.scale} rotation={[0, p.rot, 0]} castShadow receiveShadow>
          <meshStandardMaterial
            color={new THREE.Color(params.warmProp).offsetHSL(0, 0, (p.tint - 0.5) * 0.18)}
            roughness={0.7}
          />
        </mesh>
      ))}
    </group>
  )
}

/** 冷たい部屋。柱が並ぶ、暗い、上から差す光 */
export function RoomCold({ params }) {
  const pillar = useMemo(() => new THREE.CylinderGeometry(0.35, 0.42, ROOM.h, 12), [])
  const spots = useMemo(() => {
    const out = []
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (x === 0 && z === 0) continue
      out.push([x * 3.4, ROOM.h / 2, z * 3.4])
    }
    return out
  }, [])

  return (
    <group>
      <Walls color={params.coldWall} floor={params.coldFloor} ceiling={params.coldWall} />
      <ambientLight intensity={0.22} color={params.coldLight} />
      <directionalLight position={[3, 8, 2]} intensity={1.4} color={params.coldLight} castShadow />
      <pointLight position={[0, ROOM.h - 1, 0]} intensity={14} distance={16} color={params.coldLight} />
      {spots.map((p, i) => (
        <mesh key={i} geometry={pillar} position={p} castShadow receiveShadow>
          <meshStandardMaterial color={params.coldProp} roughness={0.35} metalness={0.25} />
        </mesh>
      ))}
      {/* 中央の光る台。冷たい部屋の目印 */}
      <mesh position={[0, 0.35, 0]}>
        <torusKnotGeometry args={[0.55, 0.16, 96, 16]} />
        <meshStandardMaterial
          color={params.coldLight}
          emissive={params.coldLight}
          emissiveIntensity={1.6}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>
    </group>
  )
}
