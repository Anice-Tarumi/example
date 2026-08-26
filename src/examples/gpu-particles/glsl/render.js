/**
 * 描画。Points を球に見立て、gl_PointCoord から法線を作って陰影を付ける。
 * 位置・速度テクスチャの w に仕込んだ陰影と速度をそのまま色に使う。
 */
export const particleVertexShader = /* glsl */`
  attribute vec2 texuv;

  uniform sampler2D tPosition;
  uniform sampler2D tVelocity;
  uniform float uSize;
  uniform float uViewportHeight;

  varying float vShadow;
  varying float vVel;

  void main() {
    vec4 posData = texture2D(tPosition, texuv);
    vec4 velData = texture2D(tVelocity, texuv);

    vec4 mv = modelViewMatrix * vec4(posData.xyz, 1.0);

    vShadow = posData.w;
    vVel = velData.w;

    gl_Position = projectionMatrix * mv;
    // 距離で減衰させつつ、画面解像度に対して見かけの大きさを揃える
    gl_PointSize = uSize / length(mv.xyz) * (uViewportHeight / 1300.0);
  }
`

export const particleFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3  uColorLight;
  uniform vec3  uColorDark;
  uniform vec3  uColorFast;
  uniform vec3  uLightPos;
  uniform float uAlpha;
  uniform float uFastFrom;
  uniform float uFastTo;

  varying float vShadow;
  varying float vVel;

  float fit(float v, float a, float b, float c, float d) {
    return clamp((v - a) / (b - a), 0.0, 1.0) * (d - c) + c;
  }

  mat3 rotateY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  }

  void main() {
    // 点を円に切り抜く
    float alpha = step(length(gl_PointCoord.xy - 0.5), 0.5);
    if (alpha < 0.001) discard;

    // 点座標から球の法線を近似する
    vec2 uv = 2.0 * gl_PointCoord.xy - 1.0;
    vec3 n = vec3(uv, sqrt(1.0 - clamp(dot(uv, uv), 0.0, 1.0)));
    n.y = 1.0 - n.y;

    float lightShadow = max(0.0, dot(normalize(rotateY(3.1416) * uLightPos), normalize(n)));
    float ramp = lightShadow * vShadow;

    vec3 color = mix(uColorDark, uColorLight, ramp);

    // 速い粒子を発光させる
    color = mix(color, uColorFast, pow(fit(vVel, uFastFrom, uFastTo, 0.0, 1.0), 2.0));

    // 速い粒子ほど薄くして擬似的なモーションブラーにする
    alpha *= pow(fit(vVel, uFastFrom * 0.7, uFastTo * 1.4, 1.0, 0.0), 2.0) * 0.5 + 0.5;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha * uAlpha);
    #include <colorspace_fragment>
  }
`
