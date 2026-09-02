/**
 * 字から字へ直接寄る点群と、それに纏わる光の筋。
 *
 * 焼いてあるのは両端の並びだけ。**経過はここで作る。**
 *
 * 見せたいのは「少し歪んだ次元の中で進み続ける時計」なので、
 * 三つを重ねる。
 *
 *   1. ドメインワープ … 空間そのものをゆっくり歪ませる
 *   2. 渦            … 字の中心まわりに微かに回す
 *   3. 光の筋        … 粒の進む向きへ尾を引かせる
 *
 * どれも**振れ幅を小さく保つ**。派手にすると時刻が読めなくなり、
 * 時計として成立しない。
 */

/** 位置の計算。点と筋で同じものを使う。ずれると尾が身体から外れる */
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
    vec3 vel;    // 進む向き（長さは速さ）
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

    // 止まっていても漂う。完全な静止は点を打った絵に見える
    float ph = hash11(aPiece + 3.1) * 6.2831;
    vec3 drift = vec3(
      sin(uTime * 0.9 + ph),
      cos(uTime * 1.13 + ph * 1.7),
      sin(uTime * 0.7 + ph * 2.3) * 1.6
    ) * uDrift;
    pos += drift;

    // 字の中心まわりに微かに回す
    float ang = uSwirl * sin(uTime * 0.35 + ph * 0.4);
    float cs = cos(ang);
    float sn = sin(ang);
    pos.xy = mat2(cs, -sn, sn, cs) * pos.xy;

    pos = warp(pos, uTime);

    /*
     * 速さは差分から出す。時間で微分せずに、
     * 「寄せの勢い（6m(1-m)）」と漂いの速さを足して近似する。
     */
    vec3 vel = (b.xyz - a.xyz) * (6.0 * m * (1.0 - m)) * 0.16;
    vel += vec3(cos(uTime * 0.9 + ph), -sin(uTime * 1.13 + ph * 1.7), 0.0) * uDrift * 1.2;

    Sample s;
    s.pos = pos * uScale;
    s.pos.x += uSlotX[slot];
    s.vel = vel * uScale;
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
    float edge = smoothstep(0.25, 0.16, d);
    gl_FragColor = vec4(uColor * vShade, edge);
    #include <colorspace_fragment>
  }
`

/**
 * 光の筋。
 *
 * 粒 1 つにつき線分 1 本。**根元は粒の位置、先は進んできた向きへ後ろ**。
 * 尾なので前ではなく後ろへ伸ばす。前へ伸ばすと粒が線の途中に埋まって、
 * 何が本体か分からなくなる。
 */
export const streakVertexShader = /* glsl */`
  precision highp float;
  ${COMMON}

  attribute float aEnd;   // 0 = 根元 / 1 = 先

  uniform float uStreak;

  varying float vFade;

  void main() {
    Sample s = sampleParticle();

    float speed = length(s.vel);
    // 遅いときは出さない。常時光っていると砂が光る絵になる
    float len = uStreak * speed;
    vec3 dir = speed > 1e-5 ? s.vel / speed : vec3(0.0);

    vec3 p = s.pos - dir * len * aEnd;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);

    // 先へ行くほど消える。根元だけ明るいと粒と地続きに見える
    vFade = (1.0 - aEnd) * clamp(speed * 6.0, 0.0, 1.0);
  }
`

export const streakFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3 uColor;
  uniform float uStreakGain;
  varying float vFade;

  void main() {
    gl_FragColor = vec4(uColor * uStreakGain, vFade * uStreakGain);
    #include <colorspace_fragment>
  }
`
