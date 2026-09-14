/**
 * 水面の高さ場。
 *
 * 波は**解析式で置く**。この例で見せたいのは焦線のほうなので、面の計算に
 * 予算を使わない。式で持てば法線が微分で正確に出るし、光子側と表示側で
 * まったく同じ面を参照できる。**同じ面を見ていないと、焦線と水面の皺が
 * ずれて別物に見える。**
 *
 * 波は 3 種を重ねる。
 *
 *   1. うねり … 大きく緩い。方向のそろった進行波
 *   2. さざ波 … 細かく速い。方向を散らす
 *   3. 波紋   … 触れた点から広がる。時間で減衰する
 */

export const WAVES = /* glsl */`
  uniform float uTime;
  uniform float uSwell;      // うねりの高さ
  uniform float uRipple;     // さざ波の高さ
  uniform float uSwellScale;
  uniform float uRippleScale;
  uniform float uSpeed;

  /** 触れて生まれた波紋。xy = 位置 / z = 生まれた時刻 / w = 強さ */
  uniform vec4 uDrops[8];
  uniform float uDropSpeed;
  uniform float uDropDecay;

  /*
   * 方向の違う進行波を足す。1 方向だけだと洗濯板になり、水に見えない。
   * 波長と速さは方向ごとに変える。分散関係（深水波は λ が長いほど速い）を
   * 真似ておくと、重なりが規則的に戻らない。
   */
  vec3 directional(vec2 p, float t, float scale, int count) {
    float h = 0.0;
    vec2 g = vec2(0.0);
    float amp = 1.0;
    float norm = 0.0;
    for (int i = 0; i < 6; i++) {
      if (i >= count) break;
      float fi = float(i);
      float a = fi * 2.399963 + 0.7;            // 黄金角。方向が揃わない
      vec2 dir = vec2(cos(a), sin(a));
      float k = scale * (1.0 + fi * 0.45);
      float speed = sqrt(9.8 / max(0.001, k));  // 深水波の位相速度
      float ph = dot(dir, p) * k + t * speed * uSpeed;
      h += sin(ph) * amp;
      // 傾きは微分で出す。sin の微分は cos なので、位相を使い回せる
      g += dir * (k * cos(ph) * amp);
      norm += amp;
      amp *= 0.62;
    }
    return vec3(h, g) / max(0.0001, norm);
  }

  /** 波紋 1 つ。輪が広がりながら痩せる。戻り値は (高さ, 傾き) */
  vec3 dropWave(vec4 d, vec2 p, float t) {
    if (d.w <= 0.0) return vec3(0.0);
    float age = t - d.z;
    if (age < 0.0) return vec3(0.0);
    vec2 rel = p - d.xy;
    float r = max(1e-4, length(rel));
    float front = age * uDropSpeed;
    float x = r - front;
    // 波面の近くだけ。遠くまで残すと池全体が脈打つ
    float band = exp(-pow(x * 1.6, 2.0));
    // 時間で減衰し、広がるほど薄まる
    float fade = exp(-age * uDropDecay) / (1.0 + r * 0.6);
    float h = sin(x * 9.0) * band * fade * d.w;
    // r で微分してから、r の勾配（動径方向の単位ベクトル）に載せる
    float dh = (9.0 * cos(x * 9.0) * band + sin(x * 9.0) * band * (-2.0 * x * 2.56)) * fade * d.w;
    return vec3(h, (rel / r) * dh);
  }

  /**
   * 高さと傾きを**一度に**返す。
   *
   * 法線を差分で取ると、1 画素あたり波の式を 6 回評価することになる。
   * 波は sin の和なので**微分が閉じた形で書ける**。位相を使い回せば、
   * 高さと傾きが 1 回の評価で揃う。実測でこの例のフレーム時間が 6 分の 1
   * 近くまで落ちた。
   *
   * 戻り値は (高さ, ∂h/∂x, ∂h/∂z)。
   */
  vec3 waveField(vec2 p) {
    vec3 a = directional(p, uTime, uSwellScale, 3) * uSwell;
    // 座標を 1.9 倍しているので、傾きも連鎖律で 1.9 倍になる
    vec3 b = directional(p * 1.9 + 31.4, uTime * 1.7, uRippleScale, 4) * uRipple;
    b.yz *= 1.9;
    vec3 f = a + b;
    for (int i = 0; i < 8; i++) f += dropWave(uDrops[i], p, uTime);
    return f;
  }

  float waveHeight(vec2 p) {
    return waveField(p).x;
  }

  /** 傾きから法線を組む。y 成分は 1（高さ場なので） */
  vec3 waveNormal(vec2 p) {
    vec3 f = waveField(p);
    return normalize(vec3(-f.y, 1.0, -f.z));
  }
`
