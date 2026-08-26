import { patternGLSL } from './pattern'

/** 同時に走らせる波紋の数 */
export const MAX_RIPPLES = 8

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
  #define MAX_RIPPLES ${MAX_RIPPLES}

  uniform vec3  uOrigins[MAX_RIPPLES];
  uniform float uAges[MAX_RIPPLES];   // 経過秒。負なら無効
  uniform float uLifetime;
  uniform float uMaxRadius;
  uniform float uRingWidth;
  uniform float uSharpness;
  uniform float uEase;
  uniform float uFrequency;
  uniform float uTailFalloff;

  uniform float uPixellation;
  uniform float uUvMixMultiplier;
  uniform float uMosaicFocus;

  uniform vec3  uPulseColor;
  uniform float uPulseIntensity;
  uniform float uPulseGamma;
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

  /**
   * 波の広がり方。等速だと機械的なので、飛び出しは速く、
   * 遠ざかるほど失速させる。uEase を上げるほど緩急が強くなる。
   */
  float easeOutRipple(float t, float k) {
    return 1.0 - pow(1.0 - clamp(t, 0.0, 1.0), k);
  }

  /**
   * 波紋 1 本の寄与。
   *
   * リングを 1 本だけ出すと単調なので、波面の内側に同心円の列を並べる。
   * 元実装（buttermax）の sin(distance * freq - time) と同じ質感だが、
   * 波面より外には出さず、内側は指数で減衰させることで
   * 「1 回の衝撃から広がって消える」挙動にしている。
   */
  float rippleAt(vec3 pos, vec3 origin, float age) {
    if (age < 0.0) return 0.0;

    float progress = age / uLifetime;
    if (progress > 1.0) return 0.0;

    float radius = easeOutRipple(progress, uEase) * uMaxRadius;
    float d = length(pos - origin);

    // 波面からの距離。正なら波面の内側
    float behind = radius - d;

    // 同心円の列
    float wave = sin(behind * uFrequency) * 0.5 + 0.5;
    wave = pow(wave, uSharpness);

    // 波面の外へは出さない。境界は uRingWidth ぶんだけ滑らかに
    float front = smoothstep(0.0, max(uRingWidth, 1e-4), behind);

    // 内側の余韻。奥へ行くほど弱まる
    float tail = exp(-max(behind, 0.0) * uTailFalloff);

    // 寿命の終わりに向けて消える。前半は落とさない
    float fade = 1.0 - smoothstep(0.4, 1.0, progress);

    return wave * front * tail * fade;
  }

  void main() {
    vec2 uv = vUv;

    // 複数の波紋は加算ではなく max。重なっても飽和しない
    float pulse = 0.0;
    for (int i = 0; i < MAX_RIPPLES; i++) {
      pulse = max(pulse, rippleAt(vPos, uOrigins[i], uAges[i]));
    }

    // モザイクは帯の芯だけに掛ける。pulse をそのまま使うと裾まで潰れる
    float mosaic = pow(pulse, uMosaicFocus);
    float uvMix = clamp(mosaic * uUvMixMultiplier, 0.0, 1.0);
    uv = mix(uv, floor(uv * uPixellation) / uPixellation, uvMix);

    float luma = patternLuma(uv, uPattern, uPatternScale);
    vec3 color = mix(uBaseColor, uAccentColor, luma);

    // 下地の明るいところほど強く発光させる
    float lit = pulse * (dot(color, vec3(0.3333)) * 0.5 + 0.5);

    vec3 hsv = rgb2hsv(uPulseColor);
    hsv.x = fract(hsv.x + (smoothstep(0.4, 1.0, lit) - 0.5) * 0.06 * uHueShift + 1.0);
    vec3 pulseCol = hsv2rgb(hsv);

    color += pulseCol * pow(lit, uPulseGamma) * uPulseIntensity;
    color *= mix(1.0, 2.0, pow(lit, 4.0));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
