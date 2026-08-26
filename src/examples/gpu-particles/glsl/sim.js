import { bitangentNoiseGLSL } from './noise'

export const quadVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * 力の合成とボリュームのサンプルは速度パスと位置パスで共有する。
 *
 * 元実装（igloo）は位置と速度を MRT で 1 パスにまとめているが、
 * Float の MRT は環境によって通らないことがあるため、ここでは
 * 速度 → 位置の 2 パスに分けている。計算内容は同じ。
 */
const sharedGLSL = /* glsl */`
  precision highp float;
  precision highp sampler3D;

  uniform sampler2D tPosition;
  uniform sampler2D tVelocity;
  uniform sampler2D tOriginal;
  uniform sampler3D tVolume;

  uniform float uTime;
  uniform float uDtRatio;
  uniform float uRotation;
  uniform float uNoiseForce;
  uniform float uNoiseScale;
  uniform float uSurfaceForce;
  uniform float uReturnForce;
  uniform float uFriction;
  uniform float uVolumeScale;
  uniform float uCubeSize;
  uniform vec3  uLightPos;
  uniform float uHeightLimit;
  uniform float uRadiusLimit;

  // 画面空間の流体場。カーソルの力はここを経由してパーティクルへ伝わる
  uniform sampler2D tFluid;
  uniform mat4  uViewMat;
  uniform mat4  uProjMat;
  uniform float uPushForce;
  uniform float uInteractForce;
  uniform float uFluidScale;

  varying vec2 vUv;

${bitangentNoiseGLSL}

  float frictionFPS(float t, float dt) { return exp2(log2(t) * dt); }
  float lerpCoefFPS(float t, float dt) { return 1.0 - exp2(log2(1.0 - t) * dt); }

  mat3 rotateY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  }

  vec4 pixelRand(vec2 uv) {
    return vec4(
      fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453),
      fract(sin(dot(uv, vec2(93.989, 67.345))) * 28461.6723),
      fract(sin(dot(uv, vec2(45.332, 29.871))) * 63728.1923),
      fract(sin(dot(uv, vec2(73.156, 51.927))) * 91837.4562)
    );
  }

  /** ボリュームから表面への勾配と符号付き距離を引く */
  void sampleVolume(vec3 pos, out vec3 grad, out float dist) {
    mat3 rot = rotateY(uRotation);
    vec3 samplePos = rot * (pos / uCubeSize) * uVolumeScale * 0.5 + 0.5;
    vec4 volData = texture(tVolume, samplePos);
    grad = normalize(volData.rgb * 2.0 - 1.0) * rot;
    dist = (volData.a * 2.0 - 1.0) * 2.0;
  }
`

/** 速度パス。出力 = vec4(velocity.xyz, 均した速度の大きさ) */
export const velocityFragmentShader = /* glsl */`
${sharedGLSL}

  void main() {
    vec3 pos = texture2D(tPosition, vUv).xyz;
    vec4 vel = texture2D(tVelocity, vUv);
    vec4 rnd = pixelRand(vUv);

    vec3 grad;
    float dist;
    sampleVolume(pos, grad, dist);

    // 有機的な揺らぎ
    float force1 = uNoiseForce * (0.7 + 0.3 * rnd.z);
    vel.xyz += BitangentNoise4D(vec4(pos * uNoiseScale, uTime * (1.0 + 0.7 * rnd.y))) * force1 * uDtRatio;

    // パーティクルをカメラ投影し、その画面位置の流体速度で押しのける。
    // 押す向きはビューの right / up、つまり画面平面に沿った方向になる。
    vec4 viewPos = uViewMat * vec4(pos, 1.0);
    vec4 proj = uProjMat * viewPos;
    vec2 uvScreen = (proj.xy / proj.w + 1.0) * 0.5;
    // 流体場の値域はソルバの splat 強度に依存する。パーティクル空間（±0.5 程度）へ
    // 揃えるための係数を掛けてから使う
    vec3 fluidVel = texture2D(tFluid, uvScreen).xyz * uFluidScale;
    vec3 right = vec3(uViewMat[0][0], uViewMat[1][0], uViewMat[2][0]);
    vec3 up    = vec3(uViewMat[0][1], uViewMat[1][1], uViewMat[2][1]);
    vec3 disp = right * fluidVel.x + up * fluidVel.y;
    vel.xyz += disp * uPushForce * uDtRatio * uInteractForce;

    // 流れが速いところでは形へ戻る力を弱め、流体に持っていかれるようにする。
    // 元実装に clamp は無いが、流体が強いと負に振れて復帰力と吸着力が反転し、
    // パーティクルが発散するので 0 で止める。
    float invPointer = clamp(1.0 - length(fluidVel) * 0.65 * uInteractForce, 0.0, 1.0);

    // 元位置へ戻る力
    vec3 origPos = texture2D(tOriginal, vUv).xyz;
    vel.xyz += (origPos - pos) * uReturnForce * uDtRatio * invPointer;

    // 表面へ吸着する力。符号で内外を判定して向きを反転する
    float force2 = uSurfaceForce * (0.7 + 0.3 * rnd.w);
    float signForce = mix(0.0, -0.3, sign(dist) + 1.0);
    vel.xyz += grad * force2 * signForce * uDtRatio * invPointer;

    vel.xyz *= frictionFPS(uFriction, uDtRatio);

    // 均した速度の大きさ。描画側で発光に使う
    vel.a = mix(vel.a, length(vel.xyz), lerpCoefFPS(0.035, uDtRatio));

    gl_FragColor = vel;
  }
`

/** 位置パス。出力 = vec4(position.xyz, wrap diffuse の陰影) */
export const positionFragmentShader = /* glsl */`
${sharedGLSL}

  void main() {
    vec4 pos = texture2D(tPosition, vUv);
    vec3 vel = texture2D(tVelocity, vUv).xyz;

    pos.xyz += vel * uDtRatio;

    // 収まる領域を円柱に制限する
    pos.y = clamp(pos.y, -uHeightLimit, uHeightLimit);
    float xzLen = length(pos.xz);
    if (xzLen > 0.001) {
      pos.xz = normalize(pos.xz) * clamp(xzLen, 0.0, uRadiusLimit);
    }

    vec3 grad;
    float dist;
    sampleVolume(pos.xyz, grad, dist);

    // wrap diffuse（GPU Gems の subsurface 近似）。表面法線として勾配を使う
    vec3 lightDir = normalize(uLightPos);
    float wrap = 0.25;
    float dp = dot(lightDir, grad);
    float wrapDiffuse = max(0.0, (dp + wrap) / (1.0 + wrap));
    wrapDiffuse += max(0.0, -dp) * 0.1;
    pos.a = mix(wrapDiffuse * 0.2, wrapDiffuse, smoothstep(-0.05, -0.001, dist));

    gl_FragColor = pos;
  }
`

/** 初期テクスチャを FBO へ流し込むコピーパス */
export const copyFragmentShader = /* glsl */`
  precision highp float;
  uniform sampler2D tSource;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tSource, vUv);
  }
`
