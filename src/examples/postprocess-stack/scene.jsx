import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * 夜の街角。
 *
 * ポストプロセスは被写体が読めないと何をしているか伝わらない。
 * 街灯・窓明かり・ネオンなら「光源の滲み」「レンズのゴースト」「時間帯の色」として
 * そのまま読み取れる。
 *
 * 効果が出る条件は 2 つ。
 *   - 小さくて非常に明るい点（1 を大きく超える）があること → ブルーム / ゴースト
 *   - 中間調が広くあること                                 → グレードの効きが見える
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 発光マテリアル。輝度を明示的に 1 超へ持ち上げる */
function useGlowMaterial(hex, intensity) {
  return useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false })
    m.color = new THREE.Color(hex).multiplyScalar(intensity)
    return m
  }, [hex, intensity])
}

/** 窓明かり。1 棟ぶんをまとめて 1 つの InstancedMesh にする */
function Windows({ rows, cols, width, height, depth, material, seed }) {
  const cells = useMemo(() => {
    const rand = makeRandom(seed)
    const out = []
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // 全部点いていると単調。3 割ほど消しておく
        if (rand() < 0.3) continue
        out.push([
          -width / 2 + (width / cols) * (x + 0.5),
          (height / rows) * (y + 0.7),
          depth / 2 + 0.012,
        ])
      }
    }
    return out
  }, [rows, cols, width, height, depth, seed])

  const attach = (el) => {
    if (!el) return
    const m = new THREE.Matrix4()
    cells.forEach((p, i) => el.setMatrixAt(i, m.setPosition(p[0], p[1], p[2])))
    el.instanceMatrix.needsUpdate = true
  }

  return (
    <instancedMesh ref={attach} args={[undefined, undefined, Math.max(cells.length, 1)]} material={material}>
      <boxGeometry args={[(width / cols) * 0.34, (height / rows) * 0.3, 0.02]} />
    </instancedMesh>
  )
}

function Building({ position, width, height, depth, windowMaterial, seed }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#1b212a" metalness={0.25} roughness={0.7} />
      </mesh>
      <Windows
        rows={Math.max(3, Math.round(height * 3.0))}
        cols={Math.max(3, Math.round(width * 3.0))}
        width={width}
        height={height}
        depth={depth}
        material={windowMaterial}
        seed={seed}
      />
    </group>
  )
}

/** 街灯。ゴーストとハローはここから生える */
function StreetLamp({ position, color, intensity }) {
  const bulb = useGlowMaterial(color, intensity)
  return (
    <group position={position}>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 2.8, 8]} />
        <meshStandardMaterial color="#2a2f38" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.82, 0]} material={bulb}>
        <sphereGeometry args={[0.1, 20, 20]} />
      </mesh>
      <pointLight position={[0, 2.7, 0]} intensity={16} color={color} distance={16} decay={2} />
    </group>
  )
}

export default function Subject({ lampColor, lampIntensity, signColor, signIntensity }) {
  const sign = useGlowMaterial(signColor, signIntensity)
  const windowMat = useGlowMaterial('#ffd9a8', 0.85)
  const car = useRef(null)

  const buildings = useMemo(() => {
    const rand = makeRandom(0x51ee7)
    return Array.from({ length: 10 }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1
      return {
        position: [side * (2.9 + rand() * 0.5), 0, -2.6 - Math.floor(i / 2) * 3.1 - rand() * 0.6],
        width: 1.5 + rand() * 0.7,
        height: 2.2 + rand() * 3.4,
        depth: 2.2 + rand() * 0.8,
        seed: 0x1000 + i * 733,
      }
    })
  }, [])

  // 手前に走ってくる車。動く高輝度点があるとゴーストの動きが読める
  useFrame(({ clock }) => {
    if (car.current) car.current.position.z = -14 + ((clock.elapsedTime * 0.22) % 1) * 17
  })

  const headlight = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false })
    m.color = new THREE.Color('#ffeccf').multiplyScalar(9)
    return m
  }, [])

  return (
    <>
      {/* 濡れた路面が反射する相手。無いと金属が真っ黒になる */}
      <Environment resolution={128}>
        <Lightformer intensity={1.1} position={[0, 6, -6]} scale={[14, 6, 1]} color="#4a6491" />
        <Lightformer intensity={0.8} position={[-6, 2, 2]} scale={[4, 7, 1]} color="#a46c46" />
      </Environment>

      {/* 奥を霞ませて奥行きを出す */}
      <fogExp2 attach="fog" args={['#0d1219', 0.03]} />

      <ambientLight intensity={0.42} />
      <directionalLight position={[-3, 6, 2]} intensity={0.7} color="#7f9ad8" />

      {/* 路面。ラフネスを下げて街灯を映り込ませる */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#15191f" metalness={0.5} roughness={0.2} />
      </mesh>

      {/* センターライン。遠近が付くと通りに見える */}
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={`ln${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 1 - i * 1.6]}>
          <planeGeometry args={[0.09, 0.8]} />
          <meshStandardMaterial color="#8f8a76" />
        </mesh>
      ))}

      {/* 歩道の縁石。通りの幅を示す */}
      {[-1, 1].map((side) => (
        <mesh key={`cb${side}`} position={[side * 2.0, 0.07, -7]}>
          <boxGeometry args={[0.22, 0.14, 26]} />
          <meshStandardMaterial color="#333b46" metalness={0.2} roughness={0.8} />
        </mesh>
      ))}

      {buildings.map((b, i) => (
        <Building key={i} {...b} windowMaterial={windowMat} />
      ))}

      <StreetLamp position={[-2.05, 0, -2]} color={lampColor} intensity={lampIntensity} />
      <StreetLamp position={[2.05, 0, -6]} color={lampColor} intensity={lampIntensity} />
      <StreetLamp position={[-2.05, 0, -10]} color={lampColor} intensity={lampIntensity} />

      {/* ネオン看板。細長い高輝度は横に伸びたゴーストを作る */}
      <group position={[2.2, 2.4, -4.2]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh material={sign}>
          <boxGeometry args={[1.5, 0.13, 0.04]} />
        </mesh>
        <mesh position={[0, -0.32, 0]} material={sign}>
          <boxGeometry args={[0.9, 0.09, 0.04]} />
        </mesh>
      </group>

      <group ref={car} position={[0.8, 0.3, -12]}>
        <mesh position={[-0.28, 0, 0]} material={headlight}>
          <sphereGeometry args={[0.07, 16, 16]} />
        </mesh>
        <mesh position={[0.28, 0, 0]} material={headlight}>
          <sphereGeometry args={[0.07, 16, 16]} />
        </mesh>
        <mesh position={[0, 0.05, -0.55]}>
          <boxGeometry args={[0.82, 0.44, 1.6]} />
          <meshStandardMaterial color="#191d24" metalness={0.7} roughness={0.35} />
        </mesh>
      </group>
    </>
  )
}
