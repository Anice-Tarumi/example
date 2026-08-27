/**
 * 頂点シェーダーだけで作るトンネル。
 *
 * ジオメトリは真っ直ぐな円筒 1 本しか持たない。
 * 曲がりも捻りも断面の歪みも、すべて頂点を動かして作る。
 *
 * 断面には **メビウス変換**（単位円板をそれ自身へ写す一次分数変換）を掛ける。
 *
 *   w' = (w - a) / (1 - conj(a) w)
 *
 * これは円を円に写すので断面の輪郭は円のままだが、点の分布だけが偏る。
 * 縞を貼っておくと「輪郭は変わらないのに模様だけ流れる」という、
 * 単なる拡大縮小では出せない動きになる。
 *
 * 法線はパラメータ (u, v) を微小にずらして 2 本の接ベクトルから作り直す。
 * 元の法線をそのまま使うと、歪めた面のライティングが破綻する。
 */

export const tunnelVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uLength;
  uniform float uRadius;
  uniform float uTwist;
  uniform float uMobius;     // メビウス変換の強さ（|a|）
  uniform float uMobiusSpin; // a の回る速さ
  uniform float uBend;       // 経路の曲がり
  uniform float uPulse;      // 半径の脈動
  uniform vec2  uCursor;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUvOut;
  varying float vTravel;

  vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }

  vec2 cdiv(vec2 a, vec2 b) {
    float d = dot(b, b) + 1e-6;
    return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d;
  }

  /** 単位円板を保つメビウス変換 */
  vec2 mobius(vec2 w, vec2 a) {
    return cdiv(w - a, vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), w));
  }

  /**
   * 経路の中心線。z に沿って曲がる。
   *
   * カメラ側（z = +uLength/2）では曲がりを 0 に落とす。
   * ここを曲げるとカメラが管の外に出てしまう。
   * 奥ほど強く曲げれば、覗いた先が曲がって見えるだけで済む。
   */
  vec3 spine(float z, float travel) {
    float g = smoothstep(uLength * 0.5, -uLength * 0.2, z);
    vec2 curve = vec2(
      sin(travel * 0.21) * 1.0 + sin(travel * 0.07 + 1.3) * 0.6,
      cos(travel * 0.17 + 0.5) * 0.9 + sin(travel * 0.05) * 0.5
    ) * uBend;
    return vec3((curve + uCursor * 2.2) * g, z);
  }

  /** (u, v) から歪めた後の位置を作る。法線もこの関数を使って差分で求める */
  vec3 surface(float u, float v) {
    float z = (v - 0.5) * uLength;
    // 符号に注意。travel が一定の特徴は z = C - t*speed へ動く。
    // + にすると特徴がカメラから遠ざかり、後ろ向きに飛んでいるように見える
    float travel = z - uTime * uSpeed;

    float ang = u * 6.2831853;
    vec2 w = vec2(cos(ang), sin(ang));

    // 捻り。進行方向に沿って断面を回す
    float tw = travel * uTwist;
    float cs = cos(tw);
    float sn = sin(tw);
    w = vec2(w.x * cs - w.y * sn, w.x * sn + w.y * cs);

    // メビウス変換。a を回すと偏りの向きが回る
    float ma = uTime * uMobiusSpin;
    vec2 a = vec2(cos(ma), sin(ma)) * uMobius;
    w = mobius(w, a);

    float r = uRadius * (1.0 + sin(travel * 0.55) * uPulse);
    return spine(z, travel) + vec3(w * r, 0.0);
  }

  void main() {
    vec3 p = surface(uv.x, uv.y);

    // 接ベクトル 2 本から法線を作り直す
    float du = 1.0 / 96.0;
    float dv = 1.0 / 200.0;
    vec3 pu = surface(uv.x + du, uv.y) - p;
    vec3 pv = surface(uv.x, uv.y + dv) - p;
    vec3 n = normalize(cross(pv, pu));

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    vUvOut = uv;
    vTravel = (uv.y - 0.5) * uLength - uTime * uSpeed;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const tunnelFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uFogColor;
  uniform float uFogDensity;
  uniform float uStripes;
  uniform float uStripeSharp;
  uniform float uRim;
  uniform vec3  uCameraPos;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUvOut;
  varying float vTravel;

  void main() {
    vec3 view = normalize(uCameraPos - vWorld);
    vec3 n = normalize(vNormal);
    // 内側から見るので法線は裏返っていることがある
    if (dot(n, view) < 0.0) n = -n;

    // 縞。u 方向に固定で貼るので、断面の歪みが模様の流れとして見える
    float s = fract(vUvOut.x * uStripes);
    float band = smoothstep(0.5 - uStripeSharp, 0.5, s) * smoothstep(0.5 + uStripeSharp, 0.5, s);

    // 進行方向のリング
    float rings = smoothstep(0.92, 1.0, abs(sin(vTravel * 1.4)));

    vec3 base = mix(uColorA, uColorB, band);
    base = mix(base, uColorB * 1.6, rings * 0.55);

    float diff = clamp(dot(n, view), 0.0, 1.0);
    float rim = pow(1.0 - diff, 3.0) * uRim;
    vec3 color = base * (0.28 + 0.72 * diff) + rim;

    float dist = length(uCameraPos - vWorld);
    float fog = 1.0 - exp(-dist * dist * uFogDensity * uFogDensity);
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
