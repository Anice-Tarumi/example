/**
 * 空。内側から見る球に貼る。
 *
 * 上下 2 色のグラデーションだけでも空には見えるが、太陽の周りが
 * 明るくならないので「色を塗った天井」に留まる。
 *
 *   1. 天頂と地平の 2 色。境目は視線の高さの累乗で寄せる
 *   2. 太陽の周りの広い滲み（ミー散乱の代わり）
 *   3. 太陽本体
 *   4. 地平線の帯。地面との継ぎ目を隠す
 */

export const skyVertexShader = /* glsl */`
  varying vec3 vDir;

  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const skyFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3  uTop;
  uniform vec3  uHorizon;
  uniform vec3  uSun;
  uniform vec3  uSunDir;
  uniform float uSunPower;
  uniform float uHaze;     // 天候。上げるほど太陽の滲みが広がって輪郭が消える
  uniform float uExposure;

  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);

    // 1. 上下のグラデーション。累乗で地平側に寄せると空らしくなる
    float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(up, 0.55));

    float c = max(dot(d, normalize(uSunDir)), 0.0);

    // 2. 太陽の周りの滲み。曇るほど広く弱く
    float glowWidth = mix(8.0, 1.6, clamp(uHaze, 0.0, 1.0));
    col += uSun * pow(c, glowWidth) * uSunPower * 0.55;

    // 3. 太陽本体。地平の下に沈んだら出さない
    float disc = smoothstep(0.9993, 0.9997, c) * step(-0.02, uSunDir.y);
    col += uSun * disc * uSunPower * mix(6.0, 0.6, clamp(uHaze, 0.0, 1.0));

    // 4. 地平線の帯。地面と空の継ぎ目をぼかす
    col = mix(col, uHorizon, smoothstep(0.06, -0.02, d.y) * 0.65);

    col *= uExposure;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
