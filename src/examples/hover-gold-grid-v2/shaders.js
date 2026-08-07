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
  uniform float uPixellation;
  uniform float uUvMixMultiplier;
  uniform vec3  uPulseColor;
  uniform float uPulseIntensity;
  uniform vec3  uBaseColor;

  varying vec2 vUv;
  varying vec3 vPos;

  void main() {
    vec2 uv = vUv;

    // ヒット点からの距離でリング波を作る
    float pulse = 0.0;
    if (uInside > 0.001) {
      float gradient = length(vPos - uHitPos) * 0.35;
      pulse = sin(gradient * uPulseFrequency - uTime + 3.8) * 0.5 + 0.5;
      pulse = pow(pulse, uPulseSharpness);
    }
    pulse *= uInside;

    // 波の山だけ UV をモザイク化
    float uvMix = clamp(pulse * uUvMixMultiplier, 0.0, 1.0);
    uv = mix(uv, floor(uv * uPixellation) / uPixellation, uvMix);

    // uniform の色は three の color management で既にリニア。
    // ここでは手動ガンマを掛けず、出力時に colorspace_fragment で sRGB へ変換する。
    vec3 color = mix(uBaseColor, uBaseColor * 0.5, uv.y);

    color += uPulseColor * pulse * uPulseIntensity;
    color *= mix(1.0, 2.0, pow(pulse, 4.0));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
