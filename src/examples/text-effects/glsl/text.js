/**
 * SDF テキストの描画。
 *
 * 距離場は「輪郭からどれだけ離れているか」しか持たない。
 * そこから輪郭を出すには、**その画素で距離が何だけ変化するか**が要る。
 * `fwidth(d)` がそれで、これを閾値の幅に使うと、
 * どれだけ拡大しても縁が同じ太さで滑らかに出る。ビットマップにはできない芸当。
 *
 * 縁取り・グロー・塗りは、同じ距離場を違う閾値で切るだけで作れる。
 */

export const textVertexShader = /* glsl */ `
  attribute float aIndex;
  attribute vec2  aCenter;

  uniform float uTime;
  uniform float uCount;
  uniform float uMode;      // 0: なし 1: リビール 2: 波 3: グリッチ
  uniform float uProgress;
  uniform float uWave;
  uniform float uWaveSpeed;
  uniform float uJitter;
  uniform vec2  uCursor;

  varying vec2  vUv;
  varying float vGlyph;
  varying float vReveal;

  float hash(float n) {
    return fract(sin(n * 127.1) * 43758.5453);
  }

  void main() {
    vec3 p = position;
    float t = aIndex / max(uCount - 1.0, 1.0);
    float reveal = 1.0;

    if (uMode < 0.5) {
      // そのまま
    } else if (uMode < 1.5) {
      // 文字ごとに時間差で立ち上げる
      float local = clamp((uProgress - t * 0.55) / 0.45, 0.0, 1.0);
      reveal = local;
      float e = 1.0 - pow(1.0 - local, 3.0);
      p.y += (1.0 - e) * 0.9;
      p.z += (1.0 - e) * -1.4;
      p.xy = mix(aCenter + (p.xy - aCenter) * 0.4, p.xy, e);
    } else if (uMode < 2.5) {
      // 波。文字の中心を基準に上下させる
      float ph = uTime * uWaveSpeed - aCenter.x * 1.4;
      p.y += sin(ph) * uWave;
      p.z += cos(ph * 0.8) * uWave * 0.6;
    } else {
      // グリッチ。文字単位でランダムに横へ飛ばす
      float seed = hash(aIndex + floor(uTime * 12.0));
      float on = step(0.72, seed);
      p.x += (hash(seed * 91.0) - 0.5) * uJitter * on;
      p.y += (hash(seed * 37.0) - 0.5) * uJitter * 0.4 * on;
    }

    // カーソルに近い文字だけ持ち上げる
    float d = distance(aCenter.x, uCursor.x * 2.4);
    p.z += exp(-d * d * 1.8) * 0.5;

    vUv = uv;
    vGlyph = t;
    vReveal = reveal;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

export const textFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uAtlas;
  uniform vec3  uFill;
  uniform vec3  uOutline;
  uniform vec3  uGlow;
  uniform float uWeight;      // 太らせ／痩せさせ
  uniform float uOutlineWidth;
  uniform float uGlowWidth;
  uniform float uGlowStrength;
  uniform float uSoft;

  varying vec2  vUv;
  varying float vGlyph;
  varying float vReveal;

  void main() {
    float d = texture2D(uAtlas, vUv).r;

    // 画素あたりの距離の変化量。これを閾値の幅にすると拡大しても縁が保つ
    float px = fwidth(d) * uSoft;
    float edge = 0.5 - uWeight * 0.1;

    float fill = smoothstep(edge - px, edge + px, d);
    float outer = edge - uOutlineWidth * 0.1;
    float outline = smoothstep(outer - px, outer + px, d) - fill;

    float glowEdge = edge - uGlowWidth * 0.1;
    float glow = smoothstep(glowEdge - px * 6.0, edge, d) * uGlowStrength;

    vec3 color = uFill * fill + uOutline * outline + uGlow * glow * (1.0 - fill);
    float alpha = max(fill + outline, glow);

    alpha *= vReveal;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`
