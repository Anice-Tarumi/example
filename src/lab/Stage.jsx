/*
 * three の材質と uniform は書き換える前提の入れ物で、毎フレーム値を
 * 差し替えるのが正しい使い方。React Compiler の不変性チェックはここでは外す。
 */
/* eslint-disable react-hooks/immutability */

import { useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import Backdrop from './Backdrop'
import Tube from './Tube'
import Motes from './Motes'
import Hero from './Hero'
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
  /*
   * **半分の解像度で焼く。** どうせ曇りガラス越しにしか見ない絵なので、
   * 全解像度で場面をもう 1 枚描くのは無駄。トップページの描画費用の
   * 2 割をここが使っていた。
   */
  const behindRaw = useFBO(Math.max(2, Math.round(size.width / 2)), Math.max(2, Math.round(size.height / 2)), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  })

  /*
   * 曇らせた 1 枚。**生の絵をそのままガラスに映さない。**
   * この的は後処理を通る前の絵なので、そのまま引くと
   * **ガラスの中だけ背景が合焦している**という妙な絵になる
   * （外はボケているのに、板越しだけ粒が鋭い）。
   *
   * 板の中で何点も拾って曇らせる手もあるが、板の面積ぶん毎回引くより、
   * 小さい的に 1 回ぼかして焼くほうが安い。
   */
  const bqw = Math.max(2, Math.round(size.width / 4))
  const bqh = Math.max(2, Math.round(size.height / 4))
  const blurOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false }
  const behindA = useFBO(bqw, bqh, blurOpts)
  const behindB = useFBO(bqw, bqh, blurOpts)

  const blurUniforms = useMemo(() => ({ tColor: { value: null }, uDir: { value: new THREE.Vector2() } }), [])
  const blurQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: blurUniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tColor;
      uniform vec2 uDir;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColor, vUv).rgb * 0.227;
        c += (texture2D(tColor, vUv + uDir * 1.385).rgb + texture2D(tColor, vUv - uDir * 1.385).rgb) * 0.316;
        c += (texture2D(tColor, vUv + uDir * 3.231).rgb + texture2D(tColor, vUv - uDir * 3.231).rgb) * 0.070;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  })), [blurUniforms])
  useEffect(() => () => blurQuad.dispose(), [blurQuad])

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
    gl.setRenderTarget(behindRaw)
    gl.clear()
    gl.render(scene, camera)
    if (bg) bg.visible = true

    // 横 → 縦にぼかす。1 回で二次元にぼかすより安い
    blurUniforms.tColor.value = behindRaw.texture
    blurUniforms.uDir.value.set(1 / bqw, 0)
    gl.setRenderTarget(behindA)
    blurQuad.render(gl)

    blurUniforms.tColor.value = behindA.texture
    blurUniforms.uDir.value.set(0, 1 / bqh)
    gl.setRenderTarget(behindB)
    blurQuad.render(gl)
    gl.setRenderTarget(null)
  })

  return (
    <>
      <group ref={group}>
        <Backdrop tint="#0b0c10" />
        <Tube />
        <Motes fluidRef={fluid.texRef} />
        <Hero />
        <Environment fog="#0b0c10" fluidRef={fluid.texRef} resolution={fluid.resolution} />
        <Boards
          boards={boards}
          focusRef={focusRef}
          onFocus={onFocus}
          fluidRef={fluid.texRef}
          resolution={fluid.resolution}
          groupRef={boardsGroup}
          behindTex={behindB.texture}
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
