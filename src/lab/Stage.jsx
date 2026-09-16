import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import Backdrop from './Backdrop'
import Tube from './Tube'
import Environment from './Environment'
import Boards from './Boards'
import Dof from './Dof'
import { useLabFluid } from './useLabFluid'

/**
 * 場面ぜんぶ。
 *
 * 役割は 1 つだけ、**流体を 1 本に束ねること**。本家もそうなっていて、
 * `MouseFluid` が持つ 1 枚の速度場を板にも 150,000 個の粒子にも配っている
 * （粒子側の挙動コードは名前まで "Mouse Fluid"）。別々に揺らすと、
 * 板と背景が同じ空間にいるように見えない。
 *
 * もう 1 つ、シーン全体をごくゆっくり揺らす。本家の設定にも
 * `wiggle_lerp 0.025 / scale 0.4 / speed 0.7` があった。三脚で固定した絵は
 * 静止画に見える。
 */
export default function Stage({ boards, focusRef, onFocus }) {
  const fluid = useLabFluid()
  const group = useRef(null)
  const wiggle = useRef({ x: 0, y: 0 })

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20)
    // 流体は**フレームに 1 回だけ**進める。板と粒子はその結果を読む
    fluid.advance(dt)

    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime * 0.7
    const w = wiggle.current
    // 目標へゆっくり寄せる。直に代入すると揺れが硬い
    w.x += (Math.sin(t * 0.63) * 0.4 * 0.012 - w.x) * Math.min(1, dt * 1.5)
    w.y += (Math.cos(t * 0.41) * 0.4 * 0.016 - w.y) * Math.min(1, dt * 1.5)
    g.rotation.x = w.x
    g.rotation.y = w.y
  })

  return (
    <>
      <group ref={group}>
        <Backdrop tint="#0b0c10" fluidRef={fluid.texRef} />
        <Tube />
        <Environment fog="#0b0c10" fluidRef={fluid.texRef} resolution={fluid.resolution} />
        <Boards
          boards={boards}
          focusRef={focusRef}
          onFocus={onFocus}
          fluidRef={fluid.texRef}
          resolution={fluid.resolution}
        />
      </group>
      {/* 最後に置く。場面を焼いてから後処理で出す */}
      <Dof focusAt={[0, 0.05, 0]} range={3.0} maxBlur={0.016} bloom={0.55} threshold={0.3} />
    </>
  )
}
