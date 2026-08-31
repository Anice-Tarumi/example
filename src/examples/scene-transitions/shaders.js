export const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // FullScreenQuad の正射影カメラで 2x2 平面が画面全域を覆う
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const fragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D uSceneA;
  uniform sampler2D uSceneB;
  uniform float uProgress;
  uniform int   uMode;
  uniform float uDirection;   // 0 or 1
  uniform float uEdge;        // 境界のぼかし幅
  uniform float uNoiseScale;
  uniform float uNoiseAmount; // 境界を歪ませる量
  uniform float uFlash;       // 境界のフラッシュ強度
  uniform float uZoom;        // 遷移中のスケール演出
  uniform vec3  uOverlayColor;
  uniform float uAspect;

  // --- ice cut（igloo 方式）用 ---
  uniform sampler2D uScroll;   // r = 割れ目 / g = 中周波 / b = 低周波
  uniform float uSlope;        // 切り取り線の傾き
  uniform float uParallax;     // 前後のシーンを逆方向へ流す量
  uniform float uDisplace;     // 切り口付近の押しのけ
  uniform float uCaAmount;     // 色収差の強さ

  varying vec2 vUv;

  // ---- igloo の GLSL ヘルパーと同じ形 ----

  float linstep(float a, float b, float t) {
    return clamp((t - a) / (b - a), 0.0, 1.0);
  }

  /**
   * 進行度に応じて「しきい値の帯」を動かす関数。
   * margin を変えるだけで、同じ切り取り線から**硬い縁**と**柔らかい縁**を別々に取り出せる。
   * これが効いていて、割れ目・ぼかし・押しのけがそれぞれ違う速さで走る。
   */
  float falloff(float x, float start, float end, float margin, float progress) {
    float m = margin * sign(end - start);
    float p = mix(start - m, end, progress);
    return linstep(p + m, p, x);
  }

  float fitc(float x, float a1, float a2, float b1, float b2) {
    return clamp(b1 + ((x - a1) * (b2 - b1)) / (a2 - a1), min(b1, b2), max(b1, b2));
  }

  float power2In(float t) { return t * t; }

  /** 交互勾配ノイズ。ブルーノイズの代用。色収差の継ぎ目を隠す */
  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  // ---- 色収差。5 サンプルを樽型に歪ませて重ねる ----
  const int CA_ITER = 5;
  const float CA_RECI = 1.0 / float(CA_ITER);

  float caLinterp(float t) { return clamp(1.0 - abs(2.0 * t - 1.0), 0.0, 1.0); }
  float caRemap(float t, float a, float b) { return clamp((t - a) / (b - a), 0.0, 1.0); }

  vec2 caBarrel(vec2 coord, float amt) {
    vec2 cc = coord - 0.5;
    return coord + cc * dot(cc, cc) * amt;
  }

  vec4 caSpectrum(float t) {
    float lo = step(t, 0.5);
    float hi = 1.0 - lo;
    float w = caLinterp(caRemap(t, 1.0 / 6.0, 5.0 / 6.0));
    return pow(vec4(lo, 1.0, hi, 1.0) * vec4(1.0 - w, w, 1.0 - w, 1.0), vec4(1.0 / 2.2));
  }

  vec3 chromatic(sampler2D tex, vec2 uv, float maxdistort, float bend) {
    vec4 sum = vec4(0.0);
    vec4 sumw = vec4(0.0);
    for (int i = 0; i < CA_ITER; i++) {
      float t = float(i) * CA_RECI;
      vec4 w = caSpectrum(t);
      sumw += w;
      sum += w * texture2D(tex, caBarrel(uv, bend * maxdistort * t));
    }
    return (sum / sumw).rgb;
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  vec2 scaleUv(vec2 uv, float scale) {
    return (uv - 0.5) / scale + 0.5;
  }

  vec3 saturate3(vec3 c, float amount) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(l), c, amount);
  }

  // ---- mode 0: ノイズマスクによる拭き取りワイプ ----
  vec3 noiseWipe() {
    float t = uProgress;

    // 中央ほど拡大させて奥行きを出す（前後フレームで倍率を変える）
    float scaleMul = (1.0 - t) * abs(vUv.x - 0.5) * 2.0;
    vec3 prevColor = texture2D(uSceneA, scaleUv(vUv, 1.0)).rgb;
    vec3 currColor = texture2D(uSceneB, scaleUv(vUv, 1.0 + uZoom * scaleMul)).rgb;

    prevColor *= mix(1.0, 0.32, t);
    currColor *= mix(1.9, 1.0, t);
    prevColor = saturate3(prevColor, mix(1.0, 0.64, t));
    currColor = saturate3(currColor, mix(1.9, 1.0, t));

    vec2 np = vUv * vec2(uAspect, 1.0) * uNoiseScale;
    float n1 = fbm(np) - 0.5;
    float n2 = fbm(np + 17.3) - 0.5;

    float cutX = mix(vUv.x, 1.0 - vUv.x, uDirection);
    // ノイズのはみ出し分だけ範囲を広げ、端まで必ず拭き切れるようにする
    float head = mix(-uEdge - uNoiseAmount, 1.0 + uEdge + uNoiseAmount, t);
    float m1 = smoothstep(head - uEdge, head + uEdge, cutX + n1 * uNoiseAmount);
    float m2 = smoothstep(head - uEdge, head + uEdge, cutX - n2 * uNoiseAmount);
    float mixRatio = 1.0 - mix(m1, m2, 0.32 + n2 * 0.16);

    vec3 color = mix(prevColor, currColor, mixRatio);
    color = mix(color, color * 2.0, sin(mixRatio * 3.14159265) * uFlash);
    return color;
  }

  // ---- mode 1: 劇場カーテン（左右パネルが閉じて開く） ----
  vec3 curtain() {
    float cover = 1.0 - abs(uProgress * 2.0 - 1.0); // 0 → 1 → 0
    float edgeX = cover * 0.5;
    float e = max(uEdge * 0.25, 0.001);

    float left  = 1.0 - smoothstep(edgeX - e, edgeX + e, vUv.x);
    float right = smoothstep(1.0 - edgeX - e, 1.0 - edgeX + e, vUv.x);
    float mask = clamp(left + right, 0.0, 1.0);

    // 幕が閉じきった裏側でシーンを差し替える（ジャンク隠しの再現）
    vec3 base = mix(
      texture2D(uSceneA, vUv).rgb,
      texture2D(uSceneB, vUv).rgb,
      step(0.5, uProgress)
    );
    return mix(base, uOverlayColor, mask);
  }

  // ---- mode 2: 単色オーバーレイのフェード ----
  vec3 overlayFade() {
    float alpha = 1.0 - abs(uProgress * 2.0 - 1.0);
    vec3 base = mix(
      texture2D(uSceneA, vUv).rgb,
      texture2D(uSceneB, vUv).rgb,
      step(0.5, uProgress)
    );
    return mix(base, uOverlayColor, alpha);
  }

  // ---- mode 3: 円形ワイプ ----
  vec3 circleWipe() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float d = length(p);

    vec2 np = vUv * vec2(uAspect, 1.0) * uNoiseScale;
    d += (fbm(np) - 0.5) * uNoiseAmount;

    float maxR = 0.5 * sqrt(uAspect * uAspect + 1.0);
    float r = mix(-uEdge, maxR + uEdge, uProgress);
    float mask = 1.0 - smoothstep(r - uEdge, r + uEdge, d);

    vec3 color = mix(
      texture2D(uSceneA, vUv).rgb,
      texture2D(uSceneB, scaleUv(vUv, 1.0 + uZoom * (1.0 - uProgress))).rgb,
      mask
    );
    return mix(color, color * 2.0, sin(mask * 3.14159265) * uFlash);
  }

  /**
   * 斜めに割れて入れ替わる遷移（igloo 方式）。
   *
   * 肝は **同じ切り取り線から margin 違いで 3 本の縁を取り出す**こと。
   *   - 硬い縁（margin 0.2）→ 割れ目テクスチャと掛けて実際のマスクにする
   *   - 中くらい（0.9）    → 押しのけ量
   *   - 柔らかい縁（2.0）  → 色収差の強さ
   * 3 本が違う速さで走るので、切り口の手前が先にざわつき、遅れて割れる。
   * 1 本のマスクだけで切ると、どれだけ凝った形でも「切り替わった」だけに見える。
   */
  vec3 iceCut() {
    vec2 uvTex = vUv - 0.5;
    uvTex.x *= uAspect;
    uvTex += 0.5;
    vec3 scrollTex = texture2D(uScroll, uvTex).rgb;

    // 切り取り線の傾きを低周波ノイズで揺らす。直線だと定規で切ったように見える
    float slopeDisp = (scrollTex.b * 2.0 - 1.0) * 0.4;
    float slope = -uSlope * uAspect;
    float inclination = mix(1.0 - vUv.x + slopeDisp, vUv.x + slopeDisp, step(slope, 0.0));
    float incProgress = fitc(uProgress, 0.0, 1.0, 0.0, 1.0 + abs(slope));
    float axis = vUv.y + inclination * abs(slope);

    float cutBlur = falloff(axis, 0.0, 1.0, 2.0, incProgress);
    float cutDispA = falloff(axis, 0.0, 1.0, 0.9, incProgress);
    float cutDisp = falloff(scrollTex.g, 0.0, 1.0, 1.0, cutDispA);
    float cutDiag = falloff(axis, 0.0, 1.0, 0.2, incProgress);
    float cut = falloff(scrollTex.r, 0.0, 1.0, 2.0, cutDiag);

    // 画面の端では色収差を弱める。四隅で破綻するのを防ぐ
    float modulator = uCaAmount
      * smoothstep(1.0, 0.7, abs(vUv.x * 2.0 - 1.0))
      * smoothstep(1.0, 0.7, abs(vUv.y * 2.0 - 1.0));

    float n1 = ign(gl_FragCoord.xy);
    float n2 = ign(gl_FragCoord.xy + 19.0);

    // 片側が完全に隠れているならサンプルしない
    vec3 s1 = vec3(0.0);
    vec3 s2 = vec3(0.0);
    if (cut < 1.0) {
      vec2 uv1 = vUv - vec2(0.0, uParallax * power2In(uProgress) + uDisplace * cutDisp);
      s1 = chromatic(uSceneA, uv1, modulator, cutBlur * n1);
    }
    if (cut > 0.0) {
      vec2 uv2 = vUv + vec2(0.0, uParallax * power2In(1.0 - uProgress) + uDisplace * (1.0 - cutDisp));
      s2 = chromatic(uSceneB, uv2, modulator, (1.0 - cutBlur) * n2);
    }
    return clamp(mix(s1, s2, cut), vec3(0.0), vec3(1.0));
  }

  void main() {
    vec3 color;
    if (uMode == 4)      color = iceCut();
    else if (uMode == 0) color = noiseWipe();
    else if (uMode == 1) color = curtain();
    else if (uMode == 2) color = overlayFade();
    else                 color = circleWipe();

    gl_FragColor = vec4(color, 1.0);
    // FBO はリニア。画面出力時に sRGB へ変換する
    #include <colorspace_fragment>
  }
`
