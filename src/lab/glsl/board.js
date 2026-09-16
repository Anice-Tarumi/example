/**
 * 空間に浮く板。
 *
 * 角丸も縁の光も**式で出す**。テクスチャの角を透明にして済ませると、
 * 縁の分散が作れないうえ、板の大きさを変えるたびに角の丸みが伸びる。
 *
 * 分散（虹色）は**縁だけ**に限る。面全体に掛けると玩具に見える。幅は
 * 数ピクセル相当で足りる。
 */

export const boardVertexShader = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHover;
  uniform float uFocus;

  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  void main() {
    vUv = uv;

    vec3 p = position;
    /*
     * ゆっくり反る。**平らなままだと板ではなく写真に見える。**
     * 手前へ膨らませると縁の光が動いて、面に厚みがあるように読める。
     */
    float bend = sin(uv.x * 3.14159 + uTime * 0.25 + uSeed * 6.2831) * 0.012
               + cos(uv.y * 3.14159 - uTime * 0.19 + uSeed * 3.7) * 0.008;
    p.z += bend * (1.0 + uHover);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = mv.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`

export const boardFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tMap;
  uniform sampler2D tNext;
  uniform float uBlend;      // 差し替え中の混ぜ具合
  uniform float uHasMap;
  uniform vec2  uSize;       // 板の実寸（世界単位）
  uniform float uRadius;     // 角の丸み
  uniform float uRim;        // 縁の強さ
  uniform float uHover;
  uniform float uFocus;      // 正面にいるほど 1
  uniform vec3  uTint;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  /** 角丸矩形の符号付き距離。内側が負 */
  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float sd = roundedBox(p, uSize * 0.5, uRadius);

    // 縁の外は描かない。幅は画素の大きさから決めるので、寄っても滲まない
    float aa = fwidth(sd) * 1.2;
    float inside = 1.0 - smoothstep(-aa, aa, sd);
    if (inside <= 0.001) discard;

    /*
     * 縁の分散。
     *
     * **チャンネルごとに引く位置をずらす**だけ。ずらす量は縁からの距離で
     * 決め、内側では 0 にする。面全体でずらすと色収差の掛かった写真になる。
     */
    /*
     * 縁の帯。**細くする。** 角の丸みを基準にすると、板が大きいほど帯も
     * 太くなって面全体が色づく。世界単位で固定の幅にする。
     */
    float edge = exp(sd / 0.022);   // 縁で 1、内側へ急に 0
    float shift = edge * 0.006 * (0.6 + uHover * 0.8);

    vec3 col;
    if (uHasMap > 0.5) {
      vec2 dir = normalize(p + 1e-5);
      vec3 a = vec3(
        texture2D(tMap, vUv + dir * shift).r,
        texture2D(tMap, vUv).g,
        texture2D(tMap, vUv - dir * shift).b
      );
      vec3 b = vec3(
        texture2D(tNext, vUv + dir * shift).r,
        texture2D(tNext, vUv).g,
        texture2D(tNext, vUv - dir * shift).b
      );
      col = mix(a, b, uBlend);
    } else {
      // 絵が無い板。斜めの緩い勾配だけ置く。真っ黒だと穴に見える
      float g = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 2.2 + uTime * 0.1);
      col = uTint * (0.10 + g * 0.06);
    }

    /*
     * 縁の光。視線に寝た面ほど強いフレネルと、縁からの距離を掛ける。
     * **虹は縁だけ。** 幅を広げると一気に安っぽくなる。
     */
    vec3 n = normalize(vViewNormal);
    vec3 v = normalize(-vViewPos);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    float rimBand = edge * (0.5 + fres * 0.7);
    vec3 rimCol = vec3(
      0.5 + 0.5 * sin(6.2831 * (vUv.x * 0.6 + uTime * 0.05)),
      0.5 + 0.5 * sin(6.2831 * (vUv.y * 0.6 + uTime * 0.05 + 0.33)),
      0.5 + 0.5 * sin(6.2831 * (vUv.x * 0.4 - uTime * 0.05 + 0.66))
    );
    col += rimCol * rimBand * uRim * (0.35 + uHover * 0.9);

    // 手前にいない板は沈める。並んだとき、どれを見ているかが分かる
    col *= mix(0.45, 1.0, uFocus);
    col += uTint * 0.05 * uHover;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
