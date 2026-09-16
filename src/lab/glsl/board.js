/**
 * 空間に浮くガラスの板。
 *
 * 本家（Active Theory の Work ページ）は、`WorkPanelShader.glsl` を取得して
 * 読んだうえに、**実際の画面も撮って見比べた**。コードだけ読んで
 * 「色は無い、濃淡だけ」と判断したのが間違いで、あちらの板は
 *
 *   - 本当に透ける（向こうの背景も、板に焼かれた文字の影も見える）
 *   - 縁が光を拾う（厚みのあるスラブで、側面が立っている）
 *   - 画面座標の流体で UV が押される
 *   - 周辺が明るい（中心 1.0 → 端 1.6）
 *
 * という**ガラス板**だった。絵を貼った不透明な板ではない。
 *
 * 透けさせ方だけは作りを変えてある。素直に `transparent: true` にすると、
 * 板が深度を書けず（書かないと後段の被写界深度が画面全体をぼかす）、
 * 書けば書いたで並び順で面が欠ける。そこで `Stage` が**板を隠した場面を
 * 先に 1 枚焼き**、それを `tBehind` として画面座標で引く。板は不透明の
 * まま向こうが見える。
 */

export const boardVertexShader = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHover;

  varying vec2 vUv;
  varying vec3 vNormal;    // 視点座標の法線。縁の拾い方に使う
  varying vec3 vViewPos;

  void main() {
    vUv = uv;

    vec3 p = position;
    // ゆっくり反る。平らなままだと板ではなく写真に見える
    float bend = sin(uv.x * 3.14159 + uTime * 0.25 + uSeed * 6.2831) * 0.012
               + cos(uv.y * 3.14159 - uTime * 0.19 + uSeed * 3.7) * 0.008;
    p.z += bend * (1.0 + uHover);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = mv.xyz;
    vNormal = normalMatrix * normal;

    gl_Position = projectionMatrix * mv;
  }
`

export const boardFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tMap;
  uniform sampler2D tNext;
  uniform sampler2D tFluid;     // 画面座標で引く速度場
  uniform sampler2D tBehind;    // 板を除いた場面。ガラスの向こう
  uniform vec2  uResolution;
  uniform float uBlend;         // 差し替え中の混ぜ具合
  uniform float uHasMap;
  uniform float uPush;          // 流れで UV を押す量
  uniform float uHover;
  uniform float uFocus;         // 正面にいるほど 1
  uniform vec3  uTint;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec2 screenUv = gl_FragCoord.xy / uResolution;

    /*
     * 流体。**画面座標で引く。** 板の uv で引くと、板を送ったときに模様が
     * 一緒に動いてしまい、空間に流れがあるようには見えない。
     */
    vec2 flow = texture2D(tFluid, screenUv).xy;
    /*
     * **二乗してから使う。** 線形のまま使うと、少し動かしただけで板全体が
     * 溶けて煙になる。二乗すると、速い所だけが効いて弱い流れは無視される。
     * 係数は**実測で決める**。本家の 0.01 をそのまま持ってきても合わない。
     * こちらの速度場は力の掛け方が違って桁がひとつ大きく、同じ係数だと
     * 板が丸ごと煙になった。
     */
    float stir = pow(min(1.0, abs(flow.x) * 0.0022), 2.0);
    vec2 uv = vUv + stir * uPush * 0.6;

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vViewPos);

    /*
     * ガラスの向こう。**素通しにはしない。** そのまま引くと、板の所だけ
     * 背景が切り抜かれたように見えて、板が存在しなくなる。
     *
     * 曇りは Stage 側で焼いてある（小さい的に 1 回ぼかすほうが、
     * 板の面積ぶん毎回何点も拾うより安い）。ここは屈折の分だけずらして
     * 1 点引く。
     */
    vec2 refr = n.xy * 0.035 + stir * uPush * 0.08;
    vec3 back = texture2D(tBehind, screenUv + refr).rgb;
    // ガラスの地の色。わずかに冷たく沈める
    /*
     * 少し沈める。**向こうと同じ明るさだと板が消える。** 曇りガラスは
     * 必ず光を食う。食わせることで輪郭が立つ。
     */
    vec3 glass = back * mix(vec3(0.72, 0.78, 0.88), vec3(1.0), 0.35) * 0.78;

    vec3 col;
    if (uHasMap > 0.5) {
      vec3 shot = mix(texture2D(tMap, uv).rgb, texture2D(tNext, uv).rgb, uBlend);
      /*
       * 絵の入った板も**少し透かす。** 完全に不透明にすると、周りの空間と
       * 切れて「貼った板」に戻る。
       */
      col = mix(glass, shot * 0.78, 0.86);
    } else {
      /*
       * 絵がまだ無い板は**ガラスそのもの**。無地の面を置くより、
       * 向こうの空間が曇って見えるほうが場に馴染む。
       */
      float sweep = smoothstep(0.35, 0.0, abs(fract((uv.x - uv.y) * 0.5 - uTime * 0.035) - 0.5));
      col = glass + uTint * (0.014 + sweep * 0.022);
    }

    /*
     * 周辺を持ち上げる。中央だけ明るいと、板ではなく光る板に見える。
     * **押す前の uv で測る。** 押した後で測ると、流れた所が一様に明るく
     * なって板全体が白く浮く。
     */
    col *= mix(1.0, 1.6, smoothstep(0.2, 1.0, length(vUv - 0.5)));
    col *= 0.64;

    /*
     * 縁が光を拾う。**ここがガラスに見えるかの分かれ目。**
     * 厚みのあるスラブなので側面が立っていて、正面から外れた面ほど強く光る。
     * 平面に貼っていたときはこれが出せなかった。
     */
    /*
     * **頭打ちにする。** 真横を向いた側面は内積がほぼ 0 になり、
     * 1 画素の白い線として出る。鋭い縁ではなく**傷**に見えるので抑える。
     */
    float fres = min(pow(1.0 - clamp(abs(dot(n, viewDir)), 0.0, 1.0), 3.0), 0.45);
    col += mix(vec3(0.55, 0.62, 0.75), uTint, 0.4) * fres * 0.22;

    /*
     * 内側の縁。**四辺すべてに細い光を入れる。** 側面の反射だけだと、
     * カメラから見て立っている辺（上辺）しか光らず、板が「上だけ光る面」
     * になる。ガラスは縁が全周で光を拾う。
     */
    vec2 edge = min(vUv, 1.0 - vUv);
    float rim = smoothstep(0.030, 0.0, min(edge.x, edge.y * 1.6));
    col += mix(vec3(0.50, 0.58, 0.72), uTint, 0.5) * rim * 0.085;

    // 手前にいない板は沈める。並んだとき、どれを見ているかが分かる
    col *= mix(0.42, 1.0, uFocus);
    /*
     * 触れた板を持ち上げる。**控えめに。** 地が暗いので、大きく足すと
     * 触った瞬間に白い板へ化ける。
     */
    col += uTint * 0.018 * uHover;

    /*
     * 撫でた所は沈む。**透過ではなく明度で表現する。**
     * 半透明にすると深度を書けず、後段の被写界深度が板を背景と誤認する。
     */
    col *= 1.0 - min(0.5, stir * 5.0);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
