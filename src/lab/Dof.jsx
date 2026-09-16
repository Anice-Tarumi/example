/* eslint-disable react-hooks/immutability */

import { useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { bakeFrostNormal } from './frostNormal'

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

/**
 * ぼかしのギャザー。**半分の解像度で解く。**
 *
 * ボケは低い周波数の絵なので、全解像度で 19 点も拾う必要が無い。
 * 全解像度でやっていたときは、この 1 パスだけでフレームの半分近くを
 * 使っていた（1440x900 × 19 点 × 2 枚 = 4,900 万回の読み出し）。
 * 半分にすれば 4 分の 1 で済み、見た目はほぼ変わらない。
 */
const gatherFrag = /* glsl */`
  precision highp float;

  uniform sampler2D tColor;
  uniform sampler2D tDepth;
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

    gl_FragColor = vec4(sum / total, clamp(abs(coc), 0.0, 1.0));
  }
`

/**
 * 合成。
 *
 * 本家の `GlobalComposite.fs` を読み直して組み直した。以前はここで
 * 「隅に色を足してビネットを掛ける」だけをやっていたが、あちらは
 * **全ページ共通のこの 1 枚**で次をやっている。順番もこの通り。
 *
 *   1. 繰り返しの法線マップで画面全体の UV をずらす（フロスト）
 *   2. RGB をずらして引く
 *   3. コントラスト調整
 *   4. 隅のグラデーションを **blendAdd**。色相は雑音でゆっくり動く
 *   5. ブルームを `pow(bloom, 1.8)` で足す
 *   6. 粒子ノイズを 15% で **blendOverlay**
 *
 * 4 と 6 が効く。隅の色が静止していると作り物に見えるし、
 * 粒子が無いと綺麗すぎて CG に見える。
 */
const compositeFrag = /* glsl */`
  precision highp float;

  uniform sampler2D tColor;   // 全解像度・鮮明
  uniform sampler2D tBlur;    // 半解像度・ぼかし済み（a に錯乱円）
  uniform sampler2D tBloom;
  uniform sampler2D tNormal;  // 繰り返せる法線マップ（手続きで焼いた物）
  uniform float uBloom;
  uniform float uTime;
  uniform vec2  uResolution;
  uniform float uNormalScale;
  uniform vec2  uContrast;
  uniform vec2  uGradient;

  varying vec2 vUv;

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  /** 本家の contrast.glsl と同じ式 */
  vec3 adjustContrast(vec3 color, float c, float m) {
    float t = 0.5 - c * 0.5;
    return (color * c + t) * m;
  }

  /** 本家の rgbshift.fs と同じ式 */
  vec3 getRGB(sampler2D tex, vec2 uv, float angle, float amount) {
    vec2 off = vec2(cos(angle), sin(angle)) * amount;
    return vec3(texture2D(tex, uv + off).r, texture2D(tex, uv).g, texture2D(tex, uv - off).b);
  }

  vec2 scaleUV(vec2 uv, vec2 scale) {
    return (uv - 0.5) / scale + 0.5;
  }

  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  /** 値ノイズ。隅のグラデーションの色相を動かすのに使う */
  float vnoise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  vec3 blendAdd(vec3 base, vec3 blend, float amt) {
    return mix(base, min(base + blend, vec3(1.0)), amt);
  }
  vec3 blendOverlay(vec3 base, vec3 blend, float amt) {
    vec3 o = mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
    return mix(base, o, amt);
  }

  void main() {
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 squareUV = scaleUV(vUv, vec2(1.4, aspect));

    /*
     * フロスト。**繰り返しの法線で画面ごとずらす。**
     * 本家は右上隅を強くしていた（smoothstep(0.3, 0.0, length(vUv - 1.0))）。
     * 脈も同じく sin(time - length * 30.0)。
     */
    vec2 normalUV = scaleUV(squareUV, vec2(uNormalScale * 0.18));
    vec3 nrm = texture2D(tNormal, normalUV).rgb * 2.0 - 1.0;
    float frost = smoothstep(0.3, 0.0, length(vUv - vec2(1.0))) * 0.08;
    frost *= 1.0 + sin(uTime - length(squareUV - 0.5) * 30.0) * 0.9;
    vec2 uv = vUv + nrm.xy * frost * 0.5;

    // RGB をずらして引く。ずれ量は小さい。大きいと安いグリッチになる
    vec3 sharp = getRGB(tColor, uv, radians(120.0), 0.0006);
    vec4 blur = texture2D(tBlur, uv);

    /*
     * 錯乱円で混ぜる。**半解像度の絵をそのまま出さない。**
     * 合っている所まで解像度が落ちて、全体が眠い絵になる。
     */
    vec3 col = mix(sharp, blur.rgb, smoothstep(0.02, 0.35, blur.a));

    col = adjustContrast(col, uContrast.x, uContrast.y);

    /*
     * 隅のグラデーション。**色相を止めない。**
     * 本家は vec3(0.5,0.5,1.0) を HSV にして
     * hue += cnoise(squareUV*0.65 - time*0.04)*0.065 + 0.88 と動かしている。
     * 固定色を隅に置いただけだと、ただ塗った絵に見える。
     */
    vec3 gradient = rgb2hsv(vec3(0.5, 0.5, 1.0));
    gradient.x += (vnoise(squareUV * 0.65 - uTime * 0.04) - 0.5) * 0.13 + 0.88;
    gradient = hsv2rgb(gradient);
    /*
     * **明度を落としてから足す。** 本家の素材は明るいので彩度の高い色を
     * 5% 足しても隅の光に見えるが、こちらの地は暗く、そのまま足すと
     * 画面全体が青緑に染まった。
     */
    gradient *= 0.46;

    float gNoise = 0.5 + (vnoise(squareUV * 1.1 + uTime * 0.03) - 0.5);
    // 中央には掛けない。隅から立ち上げる
    float cornerNoise = 0.7 * 1.6 * smoothstep(uGradient.x, uGradient.y * 0.9, length(squareUV - 0.5));
    col = blendAdd(col, gradient, 0.012 + pow(cornerNoise * gNoise, 2.0) * 0.55);

    // ブルームは 1.8 乗で足す。線形で足すと霞んで締まらない
    col += pow(max(texture2D(tBloom, uv).rgb, 0.0), vec3(1.8)) * uBloom;

    /*
     * ビネット。本家は隅のグラデーションで締めているが、こちらは素材が
     * 淡いので明示的に落とす。
     */
    vec2 vp = (vUv - 0.5) * vec2(1.0, 0.86);
    col *= mix(0.44, 1.0, smoothstep(0.80, 0.12, length(vp)));

    /*
     * 粒子ノイズ。**これが無いと綺麗すぎて CG に見える。**
     * 本家も 15% のオーバーレイで乗せている。
     */
    float grain = hash12(vUv * uResolution + fract(uTime) * 91.7);
    col = blendOverlay(col, vec3(grain), 0.15);

    col = clamp(col, 0.0, 1.0);
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

  /*
   * ぼかしを解く的。**半分の解像度。** ボケは低い周波数なので、
   * 全解像度で 19 点も拾う必要が無い。
   */
  const gw = Math.max(2, Math.round(size.width / 2))
  const gh = Math.max(2, Math.round(size.height / 2))
  const blurred = useFBO(gw, gh, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  })

  const gatherUniforms = useMemo(() => ({
    tColor: { value: null },
    tDepth: { value: null },
    uNear: { value: 0.1 },
    uFar: { value: 60 },
    uFocus: { value: focus },
    uRange: { value: range },
    uMaxBlur: { value: maxBlur },
  }), [focus, range, maxBlur])

  const gatherQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVert, fragmentShader: gatherFrag, uniforms: gatherUniforms, depthTest: false, depthWrite: false,
  })), [gatherUniforms])
  useEffect(() => () => gatherQuad.dispose(), [gatherQuad])

  // フロスト用の法線。1 回だけ焼く
  const frostNormal = useMemo(() => bakeFrostNormal(256, 2.2), [])
  useEffect(() => () => frostNormal.dispose(), [frostNormal])

  const uniforms = useMemo(() => ({
    tColor: { value: null },
    tBlur: { value: null },
    tBloom: { value: null },
    tNormal: { value: frostNormal },
    uBloom: { value: bloom },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNormalScale: { value: 3 },
    // 本家は一覧では [1,1]。こちらは素材が淡いので少し締める
    /*
     * コントラストと明度。**上げすぎない。** 1.14 で試したら中間が潰れて、
     * 板の輪郭が黒に沈んで消えた。締めるのは主にビネットの役目。
     */
    uContrast: { value: new THREE.Vector2(1.05, 1.18) },
    uGradient: { value: new THREE.Vector2(0.30, 0.82) },
  }), [bloom, frostNormal])

  const quad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVert,
    fragmentShader: compositeFrag,
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

    // --- ぼかし。半分の解像度で 1 回だけ解く ---
    gatherUniforms.tColor.value = target.texture
    gatherUniforms.tDepth.value = target.depthTexture
    gatherUniforms.uNear.value = camera.near
    gatherUniforms.uFar.value = camera.far
    gatherUniforms.uFocus.value = focusPoint ? camera.position.distanceTo(focusPoint) : focus
    gatherUniforms.uRange.value = range
    gatherUniforms.uMaxBlur.value = maxBlur
    gl.setRenderTarget(blurred)
    gatherQuad.render(gl)
    gl.setRenderTarget(null)

    uniforms.tColor.value = target.texture
    uniforms.tBlur.value = blurred.texture
    uniforms.tBloom.value = bloomA.texture
    uniforms.uBloom.value = bloom
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uResolution.value.set(size.width, size.height)
    quad.render(gl)
  }, 1)

  return null
}
