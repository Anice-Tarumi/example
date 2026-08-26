/**
 * 下地の模様。
 *
 * 元サイト（buttermax）は 8x8 スプライトシートの写真を下地に持ち、その UV を
 * 量子化することでモザイク化していた。ここでは外部アセットを持たない代わりに
 * 手続き模様を敷く。単色グラデーションだと UV を量子化しても色が変化せず、
 * モザイク化が視覚的に成立しない。
 */
export const patternGLSL = /* glsl */`
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec2 hash22(vec2 p) {
    vec3 a = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    a += dot(a, a.yzx + 33.33);
    return fract((a.xx + a.yz) * a.zy);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * valueNoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  /** F2 - F1 でセルの境界を出す voronoi */
  float voronoiEdge(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash22(n + g);
        float d = length(g + o - f);
        if (d < f1) { f2 = f1; f1 = d; }
        else if (d < f2) { f2 = d; }
      }
    }
    return f2 - f1;
  }

  /**
   * uPattern:
   *   0 = fbm ノイズ（写真に近い情報量）
   *   1 = 細かいグリッド
   *   2 = voronoi セル
   *   3 = 斜めストライプ
   * 戻り値は 0..1 の輝度。実際の色は呼び出し側で base/accent を補間する。
   */
  float patternLuma(vec2 uv, int mode, float scale) {
    vec2 p = uv * scale;

    if (mode == 1) {
      vec2 g = abs(fract(p) - 0.5);
      float line = 1.0 - smoothstep(0.4, 0.5, max(g.x, g.y));
      // グリッドだけだと平坦なのでセルごとに明度差を付ける
      return line * (0.45 + hash21(floor(p)) * 0.55);
    }

    if (mode == 2) {
      float e = voronoiEdge(p);
      return smoothstep(0.0, 0.35, e) * 0.75 + hash21(floor(p)) * 0.25;
    }

    if (mode == 3) {
      float s = sin((p.x + p.y) * 3.14159265);
      return smoothstep(-0.2, 0.2, s) * 0.8 + fbm(p * 0.5) * 0.2;
    }

    return fbm(p);
  }
`
