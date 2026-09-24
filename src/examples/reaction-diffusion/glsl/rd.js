/**
 * Gray–Scott 反応拡散。
 *
 * 2 種類の物質 A と B が格子の上で広がり、反応する。
 *
 *   A + 2B → 3B        （B は A を食べて増える）
 *   A は一定の割合 f で補充される（feed）
 *   B は一定の割合 f + k で消える（kill）
 *
 *   A' = A + (Da ∇²A − A B² + f (1 − A)) Δt
 *   B' = B + (Db ∇²B + A B² − (k + f) B) Δt
 *
 * 式は短いが、f と k の組み合わせだけで珊瑚・斑点・迷路・細胞分裂と
 * まったく違う模様になる。係数は Karl Sims の解説と Pearson の分類
 * （1993）で知られている値を出発点に、画面で確かめて決めた。
 *
 * 2 枚の的を入れ替えながら解く（ping-pong）。R に A、G に B を持つ。
 */

export const quadVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * 初期状態。A を満たし、所々を乱す。
 *
 * **B = 1 の小さな点を置かない。** 係数によっては育つ前に拡散で薄まって
 * 消える（Mitosis で全滅して真っ黒になった）。Pearson の論文と同じく、
 * 種の中を A = 0.5、B = 0.25 にして少し雑音を足す。どの係数でも立ち上がる。
 */
export const seedFragmentShader = /* glsl */`
  precision highp float;
  uniform vec2  uAspect;   // 横長なら (w/h, 1)
  uniform float uSeed;
  uniform float uDense;    // 1 で全面を細かく乱す（地図用）
  varying vec2 vUv;

  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453);
  }

  void main() {
    vec2 p = vUv * uAspect;
    float m = 0.0;
    /*
     * 種はまばらに、大きさをばらつかせる。**一様に撒くと全面が同時に
     * 育って、模様が広がっていく過程が見えない。**
     */
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      vec2 c = vec2(hash12(vec2(fi, 1.0)), hash12(vec2(fi, 2.0))) * uAspect;
      float r = 0.035 + hash12(vec2(fi, 3.0)) * 0.04;
      m = max(m, step(length(p - c), r));
    }
    /*
     * 地図は全面を乱す。**種の無い所は何も育たない**ので、係数の地図が
     * 半分しか埋まらなかった。
     */
    if (uDense > 0.5) m = step(0.55, hash12(floor(vUv * 96.0)));

    float n = hash12(vUv * 517.0) * 0.1;
    float a = mix(1.0, 0.5 + n, m);
    float b = mix(0.0, 0.25 + n, m);
    gl_FragColor = vec4(a, b, 0.0, 1.0);
  }
`

export const stepFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tState;
  uniform vec2  uTexel;
  uniform vec2  uAspect;
  uniform float uFeed;
  uniform float uKill;
  uniform float uDa;
  uniform float uDb;
  uniform float uDt;
  uniform float uMap;        // 1 で f と k を場所ごとに変える（Pearson の地図）
  uniform vec3  uBrush;      // xy = 位置（0..1）、z = 押している
  uniform float uBrushR;

  varying vec2 vUv;

  /*
   * 近傍を引く位置。**地図のときは端を巻き戻さない。** 巻き戻すと
   * feed 最大の右端と最小の左端が隣り合い、縁に白い筋が立った。
   */
  vec2 at(vec2 uv) {
    return uMap > 0.5 ? clamp(uv, uTexel * 0.5, 1.0 - uTexel * 0.5) : uv;
  }

  void main() {
    vec2 s = texture2D(tState, vUv).rg;

    /*
     * ラプラシアン。3x3 の重み（中心 -1、上下左右 0.2、斜め 0.05）。
     * **上下左右だけの 5 点で取らない。** 格子の向きが模様に出て、
     * 縦横に揃った不自然な筋が伸びる。斜めも入れると等方に近づく。
     */
    vec2 lap = -s;
    lap += texture2D(tState, at(vUv + vec2( uTexel.x, 0.0))).rg * 0.2;
    lap += texture2D(tState, at(vUv + vec2(-uTexel.x, 0.0))).rg * 0.2;
    lap += texture2D(tState, at(vUv + vec2(0.0,  uTexel.y))).rg * 0.2;
    lap += texture2D(tState, at(vUv + vec2(0.0, -uTexel.y))).rg * 0.2;
    lap += texture2D(tState, at(vUv + uTexel)).rg * 0.05;
    lap += texture2D(tState, at(vUv - uTexel)).rg * 0.05;
    lap += texture2D(tState, at(vUv + vec2(uTexel.x, -uTexel.y))).rg * 0.05;
    lap += texture2D(tState, at(vUv + vec2(-uTexel.x, uTexel.y))).rg * 0.05;

    float f = uFeed;
    float k = uKill;
    /*
     * 地図モード。横に f、縦に k を振る。**1 枚の中に全部の模様が並ぶ**
     * ので、係数が何を決めているのかが一目で分かる。
     *
     * 範囲は Karl Sims の図（f 0.01–0.1 / k 0.045–0.07）より狭めてある。
     * 全域だと右下が B で飽和した平面、左上が消滅した黒になり、画面の
     * 半分以上が何も起きない面になった。模様が出る斜めの帯に寄せる。
     */
    if (uMap > 0.5) {
      f = mix(0.014, 0.056, vUv.x);
      k = mix(0.053, 0.067, vUv.y);
    }

    float a = s.r;
    float b = s.g;
    float abb = a * b * b;
    float na = a + (uDa * lap.r - abb + f * (1.0 - a)) * uDt;
    float nb = b + (uDb * lap.g + abb - (k + f) * b) * uDt;

    // 筆。B を置く。縦横比を合わせないと楕円になる
    if (uBrush.z > 0.5) {
      float d = length((vUv - uBrush.xy) * uAspect);
      float m = smoothstep(uBrushR, uBrushR * 0.5, d);
      // 種と同じく A も下げる。B だけ置くと係数によっては消える
      na = mix(na, min(na, 0.5), m);
      nb = max(nb, m * 0.25);
    }

    gl_FragColor = vec4(clamp(na, 0.0, 1.0), clamp(nb, 0.0, 1.0), 0.0, 1.0);
  }
`

/**
 * 表示。
 *
 * **濃度をそのまま色にしない。** 緑と黒の教科書の絵になる。
 * B を高さとみなして法線を出し、光を当てる。模様が「描かれた柄」ではなく
 * 盛り上がった物質に見える。
 */
export const displayVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const displayFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tState;
  uniform vec2  uTexel;
  uniform float uHeight;
  uniform vec3  uLow;
  uniform vec3  uHigh;
  uniform vec3  uLightDir;
  uniform float uSpec;

  varying vec2 vUv;

  float h(vec2 uv) { return texture2D(tState, uv).g; }

  void main() {
    float b = h(vUv);

    /*
     * 中央差分で傾きを取る。**1 テクセル隣ではなく 1.5 テクセル離して引く。**
     * 隣同士だと格子の段がそのまま法線に出て、面がざらつく。
     */
    vec2 e = uTexel * 1.5;
    float dx = h(vUv + vec2(e.x, 0.0)) - h(vUv - vec2(e.x, 0.0));
    float dy = h(vUv + vec2(0.0, e.y)) - h(vUv - vec2(0.0, e.y));
    vec3 n = normalize(vec3(-dx * uHeight, -dy * uHeight, 1.0));

    vec3 l = normalize(uLightDir);
    vec3 v = vec3(0.0, 0.0, 1.0);
    float diff = clamp(dot(n, l), 0.0, 1.0);
    float spec = pow(clamp(dot(reflect(-l, n), v), 0.0, 1.0), 48.0);

    /*
     * 色は B の濃さで 2 色の間を振る。**境目を締める。** 線形に混ぜると
     * 模様の縁がぼやけて霧になる。
     */
    float t = smoothstep(0.12, 0.36, b);
    vec3 base = mix(uLow, uHigh, t);

    // 谷を落とす。盛り上がりの裾が影になると、高さが読める
    float cavity = smoothstep(0.0, 0.25, b) * 0.35 + 0.65;

    vec3 col = base * (0.28 + diff * 0.9) * cavity;
    col += vec3(1.0) * spec * uSpec * t;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
