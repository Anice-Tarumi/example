import { SEGS } from '../stroke'

/**
 * まっすぐな筒 1 本を、uniform で渡した Catmull-Rom スプラインに巻き付ける。
 *
 * 素材は「z 方向にまっすぐ伸びた円筒」であればよい。
 *   pos.z → スプラインのパラメータ（0..1）
 *   pos.xy → 断面の座標
 *
 * ジオメトリの再生成もモーフターゲットもしない。**uniform を書き換えるだけ**で
 * 任意の曲線に沿って伸びる。draw call もメモリも増えない。
 *
 * 表示範囲外はフラグメントで `discard` する。頂点は端に潰れるが見えない。
 */

export const stemVertexShader = /* glsl */ `
  #define CMULL_SEGS ${SEGS}

  uniform vec4  uSplineIv[CMULL_SEGS * 4];   // 展開済みの 3 次係数（4 本 / 区間）
  uniform vec3  uSplineNrm[CMULL_SEGS + 1];  // 節点ごとの up
  uniform vec2  uSplineParams;               // x = slide, y = scale
  uniform float uRadius;
  uniform float uTaper;                      // 先へ行くほど細くする量

  varying float vCatmullTime;
  varying vec3  vNormal;
  varying vec3  vWorld;
  varying vec2  vUv;

  /**
   * スプライン上の位置と姿勢を作って、断面をそこへ運ぶ。
   *
   * 係数は展開済みなのでホーナー法の評価だけ。接線は 1 階微分。
   * up は節点から補間して持ってくる（Frenet 枠だと曲率 0 で法線が飛ぶ）。
   */
  void catmullWarp(inout vec3 pos, inout vec3 nrm, float cmullt) {
    cmullt *= float(CMULL_SEGS);

    float t = fract(cmullt);
    int i = int(cmullt - t);
    if (i > CMULL_SEGS - 1) { i = CMULL_SEGS - 1; t = 1.0; }

    vec3 up = normalize(mix(uSplineNrm[i], uSplineNrm[i + 1], t));

    int k = i * 4;
    vec4 sp1 = uSplineIv[k];
    vec4 sp2 = uSplineIv[k + 1];
    vec4 sp3 = uSplineIv[k + 2];
    vec4 sp4 = uSplineIv[k + 3];

    vec4 ppos = t * (t * (t * sp4 + sp3) + sp2) + sp1;
    vec3 ptan = normalize(t * (t * sp4.xyz * 3.0 + sp3.xyz * 2.0) + sp2.xyz);

    // ppos.w にねじれ角が入っている
    float rc = cos(ppos.w);
    float rs = sin(ppos.w);
    vec3 side = normalize(cross(up, ptan));
    up = normalize(cross(ptan, side));

    mat3 frame = mat3(side * rc - up * rs, side * rs + up * rc, ppos.xyz);
    pos = frame * vec3(pos.xy, 1.0);

    frame[2] = ptan;
    nrm = normalize(frame * nrm);
  }

  void main() {
    vUv = uv;

    // z をスプラインのパラメータとして使う
    vCatmullTime = position.z * uSplineParams.y + uSplineParams.x;

    // 先端ほど細く
    float taper = mix(1.0, 1.0 - uTaper, clamp(position.z, 0.0, 1.0));
    vec3 p = vec3(position.xy * uRadius * taper, position.z);
    vec3 n = normalize(vec3(normal.xy, 0.0) + vec3(0.0, 0.0, 1e-4));

    catmullWarp(p, n, clamp(vCatmullTime, 0.0, 0.999999));

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const stemFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3  uColorBase;
  uniform vec3  uColorTip;
  uniform vec3  uLightDir;
  uniform vec3  uCameraPos;
  uniform float uGrow;      // ここまでしか描かない

  varying float vCatmullTime;
  varying vec3  vNormal;
  varying vec3  vWorld;
  varying vec2  vUv;

  void main() {
    // 伸びていない部分を捨てる。0.49999 の半端な数は境界のちらつき回避
    if (abs(vCatmullTime - 0.5) > 0.49999) discard;
    if (vCatmullTime > uGrow) discard;

    vec3 n = normalize(vNormal);
    vec3 v = normalize(uCameraPos - vWorld);
    if (dot(n, v) < 0.0) n = -n;

    float diff = clamp(dot(n, normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);
    float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.5);

    vec3 base = mix(uColorBase, uColorTip, clamp(vCatmullTime, 0.0, 1.0));
    vec3 color = base * (0.35 + 0.75 * diff) + rim * 0.28;

    // 先端の切り口を明るくして、伸びている感じを出す
    float tipGlow = smoothstep(uGrow - 0.035, uGrow, vCatmullTime);
    color = mix(color, uColorTip * 1.9, tipGlow * 0.8);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
