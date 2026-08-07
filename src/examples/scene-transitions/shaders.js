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

  varying vec2 vUv;

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

  void main() {
    vec3 color;
    if (uMode == 0)      color = noiseWipe();
    else if (uMode == 1) color = curtain();
    else if (uMode == 2) color = overlayFade();
    else                 color = circleWipe();

    gl_FragColor = vec4(color, 1.0);
    // FBO はリニア。画面出力時に sRGB へ変換する
    #include <colorspace_fragment>
  }
`
