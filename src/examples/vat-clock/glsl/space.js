/**
 * 背景の宇宙。星雲・星・光条を 1 枚の板にまとめて描く。
 *
 * 物体を並べて宇宙を作らない。星を数千個の点で置くと、正射影では
 * 遠近が出ずに「手前に散った粒」にしか見えない。**画面に直接描いて**、
 * 層ごとに流れる速さを変えるほうが奥行きが出る。
 *
 * 二層を重ねる。
 *
 *   1. 星雲 … 二段の値ノイズ。ゆっくり流し、色を二色の間で振る
 *   2. 星   … 速さの違う三層。速い層ほど手前に見える
 *
 * 光の筋はここには描かない。画面に引いた斜線は背景の模様にしか見えず、
 * 時計と同じ空間にいる感じが出ない。**周回する彗星として 3D に置く。**
 */

const NOISE = /* glsl */`
  float hash21(vec2 p) {
    // sin を使った hash は座標が大きくなると精度が落ちて縞になる
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += vnoise(p) * a;
      // 回しながら重ねる。同じ向きで足すと格子が透ける
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return v;
  }
`

export const spaceVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // 画面いっぱいの板。行列を通さず直接クリップ空間へ置く
    gl_Position = vec4(position.xy * 2.0, 0.99999, 1.0);
  }
`

export const spaceFragmentShader = /* glsl */`
  precision highp float;
  ${NOISE}

  uniform float uTime;
  uniform float uAspect;
  uniform vec3  uDeep;      // 空の底の色
  uniform vec3  uNebulaA;   // 星雲の色 1
  uniform vec3  uNebulaB;   // 星雲の色 2
  uniform float uNebula;
  uniform float uStars;

  varying vec2 vUv;

  /**
   * 星の 1 層。マスの中に 1 つだけ星を置く。
   * 座標を流すと、マスごと動いて層全体が流れる。
   */
  float starLayer(vec2 p, float scale, float thr, float speed, float t) {
    vec2 q = p * scale + vec2(t * speed, t * speed * 0.25);
    vec2 id = floor(q);
    vec2 f = fract(q);
    float h = hash21(id);
    if (h < thr) return 0.0;
    vec2 c = vec2(hash21(id + 1.37), hash21(id + 7.71));
    float d = length(f - c);
    // 瞬き。全部が同じ位相だと画面全体が明滅する
    float tw = 0.55 + 0.45 * sin(t * 2.3 + h * 62.0);
    /*
     * 暈はマスの中の比率で決まる。目の粗い層ほど画面上では大きく広がるので、
     * **広く取りすぎると星ではなくボケた光の玉になる。**
     */
    float core = smoothstep(0.06, 0.0, d);
    float halo = smoothstep(0.14, 0.0, d) * 0.07;
    return (core + halo) * tw * (h - thr) / (1.0 - thr);
  }

  void main() {
    vec2 p = vUv - 0.5;
    p.x *= uAspect;
    float t = uTime;

    // --- 星雲 ---
    // 座標をノイズでずらしてから引く。渦を巻いた雲になる
    vec2 w = vec2(fbm(p * 1.7 + t * 0.012), fbm(p * 1.7 + 5.2 - t * 0.009));
    float n = fbm(p * 2.4 + w * 1.6);
    // 下を厚く切る。全面に薄く乗ると宇宙ではなく曇り空に見える
    n = pow(smoothstep(0.42, 1.0, n), 2.2);
    vec3 neb = mix(uNebulaA, uNebulaB, smoothstep(0.2, 0.8, fbm(p * 1.1 - t * 0.006)));
    vec3 col = uDeep + neb * n * uNebula;

    // --- 星 ---
    // 速さを変えた三層。速い層ほど手前に見える
    float s = 0.0;
    s += starLayer(p, 26.0, 0.965, 0.004, t) * 0.55;
    s += starLayer(p, 15.0, 0.972, 0.010, t) * 0.85;
    s += starLayer(p,  8.0, 0.980, 0.020, t) * 1.20;
    col += vec3(0.85, 0.9, 1.0) * s * uStars;

    // 中心をわずかに持ち上げる。字が座る場所を作る
    col += uNebulaA * 0.06 * smoothstep(0.7, 0.0, length(p * vec2(0.55, 1.0)));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * 手前と奥を漂う塵。
 *
 * 背景が絵である以上、奥行きは**実際に動く物**でしか出ない。
 * 字より手前と奥に薄い粒を撒き、z ごとに速さと大きさを変える。
 */
export const dustVertexShader = /* glsl */`
  precision highp float;

  attribute vec3 aSeed;   // 位置の種
  uniform float uTime;
  uniform float uProj;
  uniform float uSpread;
  uniform float uSpeed;

  varying float vDim;

  void main() {
    // 種は 0..1。x だけ巻き戻すので、y と z は中心を跨がせる
    vec3 p = vec3(aSeed.x * uSpread, (aSeed.y - 0.5) * uSpread * 0.5, (aSeed.z - 0.5) * uSpread * 0.4);

    // 奥ほどゆっくり流れる。同じ速さだと一枚の膜に見える
    float depth = aSeed.z;
    float sp = mix(0.25, 1.0, depth) * uSpeed;
    p.x = mod(p.x + uTime * sp + uSpread * 0.5, uSpread) - uSpread * 0.5;
    p.y += sin(uTime * 0.3 + aSeed.x * 9.0) * 0.4;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // 遠近が付くので距離で割る
    gl_PointSize = mix(1.6, 4.0, depth) * uProj * 0.02 / max(0.001, -mv.z);
    vDim = mix(0.12, 0.5, depth);
  }
`

export const dustFragmentShader = /* glsl */`
  precision highp float;
  uniform vec3 uColor;
  varying float vDim;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    gl_FragColor = vec4(uColor, smoothstep(0.25, 0.0, d) * vDim);
    #include <colorspace_fragment>
  }
`
