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

/** 明るい所だけ抜く。閾値は低め。本家は luminosityThreshold 0 */
const brightFrag = /* glsl */`
  precision highp float;
  uniform sampler2D tColor;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // 閾値の下も少し残す。切り捨てると縁が硬くなる
    gl_FragColor = vec4(c * smoothstep(uThreshold * 0.5, uThreshold + 0.25, l), 1.0);
  }
`

/** 横か縦に 1 回ぼかす。2 回に分ける（1 回で二次元にぼかすと重い） */
const blurFrag = /* glsl */`
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
`

const dofFrag = /* glsl */`
  precision highp float;

  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tBloom;
  uniform float uBloom;
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

    vec3 col = sum / total;
    // ブルームは最後に足す。ボケの前に足すと光が二重ににじむ
    col += texture2D(tBloom, vUv).rgb * uBloom;

    /*
     * 隅から色を差す。**光源が 1 つも無い場面は、どれだけ物を置いても
     * 平らに見える。** 本家の画面を撮ったら、左上から冷たい光、
     * 下側から低い色が差していて、中央だけが抜けていた。
     * こちらは彩度を上げないぶん、方向だけ借りる。
     */
    /*
     * **広げない。** 半径を大きく取ると画面全体が持ち上がって、
     * ただ全体が明るい灰色になる（実際そうなった）。隅に留める。
     */
    vec2 q = vUv - vec2(0.06, 0.98);
    col += vec3(0.050, 0.080, 0.098) * pow(smoothstep(0.62, 0.0, length(q * vec2(1.0, 1.25))), 1.6);
    vec2 q2 = vUv - vec2(0.94, 0.02);
    col += vec3(0.048, 0.044, 0.070) * pow(smoothstep(0.55, 0.0, length(q2 * vec2(1.0, 1.25))), 1.6);

    /*
     * ビネット。**周辺を落とさないと画面が一枚の紙に見える。**
     * 落とす量は大きめに取る。中央だけ抜けていると、そこに奥行きが出る。
     */
    vec2 vp = (vUv - 0.5) * vec2(1.0, 0.86);
    col *= mix(0.22, 1.0, smoothstep(0.70, 0.08, length(vp)));

    /*
     * 最後に締める。**黒が浮いていると、何を足しても灰色の靄に見える。**
     * 本家の合成にも uContrast があった（一覧ページでは 1 だが、
     * あちらは素材そのものが濃い）。こちらは手続きで作った淡い素材なので、
     * ここで暗部を落として中間を持ち上げる。
     */
    col = pow(max(col, 0.0), vec3(1.28)) * 1.30;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export default function Dof({ focus = 5.4, focusAt = null, range = 3.2, maxBlur = 0.012, bloom = 0.5, threshold = 0.32 }) {
  const { size, camera } = useThree()

  /*
   * 合わせる点。**距離を定数で持たない。** カメラは画面幅に応じて board が
   * 収まる所まで下がるので、固定値だと狭い画面で正面の板までボケる
   * （実際それで、一番見せたい板が常に少し滲んでいた）。
   */
  const focusPoint = useMemo(() => (focusAt ? new THREE.Vector3(...focusAt) : null), [focusAt])

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

  // ブルームは 1/4 で足りる。輪郭ではなく光の広がりなので、解像度は要らない
  const bw = Math.max(2, Math.round(size.width / 4))
  const bh = Math.max(2, Math.round(size.height / 4))
  const bloomA = useFBO(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false })
  const bloomB = useFBO(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false })

  const brightUniforms = useMemo(() => ({ tColor: { value: null }, uThreshold: { value: threshold } }), [threshold])
  const brightQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVert, fragmentShader: brightFrag, uniforms: brightUniforms, depthTest: false, depthWrite: false,
  })), [brightUniforms])
  useEffect(() => () => brightQuad.dispose(), [brightQuad])

  const blurUniforms = useMemo(() => ({ tColor: { value: null }, uDir: { value: new THREE.Vector2() } }), [])
  const blurQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVert, fragmentShader: blurFrag, uniforms: blurUniforms, depthTest: false, depthWrite: false,
  })), [blurUniforms])
  useEffect(() => () => blurQuad.dispose(), [blurQuad])

  const uniforms = useMemo(() => ({
    tColor: { value: null },
    tDepth: { value: null },
    tBloom: { value: null },
    uBloom: { value: bloom },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.1 },
    uFar: { value: 60 },
    uFocus: { value: focus },
    uRange: { value: range },
    uMaxBlur: { value: maxBlur },
  }), [focus, range, maxBlur, bloom])

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

    // --- ブルーム。明るい所を抜いて、横 → 縦にぼかす ---
    brightUniforms.tColor.value = target.texture
    brightUniforms.uThreshold.value = threshold
    gl.setRenderTarget(bloomA)
    brightQuad.render(gl)

    blurUniforms.tColor.value = bloomA.texture
    blurUniforms.uDir.value.set(1 / bw, 0)
    gl.setRenderTarget(bloomB)
    blurQuad.render(gl)

    blurUniforms.tColor.value = bloomB.texture
    blurUniforms.uDir.value.set(0, 1 / bh)
    gl.setRenderTarget(bloomA)
    blurQuad.render(gl)

    gl.setRenderTarget(null)

    uniforms.tColor.value = target.texture
    uniforms.tDepth.value = target.depthTexture
    uniforms.tBloom.value = bloomA.texture
    uniforms.uBloom.value = bloom
    uniforms.uTexel.value.set(1 / target.width, 1 / target.height)
    uniforms.uNear.value = camera.near
    uniforms.uFar.value = camera.far
    uniforms.uFocus.value = focusPoint ? camera.position.distanceTo(focusPoint) : focus
    uniforms.uRange.value = range
    uniforms.uMaxBlur.value = maxBlur
    quad.render(gl)
  }, 1)

  return null
}
