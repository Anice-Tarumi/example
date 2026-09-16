/* eslint-disable react-hooks/immutability */

import { useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

/**
 * 被写界深度。
 *
 * 本家の空気感の半分はこれ。奥の点群が大きくボケて、板だけが締まって見える。
 * ボケが無いと、どれだけ点を撒いても「後ろに粒が散っている」だけになる。
 *
 * 作りは素直に 3 段。
 *
 *   1. 場面を色と深度の付いた的へ描く
 *   2. 深度から**錯乱円（CoC）**を出し、その半径でぼかす
 *   3. 画面へ出す
 *
 * ぼかしは黄金角の螺旋で散らす。格子状に取ると、強くぼかしたとき縞が出る。
 */

const TAPS = 18

const quadVert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const dofFrag = /* glsl */`
  precision highp float;

  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2  uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uFocus;      // 合わせる距離（世界単位）
  uniform float uRange;      // 合って見える幅
  uniform float uMaxBlur;    // 最大の半径（画面比）

  varying vec2 vUv;

  /** 深度バッファの値を「カメラからの距離」へ戻す */
  float linearDepth(float z) {
    float ndc = z * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
  }

  void main() {
    float d = linearDepth(texture2D(tDepth, vUv).r);

    /*
     * 錯乱円。**手前と奥で効き方を変える。** 同じ幅にすると、手前の板の
     * すぐ前がボケすぎて、浮いているのに輪郭だけ硬いという妙な絵になる。
     */
    float coc = clamp((d - uFocus) / uRange, -1.0, 1.0);
    coc = sign(coc) * pow(abs(coc), 1.4);
    float radius = abs(coc) * uMaxBlur;

    /*
     * **途中で打ち切らない。** 「半径が小さければ元の色を返す」と分岐すると、
     * 傾いた面では等深度の線に沿って鮮明とぼけが切り替わり、**直線の継ぎ目**
     * が出る（板が三角形に欠けたように見える）。半径 0 でも同じ経路を通す。
     */
    vec3 sum = texture2D(tColor, vUv).rgb;
    float total = 1.0;
    // 黄金角の螺旋。格子で取ると強いボケで縞が出る
    for (int i = 1; i <= ${TAPS}; i++) {
      float fi = float(i);
      float a = fi * 2.399963;
      float r = sqrt(fi / float(${TAPS})) * radius;
      vec2 off = vec2(cos(a), sin(a)) * r;
      vec2 uv = vUv + off;

      /*
       * **手前の物を奥へにじませない。** 拾った先が自分よりずっと手前なら
       * 捨てる。捨てないと、ボケた背景に手前の物の色が漏れる。
       */
      float dd = linearDepth(texture2D(tDepth, uv).r);
      float w = dd < d - uRange * 0.5 ? 0.0 : 1.0;
      sum += texture2D(tColor, uv).rgb * w;
      total += w;
    }

    gl_FragColor = vec4(sum / total, 1.0);
    #include <colorspace_fragment>
  }
`

export default function Dof({ focus = 5.4, range = 3.2, maxBlur = 0.012 }) {
  const { size, camera } = useThree()

  /*
   * 深度をテクスチャで受け取る。**作った後から `depthTexture` を差しても
   * 効かない。** 枠組みは生成時に決まるので、`depth: true` を渡して最初から
   * 付けさせる。付いていないと深度が常に 0 になり、画面全部が最前面として
   * ボケる。
   */
  const target = useFBO(Math.max(2, size.width), Math.max(2, size.height), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    stencilBuffer: false,
    depth: true,
  })

  const uniforms = useMemo(() => ({
    tColor: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.1 },
    uFar: { value: 60 },
    uFocus: { value: focus },
    uRange: { value: range },
    uMaxBlur: { value: maxBlur },
  }), [focus, range, maxBlur])

  const quad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVert,
    fragmentShader: dofFrag,
    uniforms,
    depthTest: false,
    depthWrite: false,
  })), [uniforms])
  useEffect(() => () => quad.dispose(), [quad])

  useFrame((state) => {
    const { gl, scene } = state
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    uniforms.tColor.value = target.texture
    uniforms.tDepth.value = target.depthTexture
    uniforms.uTexel.value.set(1 / target.width, 1 / target.height)
    uniforms.uNear.value = camera.near
    uniforms.uFar.value = camera.far
    uniforms.uFocus.value = focus
    uniforms.uRange.value = range
    uniforms.uMaxBlur.value = maxBlur
    quad.render(gl)
  }, 1)

  return null
}
