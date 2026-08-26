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
  uniform vec3  uPointer;
  uniform float uPointerForce;
  uniform float uPointerRadius;
  uniform float uHeightLimit;
  uniform float uRadiusLimit;

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

    // カーソルの力場。元実装ではここに流体場の速度が入る
    vec3 toPointer = pos - uPointer;
    float pd = length(toPointer);
    float influence = exp(-(pd * pd) / max(uPointerRadius * uPointerRadius, 1e-4));
    vel.xyz += normalize(toPointer + vec3(1e-5)) * influence * uPointerForce * uDtRatio;
    float invPointer = 1.0 - influence * 0.65;

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
