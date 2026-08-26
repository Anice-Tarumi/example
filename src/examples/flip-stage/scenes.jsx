import { useMemo } from 'react'

/**
 * 床に乗せる小シーン。
 *
 * 盤面は 2 面しかないので、シーンの数だけ用意して visible で出し分ける。
 * 回転で裏に回った瞬間に差し替えるため、全部マウントしたままにしておく。
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 円盤の上に均等っぽく撒く。中心を避けて縁まで使う */
function scatter(rand, count, radius, inner = 0.15) {
  const out = []
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    const r = radius * (inner + (1 - inner) * Math.sqrt(rand()))
    out.push([Math.cos(a) * r, Math.sin(a) * r, rand()])
  }
  return out
}

function Conifer({ position, height, scale, colors }) {
  return (
    <group position={position}>
      <mesh position={[0, height * 0.12, 0]}>
        <cylinderGeometry args={[0.03 * scale, 0.045 * scale, height * 0.24, 6]} />
        <meshStandardMaterial color={colors.trunk} flatShading />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, height * (0.3 + i * 0.22), 0]}>
          <coneGeometry args={[(0.2 - i * 0.045) * scale, height * 0.34, 7]} />
          <meshStandardMaterial color={colors.leaf} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Tower({ position, height, width, colors, roof }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, width]} />
        <meshStandardMaterial color={colors.wall} flatShading />
      </mesh>
      {roof && (
        <mesh position={[0, height + width * 0.28, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[width * 0.78, width * 0.56, 4]} />
          <meshStandardMaterial color={colors.roof} flatShading />
        </mesh>
      )}
    </group>
  )
}

function Rock({ position, scale, color, seed }) {
  return (
    <mesh position={position} rotation={[seed * 3, seed * 5, seed * 2]} scale={scale}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

/** 森 */
function Forest({ radius }) {
  const rand = useMemo(() => makeRandom(0x0f0e5), [])
  const spots = useMemo(() => scatter(rand, 16, radius * 0.82), [rand, radius])
  const rocks = useMemo(() => scatter(rand, 5, radius * 0.86), [rand, radius])
  const colors = { trunk: '#7a5230', leaf: '#3f9e57' }

  return (
    <group>
      {spots.map(([x, z, r], i) => (
        <Conifer key={i} position={[x, 0, z]} height={0.55 + r * 0.5} scale={1 + r * 0.4} colors={colors} />
      ))}
      {rocks.map(([x, z, r], i) => (
        <Rock key={`r${i}`} position={[x, 0.05, z]} scale={0.07 + r * 0.07} color="#8b9099" seed={r} />
      ))}
    </group>
  )
}

/** 街 */
function City({ radius }) {
  const rand = useMemo(() => makeRandom(0xc1729), [])
  const spots = useMemo(() => scatter(rand, 22, radius * 0.8), [rand, radius])
  const palette = ['#e8e2d4', '#cfd6de', '#dcc9b6', '#b9c2cc']

  return (
    <group>
      {spots.map(([x, z, r], i) => (
        <Tower
          key={i}
          position={[x, 0, z]}
          height={0.28 + r * 0.95}
          width={0.16 + r * 0.1}
          roof={r < 0.35}
          colors={{ wall: palette[i % palette.length], roof: '#d8604f' }}
        />
      ))}
    </group>
  )
}

/** 岩山 */
function Canyon({ radius }) {
  const rand = useMemo(() => makeRandom(0xca42a), [])
  const spots = useMemo(() => scatter(rand, 13, radius * 0.84), [rand, radius])
  const palette = ['#c8845a', '#a9623f', '#dba173']

  return (
    <group>
      {spots.map(([x, z, r], i) => (
        <mesh
          key={i}
          position={[x, (0.2 + r * 0.75) / 2, z]}
          rotation={[0, r * 6, 0]}
          scale={[0.2 + r * 0.16, 0.2 + r * 0.75, 0.2 + r * 0.16]}
        >
          <cylinderGeometry args={[0.6, 1, 1, 6, 1]} />
          <meshStandardMaterial color={palette[i % palette.length]} flatShading />
        </mesh>
      ))}
    </group>
  )
}

/** 氷 */
function Glacier({ radius }) {
  const rand = useMemo(() => makeRandom(0x1ce5), [])
  const spots = useMemo(() => scatter(rand, 15, radius * 0.82), [rand, radius])

  return (
    <group>
      {spots.map(([x, z, r], i) => (
        <mesh key={i} position={[x, (0.25 + r * 0.8) / 2, z]} rotation={[0, r * 5, 0]}>
          <coneGeometry args={[0.1 + r * 0.13, 0.25 + r * 0.8, 5]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? '#bfe9ff' : '#8ecfe8'}
            flatShading
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
      ))}
    </group>
  )
}

/** 砂漠 */
function Desert({ radius }) {
  const rand = useMemo(() => makeRandom(0xde5e2), [])
  const cacti = useMemo(() => scatter(rand, 9, radius * 0.78), [rand, radius])
  const stones = useMemo(() => scatter(rand, 9, radius * 0.88), [rand, radius])

  return (
    <group>
      {cacti.map(([x, z, r], i) => {
        const h = 0.4 + r * 0.5
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, h / 2, 0]}>
              <capsuleGeometry args={[0.07, h, 4, 8]} />
              <meshStandardMaterial color="#4f9d5d" flatShading />
            </mesh>
            {r > 0.4 && (
              <mesh position={[0.13, h * 0.62, 0]} rotation={[0, 0, -0.5]}>
                <capsuleGeometry args={[0.045, h * 0.34, 4, 8]} />
                <meshStandardMaterial color="#4f9d5d" flatShading />
              </mesh>
            )}
          </group>
        )
      })}
      {stones.map(([x, z, r], i) => (
        <Rock key={`s${i}`} position={[x, 0.04, z]} scale={0.05 + r * 0.08} color="#c2a279" seed={r} />
      ))}
    </group>
  )
}

/** 電波塔 */
function Antenna({ radius }) {
  const rand = useMemo(() => makeRandom(0xa47e), [])
  const spots = useMemo(() => scatter(rand, 7, radius * 0.8), [rand, radius])

  return (
    <group>
      {spots.map(([x, z, r], i) => {
        const h = 0.7 + r * 0.9
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, r * 6, 0]}>
            <mesh position={[0, h / 2, 0]}>
              <cylinderGeometry args={[0.018, 0.05, h, 5]} />
              <meshStandardMaterial color="#d8d3c8" flatShading />
            </mesh>
            <mesh position={[0, h * 0.62, 0]}>
              <boxGeometry args={[0.24, 0.02, 0.02]} />
              <meshStandardMaterial color="#e2553f" flatShading />
            </mesh>
            <mesh position={[0, h + 0.04, 0]}>
              <octahedronGeometry args={[0.05, 0]} />
              <meshStandardMaterial color="#ffcf5c" emissive="#ff9b2f" emissiveIntensity={0.6} flatShading />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export const STAGE_SCENES = [
  { id: 'forest', label: 'Forest', Component: Forest, ground: '#4f8f57', rim: '#2f5f39' },
  { id: 'city', label: 'City', Component: City, ground: '#7f8794', rim: '#4a515b' },
  { id: 'canyon', label: 'Canyon', Component: Canyon, ground: '#b8794f', rim: '#754a2c' },
  { id: 'glacier', label: 'Glacier', Component: Glacier, ground: '#9fd3e8', rim: '#4f8ba6' },
  { id: 'desert', label: 'Desert', Component: Desert, ground: '#dcc08a', rim: '#a58b57' },
  { id: 'antenna', label: 'Signal', Component: Antenna, ground: '#5c6470', rim: '#333a44' },
]

/**
 * 円盤。表裏どちらが上に来ても同じに見えるよう y=0 対称に置く。
 * 天面の色はシーン側の円が受け持つので、ここは縁（側面）だけ。
 */
export function Slab({ radius, thickness, rim }) {
  return (
    <mesh>
      <cylinderGeometry args={[radius, radius, thickness, 48]} />
      <meshStandardMaterial color={rim} flatShading />
    </mesh>
  )
}

export const SCENE_COUNT = STAGE_SCENES.length
