/**
 * サブ画像のアトラスを焼く。
 *
 * レンチキュラーの肝は「**印刷された絵は動かない**」こと。動くのは
 * どのストリップが見えるかだけ。だから絵は先に N 枚焼いて固定する。
 * 毎フレーム角度に応じて描き直すと、それはただの視差エフェクトで、
 * レンチキュラー特有の飛び（コマ落ち）とゴーストが出ない。
 *
 * 絵はレイヤー分けした 1 枚のイラスト。**別々に生成した 2 枚を切り替え
 * ない。** 生成物は毎回構図が変わるので、切り替えたときに画が飛ぶ。
 * 同じ絵を層で分けて、層ごとに違う速さでずらせば、構図ズレは原理的に
 * 起きない。
 *
 *   A 背景（光条と塵）      … いちばん大きく動く
 *   B クラゲ                … 中くらい
 *   C チョウチンアンコウ    … ほとんど動かない（主役）
 *   D 海藻と岩（手前）      … 逆向きに動く
 *
 * 手前を**逆に**動かすのが効く。全部が同じ向きだと、絵が丸ごと平行移動
 * しているだけに見える。
 *
 * 角度で変わるのは視差だけではない。**光の状態**も一緒に振る。
 * 片端は光条が差してクラゲが強く光る「明」、反対の端は光が落ちて
 * アンコウの提灯だけが残る「暗」。同じ絵の中で意味が繋がるので、
 * 無関係な隠し絵を出すより効く。
 */

export const viewsVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const viewsFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tA;   // 背景
  uniform sampler2D tB;   // クラゲ
  uniform sampler2D tC;   // アンコウ
  uniform sampler2D tD;   // 海藻

  uniform vec2  uGrid;        // アトラスの並び（列, 行）
  uniform float uViews;       // 総枚数
  uniform float uMaxAngle;    // 端の視線角（ラジアン）
  uniform float uParallax;    // 視差の強さ
  uniform float uLightSwing;  // 明暗の振れ幅

  varying vec2 vUv;

  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  /**
   * 層を 1 枚引く。
   *
   * **少し内側へ寄せてから引く。** ずらすと端が画の外を指すので、
   * 縁が伸びた帯になる。あらかじめ寄せておけば、ずらしても中に収まる。
   */
  vec4 layer(sampler2D map, vec2 uv, float shift, float scale, vec2 offset, float soft) {
    vec2 st = (uv - 0.5 - offset) / scale + 0.5;
    st.x += shift / scale;
    // 外は描かない。端の色が帯になって伸びるのを防ぐ
    if (st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0) return vec4(0.0);
    /*
     * **細かい層はぼかして引く。** レンズで横解像度が落ちるので、
     * 触手のような細い線はそのまま階段状に割れる。
     * ミップを 1 段落として引くと段が目立たなくなる。
     */
    return texture2D(map, st, soft);
  }

  /** 背景だけは全面を埋める。少し内側へ寄せてからずらす */
  vec4 layerBg(sampler2D map, vec2 uv, float shift) {
    vec2 st = (uv - 0.5) * 0.88 + 0.5;
    st.x += shift;
    return texture2D(map, clamp(st, 0.0, 1.0));
  }

  /** 上に重ねる */
  vec3 over(vec3 base, vec4 src) {
    return mix(base, src.rgb, clamp(src.a, 0.0, 1.0));
  }

  void main() {
    // どのコマか
    vec2 cell = floor(vUv * uGrid);
    float index = cell.y * uGrid.x + cell.x;
    vec2 uv = fract(vUv * uGrid);

    /*
     * 視線角。**両端で対称**にする。片側だけ深くすると、傾けたとき
     * 手応えが左右で変わって気持ち悪い。
     */
    float t = uViews > 1.0 ? (index / (uViews - 1.0)) * 2.0 - 1.0 : 0.0;
    float shift = tan(t * uMaxAngle) * uParallax;

    /*
     * --- 奥から重ねる ---
     *
     * **層ごとに大きさと位置を決める。** 生成された絵はどれも画面いっぱいに
     * 描かれているので、そのまま重ねると巨大なクラゲと巨大な魚が重なった
     * だけの絵になる（実際そうなった）。構図はここで作る。
     */
    vec3 col = layerBg(tA, uv, shift * 1.00).rgb;

    /*
     * クラゲ。**小さく、暗く、ぼかす。** 大きく明るいまま置いたら、
     * 主役のアンコウを完全に潰した。脇役は脇役の明るさにする。
     */
    vec4 jelly = layer(tB, uv, shift * 0.55, 0.44, vec2(-0.14, 0.21), 1.4);
    jelly.rgb *= 0.55;
    jelly.a *= 0.85;
    col = over(col, jelly);

    /*
     * 主役。中央よりやや下。**ほとんど動かさない。**
     * 元絵が暗い紺なので、少し持ち上げないと背景に沈む。
     */
    vec4 fish = layer(tC, uv, shift * 0.15, 0.74, vec2(-0.05, -0.11), 0.4);
    fish.rgb *= 1.55;
    col = over(col, fish);

    // 手前は逆向き。これで前後が強く出る
    col = over(col, layer(tD, uv, shift * -0.30, 1.06, vec2(0.0, -0.05), 0.0));

    /*
     * 光の状態。**t が +1 で明、-1 で暗。**
     * 明: 上からの光条が強く、クラゲがよく光る
     * 暗: 全体が沈み、提灯の暖色だけが残る
     */
    float light = clamp(t * 0.5 + 0.5, 0.0, 1.0);
    float swing = uLightSwing;

    // 上ほど落とす。光が消えるのは上から
    float fromTop = smoothstep(1.0, 0.15, uv.y);
    col *= mix(1.0 - 0.72 * swing * fromTop, 1.0 + 0.16 * swing * fromTop, light);

    /*
     * 暗いときは色も抜く。**暗くするだけだと「暗い同じ絵」**で、
     * 状態が変わったように見えない。青を残して彩度を落とす。
     */
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(mix(vec3(lum) * vec3(0.72, 0.84, 1.0), col, 0.35), col, light);

    /*
     * 提灯だけは暗くしない。暖色の明るい所を拾って残す。
     * **1 点でも光が残っていると、暗い側が「夜」に見える。**
     */
    float lure = smoothstep(0.30, 0.70, col.r - col.b * 0.6);
    col += vec3(1.0, 0.72, 0.30) * lure * (1.0 - light) * swing * 1.2;

    // 印刷の粒。綺麗すぎると画面に見える
    col *= 0.95 + hash12(uv * 480.0) * 0.10;

    gl_FragColor = vec4(col, 1.0);
  }
`
