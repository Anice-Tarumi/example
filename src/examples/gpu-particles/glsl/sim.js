import { noiseGLSL } from './noise'

export const quadVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * 位置シミュレーション。
 *
 * パーティクルの xyz を丸ごとテクスチャに持ち、毎フレーム別の RenderTarget へ
 * ping-pong しながら更新する。描画側は InstancedMesh の頂点シェーダーから
 * このテクスチャを引くだけでよく、CPU は一切位置を触らない。
 *
 * 各粒子は「元の形（球殻・円盤）を回転させた目標位置」へ慣性で追従しつつ、
 * curl noise で漂い、カーソルの力場に押される。
 */
export const simFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tPosition;
  uniform sampler2D tOriginal;
  uniform float uTime;
  uniform float uDelta;         // 60fps を 1.0 とした正規化デルタ
  uniform float uRotationSpeed;
  uniform float uCurlSize;
  uniform float uCurlSpeed;
  uniform float uCurlStrength;
  uniform float uShapeStrength;
  uniform float uLerpSpeed;
  uniform float uSwirl;
  uniform vec3  uMouse;
  uniform float uMouseStrength;
  uniform float uMouseRadius;
  uniform int   uOctaves;
  uniform float uSetup;

  varying vec2 vUv;

${noiseGLSL}

  mat3 rotateY(float a) {
    float s = sin(a), c = cos(a);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  }

  void main() {
    vec4 orig = texture2D(tOriginal, vUv);
    vec4 pos = texture2D(tPosition, vUv);
    vec3 current = pos.xyz;

    // 形（球殻・円盤）を丸ごと Y 回転させたものが目標位置
    vec3 shape = rotateY(uRotationSpeed * uTime) * orig.xyz;

    // 形への引力が弱いほど、現在位置を基準にして自由に漂う
    vec3 target = mix(current, shape, uShapeStrength);

    // persistence を UV で変調し、場所によって乱れ方を変える。
    // 一様な curl だと全体が同じリズムで揺れて機械的に見える。
    float persistence = 0.1 + (1.0 - (vUv.x + vUv.y) * 0.5) * 0.1;
    target += curlNoise(current * uCurlSize, uTime * uCurlSpeed, persistence, uOctaves) * uCurlStrength;

    // Y 軸まわりの旋回。円盤のときに差動回転として効く
    if (abs(uSwirl) > 0.0001) {
      vec3 axis = vec3(-current.z, 0.0, current.x);
      float r = max(length(axis), 0.0001);
      target += (axis / r) * uSwirl / (0.4 + r);
    }

    // カーソルの力場。正で引き寄せ、負で押しのける
    vec3 d = current - uMouse;
    float dist = length(d);
    float influence = exp(-(dist * dist) / max(uMouseRadius * uMouseRadius, 0.0001));
    target -= normalize(d + vec3(1e-5)) * influence * uMouseStrength;

    // 初期フレームは即座にスナップさせる。
    // これをしないと全粒子が原点から飛んでくる。
    if (uSetup > 0.5) {
      current = shape;
    } else {
      current += (target - current) * uLerpSpeed * uDelta;
    }

    gl_FragColor = vec4(current, orig.w);
  }
`
