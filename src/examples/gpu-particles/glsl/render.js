/**
 * 描画。InstancedMesh の各インスタンスが自分のテクセル座標 aFboUv を持ち、
 * 頂点シェーダーで位置テクスチャを引いてビルボードを配置する。
 */
export const particleVertexShader = /* glsl */`
  attribute vec2 aFboUv;
  attribute vec3 aRandom;

  uniform sampler2D tPosition;
  uniform sampler2D tPrevPosition;
  uniform float uSize;
  uniform float uSpeedStretch;

  varying vec2 vQuadUv;
  varying float vRandom;
  varying float vSpeed;
  varying float vDepth;

  void main() {
    vec4 data = texture2D(tPosition, aFboUv);
    vec3 world = data.xyz;

    // 前フレームとの差分で速度を出し、色とサイズに反映する
    vec3 prev = texture2D(tPrevPosition, aFboUv).xyz;
    vec3 delta = world - prev;
    float speed = length(delta);

    vec4 mv = modelViewMatrix * vec4(world, 1.0);

    // 進行方向へ僅かに引き伸ばして流れを感じさせる
    vec2 offset = position.xy;
    vec2 dir = (modelViewMatrix * vec4(delta, 0.0)).xy;
    float dirLen = length(dir);
    if (dirLen > 0.0001) {
      vec2 axis = dir / dirLen;
      float along = dot(offset, axis);
      offset += axis * along * min(speed * uSpeedStretch, 3.0);
    }

    float scale = uSize * (0.45 + aRandom.x * 0.85);
    mv.xy += offset * scale;

    gl_Position = projectionMatrix * mv;

    vQuadUv = uv;
    vRandom = aRandom.y;
    vSpeed = speed;
    vDepth = -mv.z;
  }
`

export const particleFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorHot;
  uniform float uIntensity;
  uniform float uSpeedTint;
  uniform float uFalloff;

  varying vec2 vQuadUv;
  varying float vRandom;
  varying float vSpeed;
  varying float vDepth;

  void main() {
    // 円形のソフトなスプライト。テクスチャを持たずに済ませる
    float d = length(vQuadUv - 0.5) * 2.0;
    float alpha = pow(clamp(1.0 - d, 0.0, 1.0), uFalloff);
    if (alpha < 0.002) discard;

    vec3 color = mix(uColorA, uColorB, vRandom);
    // 速い粒子ほど熱色に寄せる
    color = mix(color, uColorHot, clamp(vSpeed * uSpeedTint, 0.0, 1.0));

    // 遠い粒子を僅かに落として奥行きを出す
    float depthFade = clamp(1.6 / (0.6 + vDepth * 0.18), 0.0, 1.0);

    gl_FragColor = vec4(color * alpha * uIntensity * depthFade, alpha);
    #include <colorspace_fragment>
  }
`
