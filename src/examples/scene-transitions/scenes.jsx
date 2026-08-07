import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/** Scene A — 暖色。ねじれたトーラスノットが回る */
export function SceneA() {
  const group = useRef(null)

  useFrame((state) => {
    if (!group.current) return
    const t = state.clock.elapsedTime
    group.current.rotation.y = t * 0.35
    group.current.rotation.x = Math.sin(t * 0.2) * 0.25
  })

  return (
    <>
      <color attach="background" args={['#1a0d05']} />
      <ambientLight intensity={0.35} color="#ffb066" />
      <directionalLight position={[4, 5, 3]} intensity={2.4} color="#ffd8a0" />
      <pointLight position={[-4, -2, 2]} intensity={12} color="#ff4d00" />

      <group ref={group}>
        <mesh>
          <torusKnotGeometry args={[1.05, 0.32, 220, 32]} />
          <meshStandardMaterial color="#ff7a2f" roughness={0.25} metalness={0.85} />
        </mesh>
        <mesh scale={1.9}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color="#5a2200"
            roughness={0.9}
            metalness={0.1}
            wireframe
          />
        </mesh>
      </group>
    </>
  )
}

const GRID = 6
const SPACING = 0.62

/** Scene B — 寒色。グリッド状のボックスが波打つ */
export function SceneB() {
  const mesh = useRef(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const count = GRID * GRID * GRID

  useFrame((state) => {
    if (!mesh.current) return
    const t = state.clock.elapsedTime
    const offset = (GRID - 1) / 2
    let i = 0
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        for (let z = 0; z < GRID; z++) {
          const px = (x - offset) * SPACING
          const py = (y - offset) * SPACING
          const pz = (z - offset) * SPACING
          const wave = Math.sin(t * 1.2 + (x + y + z) * 0.55)
          dummy.position.set(px, py + wave * 0.12, pz)
          dummy.rotation.set(t * 0.2 + x, t * 0.25 + y, 0)
          dummy.scale.setScalar(0.16 + wave * 0.05)
          dummy.updateMatrix()
          mesh.current.setMatrixAt(i++, dummy.matrix)
        }
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.parent.rotation.y = t * 0.22
  })

  return (
    <>
      <color attach="background" args={['#04101a']} />
      <ambientLight intensity={0.5} color="#7fd8ff" />
      <directionalLight position={[-3, 4, 4]} intensity={2.2} color="#bfe9ff" />
      <pointLight position={[3, -2, 2]} intensity={14} color="#0090ff" />

      <group>
        <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#4fb9ff" roughness={0.3} metalness={0.6} />
        </instancedMesh>
      </group>
    </>
  )
}
