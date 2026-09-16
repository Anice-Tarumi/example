/**
 * 空間に浮く板。
 *
 * 本家（Active Theory の Work ページ）の `WorkPanelShader.glsl` を実際に
 * 取得して読んだうえで組み直した。**あちらに虹色のリムもフレネルも無い。**
 * やっているのは 4 つだけ。
 *
 *   1. 角丸に切る（あちらは**ジオメトリに焼いた角丸**。こちらも同じ）
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
  uniform float uPush;          // 流れで UV を押す量
  uniform float uHover;
  uniform float uFocus;         // 正面にいるほど 1
  uniform vec3  uTint;
  uniform float uTime;

  varying vec2 vUv;

  void main() {
    /*
     * 角丸は**シェーダーで切らない。** 本家のジオメトリを展開したら、
     * 角の弧が頂点として焼かれた厚み 0.05 のスラブだった。こちらも同じく
     * 押し出しで作ってある。
     *
     * 両方でやると、多角形で近似した角と円の距離関数がわずかに食い違って、
     * 角の縁がぎざぎざに欠ける。形はジオメトリに任せ、縁は MSAA に任せる。
     */
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
      /*
       * 絵がまだ無い板。**平らな一色にしない。** 単色の矩形は「準備中の
       * 箱」に見えて、周りを作り込んだぶん余計に安く見える。
       * 上から下への落ちと、ゆっくり横切る光の帯だけ置く。
       */
      float fall = smoothstep(1.0, 0.0, uv.y);
      float sweep = smoothstep(0.35, 0.0, abs(fract((uv.x - uv.y) * 0.5 - uTime * 0.035) - 0.5));
      // 細かい粒。面に粒が乗っているだけで、塗った板ではなく物に見える
      float grain = fract(sin(dot(floor(uv * 900.0), vec2(12.9898, 78.233))) * 43758.5453);
      /*
       * 全体を明るくしない。**均一な明るい面は「すりガラスの板」**に
       * 見えて、絵が入る場所には見えない。暗い所を作って落差で見せる。
       */
      col = uTint * (0.028 + fall * 0.058 + sweep * 0.05 + grain * 0.010);
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
    /*
     * 触れた板を持ち上げる。**控えめに。** 絵の無い板の地は 0.03 しかない
     * ので、0.05 も足すと触った瞬間に白い板へ化ける。
     */
    col += uTint * 0.018 * uHover;

    // 撫でた所は薄くなる。流れが板を溶かす
    /*
     * 撫でた所は沈む。**透過ではなく明度で表現する。**
     * 半透明にすると深度を書けず（書くと並び順で三角形が欠ける）、後段の
     * 被写界深度が板を背景と誤認する。暗い背景の上なら、沈めるだけで
     * 「溶けた」に見える。
     */
    col *= 1.0 - min(0.5, stir * 5.0);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
