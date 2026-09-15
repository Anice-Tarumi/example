/**
 * 光芒（god rays）を 2 通りで出す。
 *
 * **スクリーンスペース式**
 *   1. 遮る物だけを黒で塗った**遮蔽マスク**を作る（空が 1、遮が 0）
 *   2. 太陽は**シェーダー内の円**として置く。メッシュを下絵に混ぜない
 *   3. マスク × 太陽の円を、太陽の画面位置から放射状にぼかす
 *   4. 元の絵へ加算する
 *
 *   太陽をメッシュのまま下絵へ入れると、上書き用の黒い材質や背景の塗り直しと
 *   絡んで「どこで消えたのか分からない」不具合になりやすい。**円は式で置く。**
 *   遮蔽が自動で効く。ただし太陽が画面外へ出ると、ぼかす原点が無くなって
 *   光芒ごと消える。
 *
 * **板ポリ式**
 *   太陽から伸びる板をカメラへ向けて並べ、加算で描く。画面外でも成立し、
 *   後処理が要らない。ただし**遮蔽を知らない**ので、手前に柱があっても光が
 *   透ける。
 *
 * どちらが正しいということはなく、条件で使い分ける。並べて見せる。
 */

export const quadVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * 放射ブラー。Mitchell の古典的な定式。
 *
 *   密度 … 1 歩の長さ。大きいほど光芒が長い
 *   減衰 … 1 歩ごとに暗くする割合。裾の切れ方
 *   重み … 1 サンプルの寄与
 *   露光 … 最後の倍率
 *
 * **歩幅を画素数で決めない。** uv で決めると、解像度が変わっても同じ絵になる。
 */
export function radialBlurShader(samples) {
  return /* glsl */`
    precision highp float;

    uniform sampler2D tMask;   // 遮蔽マスク。空が 1、遮る物が 0
    uniform vec2  uSun;        // 太陽の画面位置（uv）
    uniform float uSunRadius;  // 太陽の見かけの半径（uv）
    uniform float uAspect;
    uniform float uDensity;
    uniform float uDecay;
    uniform float uWeight;
    uniform float uExposure;

    varying vec2 vUv;

    /**
     * 太陽の円。縦方向の uv を基準に、横は縦横比で補正する。
     *
     * **smoothstep の境界を逆順に書かない。** smoothstep(大, 小, x) は
     * 仕様上は未定義で、実装によっては常に 1 を返す。そうなると円が画面
     * 全体に広がり、遮られていない所がすべて光る（右半分が白く飛ぶ）。
     * 正順で書いて 1 から引く。
     */
    float sunDisc(vec2 uv) {
      vec2 d = (uv - uSun) * vec2(uAspect, 1.0);
      return 1.0 - smoothstep(uSunRadius * 0.5, uSunRadius, length(d));
    }

    void main() {
      vec2 uv = vUv;
      vec2 delta = (uv - uSun) * (uDensity / float(${samples}));
      float illum = 1.0;
      float acc = 0.0;

      /*
       * 太陽へ向かって少しずつ戻りながら足す。**足すたびに暗くする**ので、
       * 遠いサンプルほど効かない。これが裾の減衰になる。
       */
      for (int i = 0; i < ${samples}; i++) {
        uv -= delta;
        /*
         * **範囲の外は 0 として数える。** そのまま引くと端の画素が
         * 引き伸ばされ、画面の端から光が湧いたような帯ができる。
         */
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        // 遮られていない場所にある太陽の光だけを数える
        acc += texture2D(tMask, uv).r * sunDisc(uv) * illum * uWeight * inside;
        illum *= uDecay;
      }

      gl_FragColor = vec4(vec3(acc * uExposure), 1.0);
    }
  `
}

/** 元の絵へ加算する。色は光芒側で付ける */
export const compositeFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tScene;
  uniform sampler2D tRays;
  uniform vec3  uColor;
  uniform float uGain;

  varying vec2 vUv;

  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    float rays = texture2D(tRays, vUv).r;
    gl_FragColor = vec4(scene + uColor * rays * uGain, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * 板ポリ式の光条。
 *
 * 太陽を中心に放射状の板を並べ、根元を明るく先を薄くする。
 * **板の縁が見えないよう、横方向も必ず落とす。** 落とさないと短冊が並んで
 * 見える。
 */
export const shaftVertexShader = /* glsl */`
  precision highp float;

  attribute float aSeed;

  uniform float uTime;
  uniform float uLength;
  uniform float uSpin;

  varying vec2 vUv;
  varying float vSeed;

  void main() {
    vUv = uv;
    vSeed = aSeed;

    vec3 p = position;
    // uv.y が根元→先。先へ行くほど長く、少し広がる
    p.y *= uLength * (0.6 + fract(aSeed * 7.3) * 0.8);
    p.x *= 1.0 + uv.y * 1.6;

    // 束ごとにゆっくり回す。止めると作り物に見える
    float a = aSeed * 6.2831 + uTime * uSpin * (fract(aSeed * 3.1) - 0.5);
    float c = cos(a);
    float s = sin(a);
    p.xy = mat2(c, -s, s, c) * p.xy;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

export const shaftFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3  uColor;
  uniform float uGain;
  uniform float uTime;

  varying vec2 vUv;
  varying float vSeed;

  void main() {
    // 先へ行くほど薄く
    float along = pow(1.0 - vUv.y, 1.8);
    // 横は中心だけ。縁を落とさないと短冊に見える
    float across = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 2.2);
    // 束ごとに明滅させる。揃うと回転する車輪に見える
    float flick = 0.7 + 0.3 * sin(uTime * (0.6 + fract(vSeed * 5.7)) + vSeed * 12.0);
    gl_FragColor = vec4(uColor * along * across * flick * uGain, 1.0);
    #include <colorspace_fragment>
  }
`
