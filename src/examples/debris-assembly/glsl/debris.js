/**
 * 焼いた落下アニメを読むだけの頂点シェーダー。VAT と同じ構造。
 * 違いは **色を頂点属性で持っている**こと。着地スロットの絵の色を焼き込んである。
 */
export const debrisVertexShader = /* glsl */`
  attribute float aPiece;
  attribute vec3  aSize;
  attribute vec3  aColor;

  uniform sampler2D tPosition;
  uniform sampler2D tOrient;
  uniform vec2  uTexSize;
  uniform float uFrameFrom;
  uniform float uFrameTo;
  uniform float uFrameRatio;

  varying vec3 vNormalView;
  varying vec3 vColor;
  varying float vHeight;

  vec3 qrotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }

  vec2 texelUv(float piece, float frame) {
    return vec2((piece + 0.5) / uTexSize.x, (frame + 0.5) / uTexSize.y);
  }

  void main() {
    vec2 uvFrom = texelUv(aPiece, uFrameFrom);
    vec2 uvTo   = texelUv(aPiece, uFrameTo);

    vec3 pFrom = texture2D(tPosition, uvFrom).xyz;
    vec3 pTo   = texture2D(tPosition, uvTo).xyz;
    vec4 oFrom = texture2D(tOrient, uvFrom);
    vec4 oTo   = texture2D(tOrient, uvTo);

    vec3 center = mix(pFrom, pTo, uFrameRatio);
    vec4 orient = normalize(mix(oFrom, oTo, uFrameRatio));

    vec3 world = qrotate(orient, position * aSize) + center;

    vNormalView = normalize(normalMatrix * qrotate(orient, normal));
    vColor = aColor;
    vHeight = center.y;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

export const debrisFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3  uLightDir;
  uniform vec3  uShadowTint;
  uniform float uSteps;
  uniform float uAirFade;

  varying vec3 vNormalView;
  varying vec3 vColor;
  varying float vHeight;

  void main() {
    float ndl = dot(normalize(vNormalView), normalize(uLightDir)) * 0.5 + 0.5;
    float stepped = floor(ndl * uSteps) / max(uSteps - 1.0, 1.0);

    vec3 base = mix(vColor * uShadowTint, vColor, clamp(stepped, 0.0, 1.0));

    // 空中の破片を少し沈める。積もった面が主役になる
    float air = 1.0 - clamp(vHeight * uAirFade, 0.0, 0.55);
    gl_FragColor = vec4(base * air, 1.0);
    #include <colorspace_fragment>
  }
`
