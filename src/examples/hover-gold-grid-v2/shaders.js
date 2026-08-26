import { patternGLSL } from './pattern'

export const vertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const fragmentShader = /* glsl */`
  uniform vec3  uHitPos;
  uniform float uInside;
  uniform float uTime;
  uniform float uPulseFrequency;
  uniform float uPulseSharpness;
  uniform float uPulseGamma;
  uniform float uPixellation;
  uniform float uUvMixMultiplier;
  uniform vec3  uPulseColor;
  uniform float uPulseIntensity;
  uniform float uHueShift;
  uniform vec3  uBaseColor;
  uniform vec3  uAccentColor;
  uniform int   uPattern;
  uniform float uPatternScale;

  varying vec2 vUv;
  varying vec3 vPos;

${patternGLSL}

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    vec2 uv = vUv;

    // ヒット点からの 3D 距離でリング波を作る。
    // 山を pow で 2 層に重ねると、太い波の中に細い芯が入って締まる。
    float pulse = 0.0;
    if (uInside > 0.001) {
      float gradient = length(vPos - uHitPos) * 0.35;
      float p = sin(gradient * uPulseFrequency - uTime + 3.8) * 0.5 + 0.5;
      pulse = pow(p, uPulseSharpness) + pow(p, uPulseSharpness * 3.0) * 0.5;
    }
    pulse *= uInside;

    // 波の山だけ UV を量子化してモザイク化する
    float uvMix = clamp(pulse * uUvMixMultiplier, 0.0, 1.0);
    uv = mix(uv, floor(uv * uPixellation) / uPixellation, uvMix);

    // 下地。量子化された UV でサンプルするのでモザイクがそのまま出る
    float luma = patternLuma(uv, uPattern, uPatternScale);
    vec3 color = mix(uBaseColor, uAccentColor, luma);

    // 下地の明るいところほど強く発光させる（元実装の dot(color,1)*0.5+0.5 相当）
    float lit = pulse * (dot(color, vec3(0.3333)) * 0.5 + 0.5);

    // 加算色の色相を波の強さで少しずらす。
    // 元実装は sRGB 値を前提に -0.08 の固定オフセットを持つが、ここでの
    // uPulseColor はリニアで hue の位置が異なるため、固定分は外して
    // 波の強弱に対する相対シフトだけ残す。
    vec3 hsv = rgb2hsv(uPulseColor);
    hsv.x = fract(hsv.x + (smoothstep(0.4, 1.0, lit) - 0.5) * 0.06 * uHueShift + 1.0);
    vec3 pulseCol = hsv2rgb(hsv);

    color += pulseCol * pow(lit, uPulseGamma) * uPulseIntensity;
    color *= mix(1.0, 2.0, pow(lit, 4.0));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
