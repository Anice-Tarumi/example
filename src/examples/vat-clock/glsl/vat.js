/**
 * 数字から数字へ直接寄せる点群。
 *
 * 焼いてあるのは両端の並びだけ。**経過はここで作る。**
 * 粒ごとに遅れを与え、進む向きと直交する方向へ膨らませると、
 * 直線で滑るのではなく「ほどけて組み直る」動きになる。
 *
 * 止まっている桁も微かに漂わせる。完全に静止すると、粒の集まりではなく
 * 点を打った絵に見える。
 */

export const pointsVertexShader = /* glsl */`
  precision highp float;

  attribute float aPiece;
  attribute float aSlot;

  uniform sampler2D tPos;
  uniform vec2  uTexSize;      // テクスチャの幅と高さ
  uniform float uRowsPerGlyph;  // 字 1 つが使う行数
  uniform float uFrom[8];
  uniform float uTo[8];
  uniform float uMix[8];
  uniform float uSlotX[8];
  uniform float uScale;
  uniform float uSize;
  uniform float uZoom;
  uniform float uTime;
  uniform float uDrift;
  uniform float uArc;
  uniform float uLag;

  varying float vSize;
  varying float vShade;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  vec4 fetchDigit(float digit) {
    // 粒は折り返して詰めてある。列と行に分けて引く
    float col = mod(aPiece, uTexSize.x);
    float row = digit * uRowsPerGlyph + floor(aPiece / uTexSize.x);
    // テクセルの中心を突く。境界を踏むと隣の粒や隣の数字を拾う
    return texture2D(tPos, vec2((col + 0.5) / uTexSize.x, (row + 0.5) / uTexSize.y));
  }

  void main() {
    int slot = int(aSlot + 0.5);

    vec4 a = fetchDigit(uFrom[slot]);
    vec4 b = fetchDigit(uTo[slot]);

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
    pos.xy += perp * side * sin(m * 3.14159265) * uArc;
    pos.z += sin(m * 3.14159265) * uArc * 0.6 * side;

    // 止まっていても微かに漂う
    float ph = hash11(aPiece + 3.1) * 6.2831;
    pos.x += sin(uTime * 0.9 + ph) * uDrift;
    pos.y += cos(uTime * 1.13 + ph * 1.7) * uDrift;
    pos.z += sin(uTime * 0.7 + ph * 2.3) * uDrift * 1.6;

    pos *= uScale;
    pos.x += uSlotX[slot];

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = mix(a.w, b.w, e);
    vSize = size;
    // 奥ほど暗く。平面的な点の集まりに見えないようにする
    vShade = 0.72 + 0.28 * clamp(pos.z * 0.5 + 0.5, 0.0, 1.0);
    // 正射影なので距離では割らない。ズームに比例させる
    gl_PointSize = uSize * size * uZoom * 0.02;
  }
`

export const pointsFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3 uColor;
  varying float vSize;
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
