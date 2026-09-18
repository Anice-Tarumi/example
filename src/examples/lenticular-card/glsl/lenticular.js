/**
 * レンチキュラーのカード。
 *
 * かまぼこ型のレンズを並べた板の下に、N 枚の絵を短冊状に交互に印刷する。
 * レンズは真下の短冊を拡大して見せるが、**見る角度によって拡大される
 * 位置がずれる**ので、角度ごとに違う絵が見える。
 *
 *   レンズ内の位置 u（0..1）
 *   視線角 θ
 *   s = u + tan(θ) * f / P     ← レンズが拾う短冊の位置
 *   見える絵 = fract(s) * N 枚目
 *
 * ここを式のまま書けば再現できる。**CSS のクロスフェードにしない**ために
 * 要るのは、式そのものより次の 4 つ。
 *
 *   1. **隣のコマを滲ませる。** レンズの開口は有限で、1 枚だけがきれいに
 *      見えることはない。常に隣が混ざる（ゴースト）
 *   2. **色収差。** レンズの屈折率は波長で違う。切り替わり際に赤と青の
 *      縁が出る。これが一番「レンチキュラーだ」と分かる手掛かり
 *   3. **レンズの稜線。** 継ぎ目がわずかに暗い。縦縞が見えることで
 *      表面にレンズがあると分かる
 *   4. **表面の艶。** 透明プラの鏡面反射。無いと印刷物にしか見えない
 *
 * 視線角は**実際の視線から出す**。カードの回転とカメラの位置から計算する
 * ので、カードを傾けても、カメラを動かしても、正しく効く。角度を外から
 * 与えると、動きと見え方がずれて手応えが合わない。
 */

export const lenticularVertexShader = /* glsl */`
  precision highp float;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vTangentW;   // レンズが走る向きと直交する、面内の横方向

  void main() {
    vUv = uv;

    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;

    mat3 m = mat3(modelMatrix);
    vNormalW  = normalize(m * normal);
    // 面内の横。レンズは縦に走るので、視差はこの向きで測る
    vTangentW = normalize(m * vec3(1.0, 0.0, 0.0));

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const lenticularFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tViews;    // サブ画像のアトラス
  uniform vec2  uGrid;         // アトラスの並び（列, 行）
  uniform float uViews;        // 総枚数
  uniform float uMaxAngle;     // 焼いたときの端の角度
  uniform float uLenses;       // カード横幅あたりのレンズ本数
  uniform float uFocal;        // 焦点距離 / ピッチ
  uniform float uBleed;        // 隣のコマの混ざり
  uniform float uAberration;   // 色収差
  uniform float uRidge;        // 稜線の暗さ
  uniform float uSheen;        // 表面の艶
  uniform float uGrain;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vTangentW;

  /**
   * アトラスから k 枚目を引く。
   *
   * **コマの縁で隣へはみ出さないよう内側へ寄せる。** 寄せないと、
   * 拡大されたときに隣のコマの端が糸のように出る。
   */
  vec3 sampleView(float k, vec2 uv) {
    float idx = clamp(floor(k + 0.5), 0.0, uViews - 1.0);
    vec2 cell = vec2(mod(idx, uGrid.x), floor(idx / uGrid.x));
    vec2 inset = 1.0 / (uGrid * 512.0);
    vec2 t = (cell + clamp(uv, inset, 1.0 - inset)) / uGrid;
    return texture2D(tViews, t).rgb;
  }

  /** 連続した k で引く。隣と混ぜてゴーストを作る */
  vec3 sampleBlended(float k, vec2 uv, float bleed) {
    float base = floor(k);
    float f = k - base;
    vec3 a = sampleView(base, uv);
    vec3 b = sampleView(base + 1.0, uv);
    /*
     * 混ぜ方を線形にしない。**線形だと一定速度で溶けて動画に見える。**
     * 端を締めると「コマが切り替わる」感じが残り、そのうえで滲む。
     */
    float w = smoothstep(0.5 - bleed * 0.5, 0.5 + bleed * 0.5, f);
    return mix(a, b, w);
  }

  void main() {
    /*
     * 視線角。**面内の横方向へ視線がどれだけ寝ているか。**
     * カードの回転もカメラの移動も、ここに自然に入る。画素ごとに
     * 少しずつ違うので、大きな板だと**帯**になって波が走る。
     * これが実物のレンチキュラーで見える横帯の正体。
     */
    vec3 view = normalize(cameraPosition - vWorldPos);
    float sinT = dot(view, vTangentW);
    float theta = asin(clamp(sinT, -0.999, 0.999));

    /*
     * どのコマが見えるか。**レンズ 1 本の中では変わらない。**
     *
     * ここを取り違えて、レンズ内の位置 u でコマを変える式にしていたら
     * 縞のノイズになった。レンズは真下の短冊 1 本を拡大して見せるので、
     * **1 本のレンズ面は丸ごと同じコマ**になる。コマを決めるのは視線角だけ。
     *
     *   s = tan(θ) · f / P        （レンズが拾う短冊の位置）
     */
    float span = tan(uMaxAngle) * uFocal;
    float s = tan(theta) * uFocal;
    float k = (clamp(s, -span, span) / max(1e-4, span) * 0.5 + 0.5) * (uViews - 1.0);

    /*
     * レンズの割り付け。横方向を uLenses 本に割る。
     */
    float lens = vUv.x * uLenses;
    float u = fract(lens);

    /*
     * 絵を引く位置は**レンズの中心に量子化する**。
     * レンズ 1 本が短冊 1 本を拡大するので、横の解像度はレンズの本数まで
     * 落ちる。実物が縦に櫛の目のように見えるのはこれ。滑らかに引くと、
     * ただのぼけた画像になってレンチキュラーに見えない。
     */
    vec2 quv = vec2((floor(lens) + 0.5) / uLenses, vUv.y);

    /*
     * 色収差。**チャンネルごとに屈折量を変える。**
     * 傾けたときの赤青の縁はこれ。1 枚で済ませるとプリントに見える。
     */
    float d = uAberration * (uViews - 1.0) * 0.06;
    vec3 col;
    col.r = sampleBlended(k + d, quv, uBleed).r;
    col.g = sampleBlended(k,     quv, uBleed).g;
    col.b = sampleBlended(k - d, quv, uBleed).b;

    /*
     * レンズの稜線。継ぎ目がわずかに暗い。
     * **画面上で細かくなりすぎたら消す。** 1 レンズが数画素を切ると
     * 縞が折り返してノイズになる（モアレ）。
     */
    float lensPx = 1.0 / max(1e-5, fwidth(lens));
    float ridgeFade = smoothstep(1.5, 5.0, lensPx);
    float ridge = smoothstep(0.5, 0.06, abs(u - 0.5));
    col *= mix(1.0, 0.62 + 0.38 * ridge, uRidge * ridgeFade);

    /*
     * 表面の艶。透明プラの鏡面。角度で流れる細い光。
     * 印刷物との差はここで出る。
     */
    vec3 n = normalize(vNormalW);
    float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 3.0);
    float band = smoothstep(0.35, 0.0, abs(fract(theta * 1.9 + vUv.y * 0.7 + 0.5) - 0.5));
    col += vec3(0.85, 0.90, 1.0) * (fres * 0.22 + band * fres * 0.45) * uSheen;

    // レンズの稜線が光を拾う。細かいときは出さない
    col += vec3(1.0) * pow(ridge, 6.0) * uSheen * 0.10 * ridgeFade;

    // 紙とレンズの粒
    float g = fract(sin(dot(vUv * 1024.0 + uTime * 0.0, vec2(12.9898, 78.233))) * 43758.5453);
    col *= 1.0 - uGrain * 0.5 + g * uGrain;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

/** カードの縁と裏。表だけだと板が薄紙に見える */
export const edgeFragmentShader = /* glsl */`
  precision highp float;
  uniform vec3 uColor;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vec3 view = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - clamp(dot(normalize(vNormalW), view), 0.0, 1.0), 2.5);
    gl_FragColor = vec4(uColor * (0.35 + fres * 0.9), 1.0);
    #include <colorspace_fragment>
  }
`
