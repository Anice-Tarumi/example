/**
 * 字から字へ直接寄る点群。
 *
 * 焼いてあるのは両端の並びだけ。**経過はここで作る。**
 *
 * 見せたいのは「宇宙空間の中で進み続ける時計」なので、動きを三つ重ねる。
 *
 *   1. ドメインワープ … 空間そのものをゆっくり歪ませる
 *   2. 渦            … 字の中心まわりに回す
 *   3. 漂い          … 止まっていても消えない揺れ
 *
 * どれも**字が崩れきらない範囲に収める**。派手にすると時刻が読めなくなり、
 * 時計として成立しない。
 */

const COMMON = /* glsl */`
  attribute float aPiece;
  attribute float aSlot;

  uniform sampler2D tPos;
  uniform vec2  uTexSize;
  uniform float uRowsPerGlyph;
  uniform float uFrom[8];
  uniform float uTo[8];
  uniform float uMix[8];
  uniform float uSlotX[8];
  uniform float uScale;
  uniform float uTime;
  uniform float uDrift;
  uniform float uArc;
  uniform float uLag;
  uniform float uWarp;
  uniform float uSwirl;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  vec4 fetchGlyph(float g) {
    // 粒は折り返して詰めてある。列と行に分けて引く
    float col = mod(aPiece, uTexSize.x);
    float row = g * uRowsPerGlyph + floor(aPiece / uTexSize.x);
    // テクセルの中心を突く。境界を踏むと隣の粒や隣の字を拾う
    return texture2D(tPos, vec2((col + 0.5) / uTexSize.x, (row + 0.5) / uTexSize.y));
  }

  /** 空間のゆがみ。位置に応じてずらす。字の形ではなく次元が歪んで見える */
  vec3 warp(vec3 p, float t) {
    float w = uWarp;
    p.x += sin(p.y * 0.55 + t * 0.7) * w;
    p.y += cos(p.x * 0.42 + t * 0.53) * w * 0.8;
    p.z += sin((p.x + p.y) * 0.3 + t * 0.9) * w * 1.6;
    return p;
  }

  struct Sample {
    vec3 pos;    // いまの位置
    float size;
    float m;     // この粒の進み具合
  };

  Sample sampleParticle() {
    int slot = int(aSlot + 0.5);
    vec4 a = fetchGlyph(uFrom[slot]);
    vec4 b = fetchGlyph(uTo[slot]);

    // 粒ごとに遅れる。全部が同時に着くと、字が一枚の板のように入れ替わる
    float lag = hash11(aPiece) * uLag;
    float m = clamp((uMix[slot] - lag) / max(0.001, 1.0 - lag), 0.0, 1.0);
    float e = m * m * (3.0 - 2.0 * m);

    vec3 pos = mix(a.xyz, b.xyz, e);

    /*
     * 進む向きと直交する方向へ膨らませる。
     * 直線で寄せると、粒が平行に滑るだけで「組み直った」感じが出ない。
     */
    vec2 d = b.xy - a.xy;
    vec2 perp = length(d) > 1e-4 ? normalize(vec2(-d.y, d.x)) : vec2(0.0, 1.0);
    float side = hash11(aPiece + 7.7) * 2.0 - 1.0;
    float bulge = sin(m * 3.14159265) * uArc;
    pos.xy += perp * side * bulge;
    pos.z += bulge * 0.6 * side;

    /*
     * 止まっていても漂う。完全な静止は点を打った絵に見える。
     *
     * **速さの違う二段を重ねる。** 一段だと粒が揃って呼吸しているように
     * 見え、群れではなく一枚の膜に見えてしまう。
     */
    float ph = hash11(aPiece + 3.1) * 6.2831;
    vec3 slow = vec3(
      sin(uTime * 0.9 + ph),
      cos(uTime * 1.13 + ph * 1.7),
      sin(uTime * 0.7 + ph * 2.3) * 1.6
    );
    vec3 fast = vec3(
      sin(uTime * 3.7 + ph * 5.1),
      cos(uTime * 4.3 + ph * 3.3),
      sin(uTime * 3.1 + ph * 7.9) * 1.4
    ) * 0.35;
    pos += (slow + fast) * uDrift;

    // 字の中心まわりに微かに回す
    float ang = uSwirl * sin(uTime * 0.35 + ph * 0.4);
    float cs = cos(ang);
    float sn = sin(ang);
    pos.xy = mat2(cs, -sn, sn, cs) * pos.xy;

    pos = warp(pos, uTime);

    Sample s;
    s.pos = pos * uScale;
    s.pos.x += uSlotX[slot];
    s.size = mix(a.w, b.w, e);
    s.m = m;
    return s;
  }
`

export const pointsVertexShader = /* glsl */`
  precision highp float;
  ${COMMON}

  uniform float uSize;
  uniform float uZoom;

  varying float vShade;

  void main() {
    Sample s = sampleParticle();
    vec4 mv = modelViewMatrix * vec4(s.pos, 1.0);
    gl_Position = projectionMatrix * mv;
    // 奥ほど暗く。平面的な点の集まりに見えないようにする
    vShade = 0.7 + 0.3 * clamp(s.pos.z * 0.5 + 0.5, 0.0, 1.0);
    // 正射影なので距離では割らない。ズームに比例させる
    gl_PointSize = uSize * s.size * uZoom * 0.02;
  }
`

export const pointsFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3 uColor;
  varying float vShade;

  void main() {
    // 丸い点にする。四角いままだと砂ではなくモザイクに見える
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    // 芯のまわりに淡い暈。硬い円だけだと砂を撒いた絵で、光に見えない
    float core = smoothstep(0.09, 0.02, d);
    float halo = smoothstep(0.25, 0.0, d) * 0.45;
    gl_FragColor = vec4(uColor * vShade, core + halo);
    #include <colorspace_fragment>
  }
`
