import { useFBO } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * 解像度は短辺を基準にし、長辺をアスペクト比で伸ばす。
 * 正方形の RT で解くと画面比によって渦が歪む。
 */
export function resolveSize(base, aspect) {
  const a = aspect < 1 ? 1 / aspect : aspect
  const min = Math.round(base)
  const max = Math.round(base * a)
  return aspect > 1 ? { width: max, height: min } : { width: min, height: max }
}

/**
 * ソルバが使う 8 枚の RenderTarget。
 * 速度・圧力・渦度は低解像度、染料だけ高解像度にすると軽くて綺麗になる。
 */
export function useFluidTargets(simRes, dyeRes, aspect) {
  const sim = useMemo(() => resolveSize(simRes, aspect), [simRes, aspect])
  const dye = useMemo(() => resolveSize(dyeRes, aspect), [dyeRes, aspect])

  const common = useMemo(
    () => ({
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  )
  const rg = useMemo(() => ({ ...common, format: THREE.RGFormat }), [common])
  const red = useMemo(
    () => ({
      ...common,
      format: THREE.RedFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    }),
    [common],
  )
  const rgba = useMemo(() => ({ ...common, format: THREE.RGBAFormat }), [common])

  const velocityA = useFBO(sim.width, sim.height, rg)
  const velocityB = useFBO(sim.width, sim.height, rg)
  const dyeA = useFBO(dye.width, dye.height, rgba)
  const dyeB = useFBO(dye.width, dye.height, rgba)
  const curl = useFBO(sim.width, sim.height, red)
  const divergence = useFBO(sim.width, sim.height, red)
  const pressureA = useFBO(sim.width, sim.height, red)
  const pressureB = useFBO(sim.width, sim.height, red)

  return useMemo(
    () => ({
      sim,
      dye,
      velocityA,
      velocityB,
      dyeA,
      dyeB,
      curl,
      divergence,
      pressureA,
      pressureB,
    }),
    [sim, dye, velocityA, velocityB, dyeA, dyeB, curl, divergence, pressureA, pressureB],
  )
}
