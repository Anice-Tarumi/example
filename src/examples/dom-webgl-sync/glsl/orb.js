/**
 * カードからカードへ渡り歩く印。
 *
 * これが**キャンバス 1 枚である証拠**になる。カードごとにキャンバスを置いて
 * いたら、自分の矩形の外には 1px も描けない。カードとカードの隙間を横切る
 * この動きは、板が同じ 1 枚の中にいるからできる。
 *
 * 頭と尾を 1 つのインスタンスメッシュで描く。`instanceColor` に濃さと
 * 「頭かどうか」を積んで渡す。
 */

export const orbVertexShader = /* glsl */`
  precision highp float;

  /*
   * instanceColor は宣言しない。**three が勝手に宣言する。**
   * setColorAt を呼んだメッシュには USE_INSTANCING_COLOR が立ち、
   * 前置きに attribute が入る。自分でも書くと二重宣言で落ちる。
   * ここでは r に濃さ、g に「頭かどうか」を積んでいる。
   */

  varying vec2 vUv;
  varying float vAlpha;
  varying float vHead;

  void main() {
    vUv = uv;
    vAlpha = instanceColor.r;
    vHead = instanceColor.g;

    /*
     * **instanceMatrix は自分で掛ける。** 自前の頂点シェーダーでは
     * three が入れてくれない。忘れると全インスタンスが原点に重なる。
     */
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`

export const orbFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3  uColor;
  uniform float uTime;
  uniform float uGlow;

  varying vec2 vUv;
  varying float vAlpha;
  varying float vHead;

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;

    /*
     * 芯は控えめにする。**下の文字は DOM なので、印は文字の裏にいる。**
     * 芯を強くすると裏から白飛びして文字が読めなくなる。
     */
    float core = smoothstep(0.42, 0.0, r) * 0.55;
    float halo = smoothstep(1.0, 0.15, r) * 0.28;

    /*
     * 頭にだけ輪と目盛りを足す。尾と同じ絵だと、どちらへ進んでいるか
     * 読めない。
     */
    float ring = smoothstep(0.05, 0.0, abs(r - 0.72)) * vHead * 1.3;
    float a = atan(p.y, p.x) + uTime * 1.6;
    float ticks = step(0.72, fract(a / 1.5708)) * smoothstep(0.09, 0.0, abs(r - 0.9)) * vHead;

    float m = (core * 0.9 + halo + ring * 0.8 + ticks * 0.7) * vAlpha;
    gl_FragColor = vec4(uColor * m * uGlow, m);
    #include <colorspace_fragment>
  }
`
