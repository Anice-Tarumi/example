import {
  baseVertexShader,
  splatShader,
  curlShader,
  vorticityShader,
  divergenceShader,
  clearShader,
  pressureShader,
  gradientSubtractShader,
  advectionShader,
} from '../../../shared/glsl/fluid'

export {
  baseVertexShader,
  splatShader,
  curlShader,
  vorticityShader,
  divergenceShader,
  clearShader,
  pressureShader,
  gradientSubtractShader,
  advectionShader,
}

/** 最終描画。dye をそのまま出すか、速度場・圧力を可視化する */
export const displayShader = /* glsl */`
  precision highp float;

  uniform sampler2D uTexture;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurlTex;
  uniform float uExposure;
  uniform float uShadingAmount;
  uniform vec2  texelSize;
  uniform int   uMode;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  void main() {
    if (uMode == 1) {
      // 速度場。方向を色相、大きさを明度に割り当てる。
      // 線形だと少し動いただけで飽和するので、緩めのガンマを掛ける
      vec2 v = texture2D(uVelocity, vUv).xy;
      float m = pow(clamp(length(v) * 0.0045, 0.0, 1.0), 0.8);
      vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.09, 4.18) + atan(v.y, v.x));
      gl_FragColor = vec4(col * m, 1.0);
      #include <colorspace_fragment>
      return;
    }

    if (uMode == 2) {
      // 渦度。正負を色で分ける
      float c = texture2D(uCurlTex, vUv).x;
      vec3 warm = vec3(1.0, 0.42, 0.12);
      vec3 cool = vec3(0.15, 0.55, 1.0);
      gl_FragColor = vec4(mix(vec3(0.02), c > 0.0 ? warm : cool, clamp(abs(c) * 0.6, 0.0, 1.0)), 1.0);
      #include <colorspace_fragment>
      return;
    }

    vec3 color = texture2D(uTexture, vUv).rgb * uExposure;

    // dye の勾配から擬似的な陰影を付けて立体感を出す
    if (uShadingAmount > 0.0) {
      vec3 lc = texture2D(uTexture, vL).rgb;
      vec3 rc = texture2D(uTexture, vR).rgb;
      vec3 tc = texture2D(uTexture, vT).rgb;
      vec3 bc = texture2D(uTexture, vB).rgb;
      float dx = length(rc) - length(lc);
      float dy = length(tc) - length(bc);
      vec3 n = normalize(vec3(dx, dy, length(texelSize)));
      float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
      color = mix(color, color * diffuse, uShadingAmount);
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
