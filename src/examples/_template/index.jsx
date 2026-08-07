import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { useEffect, useRef } from 'react'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

function Box({ params }) {
  const ref = useRef(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * params.speed
  })
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={params.color} />
    </mesh>
  )
}

export default function ExampleTemplate() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    color: DEFAULTS.color,
    speed: { value: DEFAULTS.speed, min: 0, max: 8, step: 0.1 },
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 50 }} dpr={[1, 2]}>
      <color attach="background" args={['#0a0a0a']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 3, 3]} intensity={1} />
      <Box params={params} />
      <OrbitControls />
    </Canvas>
  )
}
