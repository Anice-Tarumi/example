/**
 * 空間に浮く板。
 *
 * 本家（Active Theory の Work ページ）の `WorkPanelShader.glsl` を実際に
 * 取得して読んだうえで組み直した。**あちらに虹色のリムもフレネルも無い。**
 * やっているのは 4 つだけ。
 *
 *   1. 角丸で切る（`roundedBox` で discard）
 *   2. **画面座標で引いた流体の速度場で UV を押す**
 *   3. 周辺を明るくする（中心 1.0 → 端 1.6）
 *   4. 流れの強い所は薄くする（カーソルで撫でると板が溶ける）
 *
 * つまり質感は板ではなく、**流体と背景**が作っている。板を凝っても、
 * 背景が空なら質感は出ない。
 */

export const boardVertexShader = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHover;

  varying vec2 vUv;

  void main() {
    vUv = uv;

    vec3 p = position;
    // ゆっくり反る。平らなままだと板ではなく写真に見える
    float bend = sin(uv.x * 3.14159 + uTime * 0.25 + uSeed * 6.2831) * 0.012
               + cos(uv.y * 3.14159 - uTime * 0.19 + uSeed * 3.7) * 0.008;
    p.z += bend * (1.0 + uHover);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

export const boardFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tMap;
  uniform sampler2D tNext;
  uniform sampler2D tFluid;     // 画面座標で引く速度場
  uniform vec2  uResolution;
  uniform float uBlend;         // 差し替え中の混ぜ具合
  uniform float uHasMap;
  uniform vec2  uSize;          // 板の実寸（世界単位）
  uniform float uRadius;        // 角の丸み
  uniform float uPush;          // 流れで UV を押す量
  uniform float uHover;
  uniform float uFocus;         // 正面にいるほど 1
  uniform vec3  uTint;
  uniform float uTime;

  varying vec2 vUv;

  /** 角丸矩形の符号付き距離。内側が負 */
  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float sd = roundedBox(p, uSize * 0.5, uRadius);

    // 縁の外は描かない。幅は画素の大きさから決めるので、寄っても滲まない
    float aa = fwidth(sd) * 1.2;
    if (sd > aa) discard;
    float edgeSoft = 1.0 - smoothstep(-aa, aa, sd);

    /*
     * 流体。**画面座標で引く。** 板の uv で引くと、板を送ったときに模様が
     * 一緒に動いてしまい、空間に流れがあるようには見えない。
     */
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    vec2 flow = texture2D(tFluid, screenUv).xy;
    /*
     * **二乗してから使う。** 線形のまま使うと、少し動かしただけで板全体が
     * 溶けて煙になる。二乗すると、速い所だけが効いて弱い流れは無視される。
     * 上限も切る。切らないと勢いよく撫でたときに板が消える。
     */
    /*
     * 係数は**実測で決める**。本家の 0.01 をそのまま持ってきても合わない。
     * こちらの速度場は力の掛け方が違って桁がひとつ大きく、同じ係数だと
     * 板が丸ごと煙になった。
     */
    float stir = pow(min(1.0, abs(flow.x) * 0.0022), 2.0);

    vec2 uv = vUv + stir * uPush * 0.6;

    vec3 col;
    if (uHasMap > 0.5) {
      col = mix(texture2D(tMap, uv).rgb, texture2D(tNext, uv).rgb, uBlend);
    } else {
      // 絵が無い板。斜めの緩い勾配だけ置く。真っ黒だと穴に見える
      float g = 0.5 + 0.5 * sin((uv.x + uv.y) * 2.2 + uTime * 0.1);
      col = uTint * (0.16 + g * 0.08);
    }

    /*
     * 周辺を持ち上げる。中央だけ明るいと、板ではなく光る板に見える。
     * **押す前の uv で測る。** 押した後で測ると、流れた所が一様に明るく
     * なって板全体が白く浮く。
     */
    col *= mix(1.0, 1.6, smoothstep(0.2, 1.0, length(vUv - 0.5)));
    col *= 0.64;

    // 手前にいない板は沈める。並んだとき、どれを見ているかが分かる
    col *= mix(0.42, 1.0, uFocus);
    col += uTint * 0.05 * uHover;

    // 撫でた所は薄くなる。流れが板を溶かす
    // 撫でた所は少しだけ薄くなる。**消さない。** 消すと板に穴が開く
    float alpha = edgeSoft * (1.0 - min(0.45, stir * 5.0));

    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`
