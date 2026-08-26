import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * ポストプロセスを見せるための被写体。
 *
 * ブルームもゴーストも「1 より明るい画素」がないと何も起きない。
 * 発光部の色は 1 を超える値を入れておく（HalfFloat の RT に描くので飛ばずに残る）。
 */

/** 発光マテリアル。輝度を明示的に 1 超へ持ち上げる */
function useGlowMaterial(hex, intensity) {
  return useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false })
    m.color = new THREE.Color(hex).multiplyScalar(intensity)
    return m
  }, [hex, intensity])
}

function Ring({ radius, tube, tilt, speed, color, intensity }) {
  const ref = useRef(null)
  const material = useGlowMaterial(color, intensity)

  useFrame((state, delta) => {
    if (ref.current) ref.current.rotation.z += delta * speed
  })

  return (
    <group rotation={tilt}>
      <mesh ref={ref} material={material}>
        <torusGeometry args={[radius, tube, 8, 128]} />
      </mesh>
    </group>
  )
}

/** 環の上を回る小さな発光体 */
function Satellites({ count, radius, color, intensity }) {
  const ref = useRef(null)
  const material = useGlowMaterial(color, intensity)

  useFrame((state, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.34
  })

  return (
    <group ref={ref} rotation={[0.32, 0, 0.18]}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * radius, 0, Math.sin(a) * radius]} material={material}>
            <sphereGeometry args={[0.055, 16, 16]} />
          </mesh>
        )
      })}
    </group>
  )
}

/** 環の内側に並ぶ金属の羽根。発光しない面があると滲みの効き方が分かる */
function Blades({ count, radius }) {
  const ref = useRef(null)

  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2
        return { a, x: Math.cos(a) * radius, z: Math.sin(a) * radius }
      }),
    [count, radius],
  )

  useFrame((state, delta) => {
    if (ref.current) ref.current.rotation.y -= delta * 0.18
  })

  return (
    <group ref={ref}>
      {items.map(({ a, x, z }, i) => (
        <mesh key={i} position={[x, 0, z]} rotation={[0, -a, 0.42]}>
          <boxGeometry args={[0.04, 0.44, 0.16]} />
          <meshStandardMaterial color="#2b3038" metalness={0.9} roughness={0.28} />
        </mesh>
      ))}
    </group>
  )
}

export default function Subject({ coreColor, coreIntensity, ringColor, ringIntensity }) {
  const group = useRef(null)
  const core = useGlowMaterial(coreColor, coreIntensity)

  useFrame((state, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.12
  })

  return (
    <>
      {/* 金属面は環境マップが無いと真っ黒になる。反射させる相手を置く */}
      <Environment resolution={128}>
        <Lightformer intensity={1.1} position={[0, 4, 2]} scale={[9, 3, 1]} color="#9fc4ff" />
        <Lightformer intensity={0.7} position={[-5, 0, -3]} scale={[4, 6, 1]} color="#ffb08a" />
        <Lightformer intensity={0.5} position={[5, -1, 2]} scale={[4, 4, 1]} color="#7fe4d0" />
      </Environment>

      <ambientLight intensity={0.25} />
      <pointLight position={[0, 0, 0]} intensity={4} color={coreColor} distance={7} decay={2} />
      <directionalLight position={[3, 5, 2]} intensity={0.9} />

      <group ref={group}>
        {/* 光源本体。ゴーストとハローはここから生える */}
        <mesh material={core}>
          <sphereGeometry args={[0.26, 32, 32]} />
        </mesh>

        {/* 小さな衛星。ゴーストの発生源が複数あると「レンズを通した」感じが出る */}
        <Satellites count={3} radius={1.35} color={ringColor} intensity={coreIntensity * 0.8} />

        <Ring radius={1.05} tube={0.012} tilt={[Math.PI / 2, 0, 0]} speed={0.5} color={ringColor} intensity={ringIntensity} />
        <Ring radius={1.35} tube={0.009} tilt={[Math.PI / 2, 0.55, 0.3]} speed={-0.32} color={ringColor} intensity={ringIntensity * 0.7} />
        <Ring radius={1.72} tube={0.007} tilt={[Math.PI / 2, -0.4, -0.5]} speed={0.21} color={coreColor} intensity={ringIntensity * 0.5} />

        <Blades count={16} radius={1.22} />
      </group>

      {/* 床。金属反射に発光が乗ることで滲みの広がりが読み取れる */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
        <circleGeometry args={[9, 64]} />
        <meshStandardMaterial color="#0d1016" metalness={0.6} roughness={0.28} />
      </mesh>
    </>
  )
}
