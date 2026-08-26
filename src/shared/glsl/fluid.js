/**
 * Stam 系（半ラグランジュ）の Navier-Stokes ソルバのパス群。
 * PavelDoGreat の WebGL-Fluid 系の構成を three へ移植したもの。
 *
 * 1 フレームのパス順（この順序を崩すと解けない）:
 *   splat → curl → vorticity → divergence → clear → pressure×N
 *   → gradientSubtract → advect
 *
 * 染料を運ぶかどうかは呼び出し側の都合なので、ここには含めない。
 *   - examples/fluid-solver  … 速度場 + 染料。流体そのものを見せる
 *   - examples/gpu-particles … 速度場のみ。パーティクルを駆動する
 */

/** 隣接テクセルの UV を頂点側で作っておき、フラグメントでの計算を減らす */
export const baseVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform vec2 texelSize;

  void main() {
    vUv = uv;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** 線分に沿ってガウスで速度と色を注入する */
export const splatShader = /* glsl */`
  precision highp float;

  uniform sampler2D uTarget;
  uniform float aspectRatio;
  uniform vec3  color;
  uniform vec2  point;
  uniform vec2  prevPoint;
  uniform float radius;

  varying vec2 vUv;

  /** 点 p と線分 ab の距離 */
  float lineDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 p = vUv;
    vec2 a = prevPoint;
    vec2 b = point;
    p.x *= aspectRatio;
    a.x *= aspectRatio;
    b.x *= aspectRatio;

    float d = lineDist(p, a, b);
    vec3 splat = exp(-(d * d) / radius) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
  }
`

/** 渦度 = rot(velocity) */
export const curlShader = /* glsl */`
  precision highp float;

  uniform sampler2D uVelocity;

  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  void main() {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    float vorticity = R - L - T + B;
    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
  }
`

/**
 * Vorticity confinement。
 * 数値拡散で失われる渦を、渦度の勾配方向へ力を加えて復元する。
 */
export const vorticityShader = /* glsl */`
  precision highp float;

  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float curl;
  uniform float dt;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  void main() {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;

    vec2 vel = texture2D(uVelocity, vUv).xy;
    vel += force * dt;
    vel = min(max(vel, -1000.0), 1000.0);
    gl_FragColor = vec4(vel, 0.0, 1.0);
  }
`

/** 発散。壁面では速度を反転させて流出を防ぐ */
export const divergenceShader = /* glsl */`
  precision highp float;

  uniform sampler2D uVelocity;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  void main() {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;

    vec2 C = texture2D(uVelocity, vUv).xy;
    if (vL.x < 0.0)  { L = -C.x; }
    if (vR.x > 1.0)  { R = -C.x; }
    if (vT.y > 1.0)  { T = -C.y; }
    if (vB.y < 0.0)  { B = -C.y; }

    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
  }
`

/** 前フレームの圧力を減衰させて次の反復の初期値にする */
export const clearShader = /* glsl */`
  precision highp float;

  uniform sampler2D uTexture;
  uniform float value;

  varying vec2 vUv;

  void main() {
    gl_FragColor = value * texture2D(uTexture, vUv);
  }
`

/** ポアソン方程式の Jacobi 反復 */
export const pressureShader = /* glsl */`
  precision highp float;

  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float divergence = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
  }
`

/** 圧力勾配を引いて非圧縮にする */
export const gradientSubtractShader = /* glsl */`
  precision highp float;

  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity -= vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`

/** 半ラグランジュ移流。速度場を逆に辿って値を拾ってくる */
export const advectionShader = /* glsl */`
  precision highp float;

  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2  texelSize;
  uniform vec2  dyeTexelSize;
  uniform float dt;
  uniform float dissipation;

  varying vec2 vUv;

  /** dye が速度場より高解像度なので手動バイリニアで拾う */
  vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
    vec2 st = uv / tsize - 0.5;
    vec2 iuv = floor(st);
    vec2 fuv = fract(st);

    vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
    vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
    vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
    vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

    return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
  }

  void main() {
    vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
    vec4 result = bilerp(uSource, coord, dyeTexelSize);
    // 減衰は dt に対して指数で効かせる（フレームレート非依存）
    float decay = 1.0 + dissipation * dt;
    gl_FragColor = result / decay;
  }
`
