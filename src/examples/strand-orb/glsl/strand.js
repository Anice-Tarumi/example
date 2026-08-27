/**
 * 糸オーブのシェーダー。
 *
 * 見どころは 2 つ。
 *
 * 1. **ループ閾値**（`loopingThreshold`）
 *    fract → 2 段の smoothstep だけで「線に沿って流れる光の帯」を作る汎用関数。
 *    帯の本数は repeat、帯幅は fillLength で決まる。
 *
 * 2. **discard によるリビール**
 *    `if (1.0 - aLen > progress) discard;` の 1 行。
 *    判定に糸長を使うと「形状の一部から生えてくる」演出になる。
 *    束・糸ごとのオフセットを足すと、生える順がばらける。
 *
 * 太さは画面空間で付ける。接線をクリップ空間へ落として垂直方向へ押し出すので、
 * カメラから遠い糸も同じ太さで出る。
 */

export const strandVertexShader = /* glsl */ `
  attribute vec3  aTangent;
  attribute float aSide;
  attribute float aLen;
  attribute float aStrand1;
  attribute float aStrand2;
  attribute float aBundle;

  uniform sampler2D tFluid;
  uniform vec2  uResolution;
  uniform float uThickness;
  uniform float uFluidPush;
  uniform float uFluidGain;

  varying float vLen;
  varying float vStrand1;
  varying float vStrand2;
  varying float vBundle;
  varying float vFluid;
  varying float vWorldZ;

  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

  void main() {
    vLen = aLen;
    vStrand1 = aStrand1;
    vStrand2 = aStrand2;
    vBundle = aBundle;

    vec3 pos = position;

    // いったん投影して、画面上のどこにいるかを知る
    vec4 clip0 = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    vec2 screenUV = clip0.xy / clip0.w * 0.5 + 0.5;

    // 流体の速度場を輝度として拾い、半径方向へ押し出す
    float fluid = dot(abs(texture2D(tFluid, screenUV).rgb), LUMA);
    fluid = smoothstep(-1.0, 1.5, fluid * uFluidGain) - 0.5;
    vFluid = fluid;
    pos += normalize(position) * fluid * uFluidPush;

    // 背面フェードはワールド z で測る。視空間 z はカメラ距離ぶん常に負の大きな値になり、
    // しきい値が全画素で外れて何も出なくなる
    vWorldZ = (modelMatrix * vec4(pos, 1.0)).z;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clip = projectionMatrix * mv;

    // 接線をクリップ空間へ落として、画面上の垂直方向を作る
    vec4 clipTan = projectionMatrix * modelViewMatrix * vec4(pos + aTangent, 1.0);
    vec2 s0 = clip.xy / max(clip.w, 1e-5);
    vec2 s1 = clipTan.xy / max(clipTan.w, 1e-5);
    vec2 dir = s1 - s0;
    if (dot(dir, dir) < 1e-12) dir = vec2(1.0, 0.0);
    dir = normalize(dir * uResolution);
    vec2 nrm = vec2(-dir.y, dir.x) / uResolution;

    // 糸ごとに太さを散らす
    float w = uThickness * mix(0.6, 1.4, aStrand1);
    clip.xy += nrm * aSide * w * clip.w;

    gl_Position = clip;
  }
`

export const strandFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uBundleOffset;
  uniform float uStrandOffset;
  uniform float uRepeat;
  uniform float uFillLength;
  uniform float uStartFade;
  uniform float uEndFade;

  uniform vec3  uColor;
  uniform vec3  uHighlightColor;
  uniform float uHighlightPower;
  uniform float uContrast;
  uniform float uOpacity;
  uniform float uReveal;
  uniform float uBackFade;
  uniform float uFluidGamma;

  varying float vLen;
  varying float vStrand1;
  varying float vStrand2;
  varying float vBundle;
  varying float vFluid;
  varying float vWorldZ;

  float mapRange(float v, float a, float b) {
    return a + (b - a) * v;
  }

  /**
   * 線に沿って流れる光の帯。
   *   x = 可視帯（立ち上がり - 立ち下がり）
   *   y = 立ち上がり
   *   z = 立ち下がり
   */
  vec3 loopingThreshold(float progress, float fillLength, float startFade, float endFade, float repeat) {
    float m = fract(progress * repeat);
    m = smoothstep(0.0, fillLength, m);
    float s = smoothstep(0.0, startFade, m);
    float e = smoothstep(1.0 - endFade, 1.0, m);
    return vec3(s - e, s, e);
  }

  void main() {
    // リビール。糸長の小さい側から順に現れる。
    // 範囲を -0.2..1.2 に広げておかないと、両端で詰まって同時に消える
    float revealAt = mapRange(uReveal, -0.2, 1.2);
    if (1.0 - (vLen + vStrand1 * 0.1 + vBundle * 0.1) > revealAt) discard;

    // 束ごと・糸ごとに位相をずらす。揃っていると機械的に見える
    float t = uTime * (uSpeed + vBundle * 0.1) + vBundle * uBundleOffset + vStrand2 * uStrandOffset;
    float progress = vLen + t + sin(uTime * 2.0 + vBundle * 24.392) * 0.05;

    vec3 th = loopingThreshold(progress, uFillLength, uStartFade, uEndFade, uRepeat);
    if (th.x < 0.01) discard;

    // ベース色。糸ごとにガンマを散らして単調さを消す
    vec3 base = pow(uColor, vec3(uContrast + (vStrand1 * 2.0 - 1.0) * 0.1));
    vec3 highlight = base * pow(uHighlightColor, vec3(mapRange(vStrand1, 0.3, 2.0)));

    vec3 color = mix(base, highlight * uHighlightPower, th.x);

    // 流体が当たっているところは締める
    color = pow(max(color, 0.0), vec3(1.0 + vFluid * uFluidGamma));

    // カメラから遠い糸を薄くする。手前と奥が同じ濃さだと球に見えない
    float depth = smoothstep(-uBackFade, uBackFade * 0.2, vWorldZ);

    float alpha = uOpacity * th.x * depth;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`
