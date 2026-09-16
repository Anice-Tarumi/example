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
import Spine from './Spine'
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
  const envGroup = useRef(null)
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
  const refractRaw = useFBO(Math.max(2, Math.round(size.width / 2)), Math.max(2, Math.round(size.height / 2)), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  })

  /*
   * 曇らせた 1 枚。
   *
   * ぼかし方は本家の radialblur.fs と同じ。8 方向へ放射状に拾う。
   * 分離ガウスでも曇りはするが、放射状だと**中心から外へ流れる筋**が
   * 出て、ガラスの厚みがある側へ像が引き伸ばされたように見える。
   * あちらは板の中で毎画素 40 点拾っているが、こちらは小さい的に
   * 1 回だけ掛けて焼く（板の面積ぶん毎回拾うと重い）。
   */
  const bqw = Math.max(2, Math.round(size.width / 4))
  const bqh = Math.max(2, Math.round(size.height / 4))
  const refracted = useFBO(bqw, bqh, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
  })

  const blurUniforms = useMemo(() => ({
    tColor: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
  }), [])
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
      uniform vec2 uResolution;
      varying vec2 vUv;

      /** 本家 radialblur.fs と同じ。8 方向 x quality 点 */
      vec3 radialBlur(sampler2D map, vec2 uv, float size, float quality) {
        vec3 color = vec3(0.0);
        const float pi2 = 3.141596 * 2.0;
        const float direction = 8.0;
        vec2 radius = size / uResolution;
        float samples = 0.0;
        for (float d = 0.0; d < pi2; d += pi2 / direction) {
          vec2 t = radius * vec2(cos(d), sin(d));
          for (float i = 1.0; i <= 6.0; i += 1.0) {
            if (i >= quality) break;
            color += texture2D(map, uv + t * i / quality).rgb;
            samples += 1.0;
          }
        }
        return color / max(1.0, samples);
      }

      void main() {
        gl_FragColor = vec4(radialBlur(tColor, vUv, 9.0, 6.0), 1.0);
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

    /*
     * --- 屈折の的を焼く ---
     *
     * **中身は粒子と金属だけ。** 本家は MRT で 2 枚同時に書いていて、
     *
     *   #drawbuffer Color          gl_FragColor = color;
     *   #drawbuffer WorkRefraction gl_FragColor = refractionOut;
     *
     * この WorkRefraction へ書くのは粒子（FlowerParticleShader）と
     * 金属（ChainShader）と**板の裏面だけ**。背景も筒も入っていない。
     * だからガラス越しに見えるのは「浮いている物」であって、
     * 風景がそのまま透けるのではない。
     *
     * 以前はここで場面まるごと（背景・筒・地形）を焼いていた。
     * それだと板が「窓」になってしまい、物体の後ろにある感じが出ない。
     */
    const bg = boardsGroup.current
    const env = envGroup.current
    if (bg) bg.visible = false
    if (env) env.visible = false
    gl.setRenderTarget(refractRaw)
    gl.clear()
    gl.render(scene, camera)
    if (bg) bg.visible = true
    if (env) env.visible = true

    blurUniforms.tColor.value = refractRaw.texture
    blurUniforms.uResolution.value.set(bqw, bqh)
    gl.setRenderTarget(refracted)
    blurQuad.render(gl)
    gl.setRenderTarget(null)
  })

  return (
    <>
      <group ref={group}>
        {/*
          * 背景・筒・地形は**屈折の的には入れない**（本家の
          * WorkRefraction に入るのは粒子と金属と板の裏面だけ）。
          * まとめて 1 つの group に入れて、焼くときだけ隠す。
          */}
        <group ref={envGroup}>
          <Backdrop tint="#0b0c10" />
          <Tube />
          <Environment fog="#0b0c10" fluidRef={fluid.texRef} resolution={fluid.resolution} />
        </group>
        <Motes fluidRef={fluid.texRef} />
        <Spine />
        <Boards
          boards={boards}
          focusRef={focusRef}
          onFocus={onFocus}
          fluidRef={fluid.texRef}
          resolution={fluid.resolution}
          groupRef={boardsGroup}
          behindTex={refracted.texture}
          mouseRef={fluid.pointer}
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
