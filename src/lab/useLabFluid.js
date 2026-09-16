import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useVelocityField } from '../shared/useVelocityField'

/**
 * 画面座標の速度場を 1 つ持ち、場面じゅうで使い回す。
 *
 * 本家も同じ作りだった。`MouseFluid` が velocity の FBO を持ち、
 * `applyTo(shader)` で板にも粒子にも同じ `tFluid` を配っている。
 * 粒子側の挙動コードは名前まで "Mouse Fluid" で、
 *
 *   target += flow * 0.0001 * uMouseStrength * tFluidMask
 *
 * と、**板と粒子が同じ流れを読む**。別々に揺らすと、同じ空間にいるように
 * 見えない。
 */
export function useLabFluid() {
  const { gl, size } = useThree()
  const aspect = size.width / Math.max(1, size.height)
  const step = useVelocityField(128, aspect)

  const texRef = useRef(null)
  const resolution = useMemo(() => new THREE.Vector2(1, 1), [])
  const pointer = useRef({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false })

  const params = useMemo(() => ({
    fluidForce: 900,
    fluidRadius: 0.22,
    fluidCurl: 12,
    fluidIterations: 3,
    fluidDissipation: 0.955,
  }), [])

  useEffect(() => {
    const el = gl.domElement
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const p = pointer.current
      p.px = p.x
      p.py = p.y
      p.x = (e.clientX - r.left) / r.width
      p.y = 1 - (e.clientY - r.top) / r.height
      p.moved = true
    }
    el.addEventListener('pointermove', onMove)
    return () => el.removeEventListener('pointermove', onMove)
  }, [gl])

  /** 毎フレーム 1 回だけ呼ぶ。呼んだ結果は `texRef` に入る */
  const advance = (dt) => {
    texRef.current = step(gl, dt, pointer.current, params)
    pointer.current.moved = false
    resolution.set(size.width, size.height)
  }

  // カーソルは板も読む（本家も uMouse を板へ渡している）
  return { texRef, resolution, advance, pointer }
}
