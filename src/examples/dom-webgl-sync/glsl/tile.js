/**
 * DOM の矩形に重ねる板。
 *
 * 板は 1×1 の平面を矩形の寸法へ拡大して置く。頂点シェーダーで形を変えるので、
 * **拡大前の座標（-0.5〜0.5）ではなく実寸で曲げる**必要がある。比率を渡して
 * 掛け戻す。渡さないと、横長の板だけ曲がりが潰れる。
 */

export const tileVertexShader = /* glsl */`
  precision highp float;

  uniform vec2  uSize;      // 板の実寸（px）
  uniform float uScrollV;   // 直近のスクロール速度（px/秒）
  uniform float uBend;
  uniform float uHover;
  uniform float uTime;

  varying vec2 vUv;
  varying float vBend;

  void main() {
    vUv = uv;

    vec3 p = position;
    p.xy *= uSize;

    /*
     * スクロールで撓む。
     *
     * 速度をそのまま角度にすると、勢いよく回したときに板が裏返る。
     * **飽和させる。** v/(1+|v|/cap) なら、いくら速くしても cap を越えない。
     */
    float v = uScrollV * 0.02;
    v = v / (1.0 + abs(v) / 60.0);

    // 中央ほど遅れる。端が先に動くと紙ではなく板の回転に見える
    float sag = sin(vUv.x * 3.14159265) * v * uBend;
    p.y -= sag;
    // 撓んだぶん奥へ逃がす。平面のままだと伸び縮みして見える
    p.z -= abs(sag) * 0.35;

    // 触れている間だけわずかに手前へ。影も拡大も使わずに浮きを出す
    p.z += uHover * 18.0;
    p.xy *= 1.0 + uHover * 0.02;

    vBend = sag / max(1.0, uSize.y);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

export const tileFragmentShader = /* glsl */`
  precision highp float;

  uniform vec2  uSize;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uSeed;
  uniform float uTime;
  uniform float uHover;
  uniform float uEnter;    // 画面に入ってからの進み具合
  uniform float uRadius;   // 角の丸み（px）

  varying vec2 vUv;
  varying float vBend;

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += vnoise(p) * a;
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return v;
  }

  /** 角丸の矩形。px で測るので、板の縦横比が変わっても丸みは変わらない */
  float roundedBox(vec2 uv, vec2 size, float r) {
    vec2 q = abs(uv - 0.5) * size - (size * 0.5 - r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    // 絵は手続きで作る。素材を持たないので、寸法が変わっても破綻しない
    vec2 p = vUv * vec2(uSize.x / uSize.y, 1.0) * 2.2 + uSeed * 13.0;
    float n = fbm(p + vec2(uTime * 0.03, 0.0));
    float band = fbm(p * 0.6 - n * 0.8);

    vec3 col = mix(uColorA, uColorB, smoothstep(0.25, 0.75, band));
    col += (n - 0.5) * 0.18;
    // 撓んだ側に光が寄る。曲がりが形だけだと紙に見えない
    col += vBend * 1.2 * vec3(0.6, 0.7, 1.0);

    // 触れている所から広がる輪
    float d = distance(vUv, vec2(0.5));
    col += uHover * smoothstep(0.05, 0.0, abs(d - fract(uTime * 0.35) * 0.7)) * 0.25;

    /*
     * 出現は**下から拭う**。透明度だけで出すと、板が半透明のまま重なって
     * 何枚あるのか分からない。
     */
    float wipe = smoothstep(vUv.y - 0.35, vUv.y, uEnter * 1.35);

    // 角を丸める。DOM 側の border-radius と合わせないと縁がはみ出す
    float sd = roundedBox(vUv, uSize, uRadius);
    float mask = smoothstep(1.0, -1.0, sd) * wipe;
    if (mask <= 0.001) discard;

    gl_FragColor = vec4(col, mask);
    #include <colorspace_fragment>
  }
`
