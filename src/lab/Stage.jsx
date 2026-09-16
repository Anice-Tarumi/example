import { useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { useRef } from 'react'
import * as THREE from 'three'
import Backdrop from './Backdrop'
import Tube from './Tube'
import Bokeh from './Bokeh'
import Environment from './Environment'
import Boards from './Boards'
import Dof from './Dof'
import { useLabFluid } from './useLabFluid'

/**
 * 場面ぜんぶ。
 *
 * 受け持つのは 3 つ。
 *
 *   1. **流体を 1 本に束ねる。** 本家も `MouseFluid` が持つ 1 枚の速度場を
 *      板にも 150,000 個の粒子にも配っていた（粒子側の挙動コードは名前まで
 *      "Mouse Fluid"）。別々に揺らすと同じ空間にいるように見えない
 *   2. **板を除いた場面を先に焼く。** 板はこれを読んで透ける。後述
 *   3. シーンをごくゆっくり揺らす（本家の設定は
 *      `wiggle_lerp 0.025 / scale 0.4 / speed 0.7`）。三脚で固定した絵は
 *      静止画に見える
 */
export default function Stage({ boards, focusRef, onFocus }) {
  const fluid = useLabFluid()
  const { size } = useThree()
  const group = useRef(null)
  const boardsGroup = useRef(null)
  const wiggle = useRef({ x: 0, y: 0 })

  /*
   * 板の向こう側。
   *
   * 本家の画面を撮って気付いたのは、**板が本当に透けている**こと。
   * 向こうの背景も、板に焼かれた文字の影も見える。ガラスの板であって、
   * 絵を貼った不透明な板ではない。
   *
   * ただ `transparent: true` にはできない。板は深度を書く必要があり
   * （書かないと後段の被写界深度が画面全体をぼかす）、半透明にすると
   * 並び順で面が欠ける。
   *
   * そこで**板を隠した場面を先に 1 枚焼いて**、板のシェーダーの中で
   * 画面座標で引いて混ぜる。板は不透明のまま、向こうが見える。
   */
  const behind = useFBO(Math.max(2, size.width), Math.max(2, size.height), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  })

  useFrame((state, delta) => {
    const { gl, scene, camera } = state
    const dt = Math.min(delta, 1 / 20)
    // 流体は**フレームに 1 回だけ**進める。板も玉もその結果を読む
    fluid.advance(dt)

    const g = group.current
    if (g) {
      const t = state.clock.elapsedTime * 0.7
      const w = wiggle.current
      // 目標へゆっくり寄せる。直に代入すると揺れが硬い
      w.x += (Math.sin(t * 0.63) * 0.4 * 0.012 - w.x) * Math.min(1, dt * 1.5)
      w.y += (Math.cos(t * 0.41) * 0.4 * 0.016 - w.y) * Math.min(1, dt * 1.5)
      g.rotation.x = w.x
      g.rotation.y = w.y
    }

    // --- 板を隠して 1 枚焼く ---
    const bg = boardsGroup.current
    if (bg) bg.visible = false
    gl.setRenderTarget(behind)
    gl.clear()
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    if (bg) bg.visible = true
  })

  return (
    <>
      <group ref={group}>
        <Backdrop tint="#0b0c10" />
        <Tube />
        <Bokeh fluidRef={fluid.texRef} />
        <Environment fog="#0b0c10" fluidRef={fluid.texRef} resolution={fluid.resolution} />
        <Boards
          boards={boards}
          focusRef={focusRef}
          onFocus={onFocus}
          fluidRef={fluid.texRef}
          resolution={fluid.resolution}
          groupRef={boardsGroup}
          behindTex={behind.texture}
        />
      </group>
      {/*
        * ボケの範囲を広く、最大量を控えめに取る。**狭く強く掛けると、
        * ボケ玉そのものが二重にぼけて溶けた塊になる。** 玉の柔らかさは
        * スプライトの側で作ってあるので、後処理は奥行きの分離だけに使う。
        */}
      <Dof focusAt={[0, 0.05, 0]} range={6.0} maxBlur={0.012} bloom={0.5} threshold={0.32} />
    </>
  )
}
