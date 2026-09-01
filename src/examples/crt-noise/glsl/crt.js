/**
 * ブラウン管の画面。
 *
 * 「砂嵐」だけなら乱数を出せば済む。ブラウン管に見えるかどうかは、
 * **管の物理をどれだけ重ねるか**で決まる。ここで重ねているのは 7 つ。
 *
 *   1. 樽型歪み     … ガラスが膨らんでいるので、端ほど外へ押される
 *   2. 蛍光体マスク … RGB の縦ストライプ。近づくと色の粒が見える
 *   3. 走査線       … 偶数・奇数ラインの輝度差。インターレース
 *   4. ローリングバー … 垂直同期のずれ。明るい帯がゆっくり流れる
 *   5. 色ずれ       … 収束不良。RGB が水平にずれる
 *   6. 砂嵐         … 電波が無いときのノイズ。時間で総入れ替え
 *   7. 縁の減光と映り込み … 曲面ガラスなので端が暗く、光が乗る
 *
 * どれか 1 つだけだと「ノイズを貼った板」にしか見えない。
 */

export const crtVertexShader = /* glsl */`
  uniform sampler2D uRandom;
  uniform float uTime;
  uniform float uOffset;       // 台ごとの位相。同じ列を別の場所から読む
  uniform float uSwitchSpeed;
  uniform float uAuto;         // 0 なら手動チャンネル固定

  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vBrightness;   // 砂嵐の量。信号の悪さ
  varying float vSwitch;       // 0/1。A と B のどちらを映すか
  varying float vInvert;       // 0/1。色を反転するか
  varying float vFade;         // 遷移中だけ立つ山

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;

    /*
     * 切替のタイミングは**頂点シェーダーで 1 回だけ**引く。
     * 画面全体で 1 つの値なので画素ごとに求める必要がない。
     *
     * vec2(x) で u = v の対角線を読む。2 次元テクスチャを
     * 1 次元の乱数列として使う手。Linear 補間なので値は滑らかに繋がる。
     *
     * 遅い列と速い列を重ねるのが要点。速いほうを 8% だけ混ぜると、
     * 閾値付近で値が細かく行き来して**切替がバタつく**。
     * 単一周波数だときれいに 1 回だけ切り替わり、電波の悪さに見えない。
     */
    vec2 n  = texture2D(uRandom, vec2(uTime * uSwitchSpeed + uOffset)).xy;
    vec2 nh = texture2D(uRandom, vec2(uTime * 3.0 + uOffset)).xy;
    // 単発の乱れ用。切替とは別の速さで動かす
    float rn = texture2D(uRandom, vec2(uTime * 0.05 + uOffset * 3.1)).z;

    float sw = n.y + nh.y * 0.05;
    vSwitch = step(0.5, sw) * uAuto;

    /*
     * 砂嵐は**閾値 0.5 への近さ**から出す。
     * 元実装は別チャンネルで独立に出しているが、あれは「壊れた
     * ディスプレイが並ぶ壁」が狙いで、常にどこかが乱れていてよい。
     * ここは切替のカットを隠すのが目的なので、跨ぐ前後だけに出す。
     *
     * 速い列が閾値付近で行き来するので、1 回の切替でも数回ばたつく。
     */
    float near = smoothstep(0.03, 0.0, abs(sw - 0.5));

    /*
     * 反転は**遷移の前後だけ**に出す一瞬の状態にする。
     * 元実装のように定常状態として持たせると、砂嵐が反転して
     * 真っ白な画面が数十秒続く。管が焼き切れた絵にしかならない。
     * 起きるかどうかは別チャンネル（.x）なので、毎回は起きない。
     */
    vInvert = step(0.5, n.x + nh.x * 0.05) * smoothstep(0.10, 0.0, abs(sw - 0.5)) * uAuto;
    // それとは別に、ごくたまに単独で乱れる。規則的すぎると機械に見える
    float rare = smoothstep(0.90, 0.97, rn + nh.x * 0.05);
    vBrightness = max(near, rare) * 0.9 * uAuto;

    // sin(x * PI) は 0 と 1 で 0、0.5 で最大。遷移の最中だけ立つ
    vFade = sin(vBrightness * 3.14159265);
  }
`

export const crtFragmentShader = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform sampler2D uRandom;
  uniform float uChannelA;     // 0 砂嵐 / 1 カラーバー / 2 走査テスト / 3 ロゴ
  uniform float uChannelB;     // 切替先
  uniform float uNoise;        // 砂嵐の量
  uniform float uScan;         // 走査線の強さ
  uniform float uMask;         // 蛍光体マスクの強さ
  uniform float uBarrel;       // 樽型歪み
  uniform float uRoll;         // ローリングバー
  uniform float uChroma;       // 色ずれ
  uniform float uTear;         // 走査線ごとの横裂け
  uniform float uInvert;       // 反転の強さ
  uniform float uVignette;
  uniform float uBright;
  uniform float uFlicker;
  uniform vec3  uTint;

  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vBrightness;
  varying float vSwitch;
  varying float vInvert;
  varying float vFade;

  /*
   * sin ベースの hash は座標が大きいと（画素座標は数百〜数千）
   * sin の引数が桁あふれして精度が落ち、乱数ではなく滑らかな関数になる。
   * 画素座標を直接入れるので、大きい入力に耐える hash を使う。
   */
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  /*
   * 砂嵐は uv ではなく**画素**を種にする。
   * uv に固定周波数を掛けると、画面が遠いほど 1 画素に何粒も入って
   * 折り返し、渦（モアレ）になる。画素座標なら距離に関係なく
   * 常に 1 画素 1 粒。近づいても遠ざかってもざらつきが保たれる。
   */
  float staticNoise(vec2 frag, float t) {
    return hash(frag + floor(t * 24.0) * 71.13);
  }

  float bandNoise(vec2 frag, float t) {
    // 横に伸びたノイズ。電波の乱れは走査線方向に尾を引く
    return hash(vec2(floor(frag.y), floor(t * 18.0)) * 3.7);
  }

  /*
   * 画面に映す中身。チャンネルで切り替える。
   *
   * 砂嵐は「映っている番組の一つ」であって、信号の劣化とは別物。
   * ここを黒にして uNoise に砂嵐を出させると、劣化を下げた途端に
   * 無信号チャンネルが真っ黒になる。中身として持たせる。
   */
  vec3 content(vec2 uv, float t, float snow, float ch) {
    if (ch < 0.5) {
      return vec3(snow);
    }

    if (ch < 1.5) {
      // カラーバー
      float x = floor(uv.x * 7.0);
      vec3 bars[7];
      bars[0] = vec3(0.75); bars[1] = vec3(0.75, 0.75, 0.0); bars[2] = vec3(0.0, 0.75, 0.75);
      bars[3] = vec3(0.0, 0.75, 0.0); bars[4] = vec3(0.75, 0.0, 0.75);
      bars[5] = vec3(0.75, 0.0, 0.0); bars[6] = vec3(0.0, 0.0, 0.75);
      vec3 c = bars[int(clamp(x, 0.0, 6.0))];
      // 下 1/4 は黒レベルの階段
      if (uv.y < 0.25) c = vec3(floor(uv.x * 5.0) / 4.0 * 0.6);
      return c;
    }

    if (ch < 2.5) {
      // 走査テストパターン。同心円と格子
      vec2 p = (uv - 0.5) * vec2(1.33, 1.0);
      float rings = smoothstep(0.02, 0.0, abs(fract(length(p) * 8.0) - 0.5) - 0.45);
      float grid = smoothstep(0.02, 0.0, abs(fract(uv.x * 12.0) - 0.5) - 0.46)
                 + smoothstep(0.02, 0.0, abs(fract(uv.y * 9.0) - 0.5) - 0.46);
      return vec3(0.06) + vec3(0.7) * clamp(rings + grid, 0.0, 1.0);
    }

    // ゆっくり回る図形
    vec2 p = (uv - 0.5) * vec2(1.33, 1.0);
    float a = atan(p.y, p.x) + t * 0.6;
    float r = length(p);
    float blade = smoothstep(0.02, 0.0, abs(sin(a * 3.0)) * r - 0.12);
    float disc = smoothstep(0.30, 0.28, r);
    return mix(vec3(0.02, 0.03, 0.05), vec3(0.9, 0.6, 0.2), blade * disc);
  }

  void main() {
    /*
     * 1. 樽型歪み。ガラスが膨らんでいるので、中心から離れるほど外へ押される。
     *    これが無いと「平らな板に映像を貼った」ようにしか見えない。
     */
    vec2 c = vUv - 0.5;
    vec2 uv = vUv + c * dot(c, c) * uBarrel;

    // 画面の外はガラスの縁。何も映らない
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    float t = uTime;

    /*
     * 4. ローリングバー。垂直同期がずれると、明るい帯がゆっくり流れる。
     *    帯の内側では画が少し横に飛ぶ。
     */
    float roll = fract(uv.y + t * 0.11);
    float bar = smoothstep(0.10, 0.0, roll) + smoothstep(0.9, 1.0, roll);
    uv.x += bar * 0.012 * uRoll + vFade * 0.03;

    /*
     * 6. 砂嵐。横に伸びた成分を混ぜると「乱れた電波」に見える
     *    （一様な粒だとただのノイズ）。
     */
    float sn = staticNoise(gl_FragCoord.xy, t);
    float bn = bandNoise(gl_FragCoord.xy, t);
    float snow = mix(sn, sn * 0.4 + bn * 0.6, 0.45);
    // 一様乱数のままだと平均 0.5 の灰色に寄って白っぽい。暗部を伸ばす
    snow = pow(snow, 1.6);

    /*
     * 5. 色ずれ。収束不良で RGB が水平にずれる。端ほど大きい。
     */
    /*
     * 5. 収束の崩れ。
     *
     * RGB を左右にずらすだけでは「色がにじんだ板」にしかならない。
     * アナログらしさは**走査線ごとに参照 UV そのものを横へ飛ばす**ことで出る。
     * 低周波（y * 2）で画面全体が大きくうねり、
     * 高周波（y * 50）で細かく裂ける。2 つの周波数を重ねるのが要点。
     *
     * 低周波は遷移中だけ（vFade）、高周波は常時わずかに残す。
     * 常に少し不安定なほうが、通電している管に見える。
     */
    vec2 tear = (texture2D(uRandom, vec2(uv.y * 2.0, t * 3.0)).xy - 0.5) * 0.5 * vFade;
    tear.x -= (texture2D(uRandom, vec2(uv.y * 50.0, t * 3.0)).x - 0.5) * 0.012 * (0.25 + vFade);
    tear *= uTear;

    float shift = uChroma * (1.0 + vFade * 4.0) * (0.002 + 0.006 * abs(c.x));
    float ch = mix(uChannelA, uChannelB, vSwitch);
    vec3 col = vec3(
      content(uv + tear + vec2(shift, 0.0), t, snow, ch).r,
      content(uv + tear * 0.5, t, snow, ch).g,
      content(uv + tear - vec2(shift, 0.0), t, snow, ch).b
    );

    /*
     * 砂嵐の入り方。
     *
     * 全面を一度に差し替えると「切り替わった」だけの絵になる。
     * **走査線ごと**に閾値を判定すると、横帯が崩れながら侵食する。
     * 帯の乱数を速く流す（time * 10）ことで、崩れ方が毎フレーム変わる。
     */
    float band = texture2D(uRandom, vec2(uv.y + t * 10.0, 0.0)).x;
    float burst = smoothstep(0.0, 0.01, -band + vBrightness * 1.2);
    col = mix(col, vec3(snow), max(uNoise, burst));

    // 帯の中は信号が持ち上がる
    col += bar * 0.10 * uRoll;

    /*
     * 走査線と蛍光体マスクは**管に固定された構造**なので、周期も固定する。
     * ただし画面が遠いと 1 画素に何本も入り、折り返して渦（モアレ）になる。
     * 本数のほうを画素に合わせると、今度は距離によって管の質感が変わり、
     * 近くの粗いストライプが色の紙吹雪に見える。
     * 周期は固定したまま、ナイキストに近づいた成分だけ中立値へ溶かす。
     * 遠くのテレビに蛍光体が見えないのは、そもそも正しい。
     */
    vec2 duv = max(fwidth(uv), vec2(1e-6));
    const float lines = 450.0;
    const float stripes = 420.0;
    float scanLod = smoothstep(0.5, 0.18, duv.y * lines);
    float maskLod = smoothstep(0.5, 0.18, duv.x * stripes);

    /*
     * 3. 走査線。1 ラインおきに暗くする。
     *    さらにインターレースで、偶数フィールドと奇数フィールドが交互に来る。
     */
    float line = sin(uv.y * lines * 2.0) * 0.5 + 0.5;
    float field = step(0.5, fract(t * 30.0));
    float scan = mix(1.0, line, uScan * 0.6 * scanLod);
    scan *= mix(1.0, mix(0.92, 1.0, step(0.5, fract(uv.y * lines + field * 0.5))), uScan * scanLod);
    col *= scan;

    /*
     * 2. 蛍光体マスク。RGB の縦ストライプ。
     *    近づくと色の粒が見える。ブラウン管らしさの大半はここ。
     */
    float sub = fract(uv.x * stripes);
    vec3 mask = vec3(
      smoothstep(0.66, 0.33, abs(sub - 0.166)),
      smoothstep(0.66, 0.33, abs(sub - 0.5)),
      smoothstep(0.66, 0.33, abs(sub - 0.833))
    );
    col *= mix(vec3(1.0), mask * 1.6, uMask * maskLod);

    // 信号の反転。切替と同時に起きると、単なるカットが「壊れた」に見える
    col = mix(col, 1.0 - col, vInvert * uInvert);

    // 7. 縁の減光。曲面ガラスなので端が落ちる
    float vig = 1.0 - uVignette * pow(length(c) * 1.5, 2.2);
    col *= clamp(vig, 0.0, 1.0);

    /*
     * 電源とビームの揺らぎ。
     * 時間だけの明滅では画面全体が一様に点滅して蛍光灯に見える。
     * **粗い横帯が高速で流れる**成分を足すと、走査しているものに見える。
     */
    col *= 1.0 + (hash(vec2(floor(t * 20.0), 3.7)) - 0.5) * uFlicker;
    col *= mix(1.0, step(0.0, sin(uv.y * 5.0 - t * 80.0)) * 0.05 + 0.95,
               clamp(uFlicker * 4.0, 0.0, 1.0));

    col *= uTint * uBright;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
