/**
 * 焼いたテクスチャを読んで再生するだけの頂点シェーダー。
 * CPU は毎フレーム何もしない（uniform を 3 つ書き換えるだけ）。
 */
export const vatVertexShader = /* glsl */`
  attribute float aPiece;
  attribute vec3  aOrigin;
  attribute vec3  aSize;
  attribute vec3  aTint;

  uniform sampler2D tPosition;
  uniform sampler2D tOrient;
  uniform vec2  uTexSize;      // x = 破片数, y = フレーム数
  uniform float uFrameFrom;
  uniform float uFrameTo;
  uniform float uFrameRatio;
  uniform float uScatter;

  varying vec3 vNormalView;
  varying vec3 vTint;
  varying float vShatter;

  /** クォータニオンでベクトルを回す */
  vec3 qrotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }

  vec2 texelUv(float piece, float frame) {
    return vec2((piece + 0.5) / uTexSize.x, (frame + 0.5) / uTexSize.y);
  }

  void main() {
    vec2 uvFrom = texelUv(aPiece, uFrameFrom);
    vec2 uvTo   = texelUv(aPiece, uFrameTo);

    vec3 offFrom = texture2D(tPosition, uvFrom).xyz;
    vec3 offTo   = texture2D(tPosition, uvTo).xyz;
    vec4 oriFrom = texture2D(tOrient, uvFrom);
    vec4 oriTo   = texture2D(tOrient, uvTo);

    // 隣接フレームなら slerp でなく線形 mix + 正規化で十分なめらか
    vec3 offset = mix(offFrom, offTo, uFrameRatio) * uScatter;
    vec4 orient = normalize(mix(oriFrom, oriTo, uFrameRatio));

    // 破片ローカル → 回転 → 元の位置 → 焼いた変位
    vec3 local = position * aSize;
    vec3 world = qrotate(orient, local) + aOrigin + offset;

    vec4 mv = modelViewMatrix * vec4(world, 1.0);

    vNormalView = normalize(normalMatrix * qrotate(orient, normal));
    vTint = aTint;
    // どれだけ飛んだか。着色に使う
    vShatter = clamp(length(offset) * 0.55, 0.0, 1.0);

    gl_Position = projectionMatrix * mv;
  }
`

export const vatFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3  uLightDir;
  uniform vec3  uColorLit;
  uniform vec3  uColorShadow;
  uniform vec3  uColorHot;
  uniform float uSteps;

  varying vec3 vNormalView;
  varying vec3 vTint;
  varying float vShatter;

  void main() {
    float ndl = dot(normalize(vNormalView), normalize(uLightDir)) * 0.5 + 0.5;
    float stepped = floor(ndl * uSteps) / max(uSteps - 1.0, 1.0);

    vec3 base = mix(uColorShadow, uColorLit, clamp(stepped, 0.0, 1.0)) * vTint;
    // 飛んだ破片ほど熱色に寄せる
    vec3 color = mix(base, uColorHot, vShatter * 0.55);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
