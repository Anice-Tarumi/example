export const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // FullScreenQuad の正射影カメラで 2x2 平面が画面全域を覆う
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const fragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D uSceneA;
  uniform sampler2D uSceneB;
  uniform float uProgress;
  uniform int   uMode;
  uniform float uDirection;   // 0 or 1
  uniform float uEdge;        // 境界のぼかし幅
  uniform float uNoiseScale;
  uniform float uNoiseAmount; // 境界を歪ませる量
  uniform float uFlash;       // 境界のフラッシュ強度
  uniform float uZoom;        // 遷移中のスケール演出
  uniform vec3  uOverlayColor;
  uniform float uAspect;

  // --- ice cut（igloo 方式）用 ---
  uniform sampler2D uBlue;     // ブルーノイズ
  uniform vec2  uBlueSize;
  uniform vec2  uBlueOffset;   // 毎フレームずらして固定パターンを避ける
  uniform sampler2D uScroll;   // r = 割れ目 / g = 中周波 / b = 低周波
  uniform float uSlope;        // 切り取り線の傾き
  uniform float uParallax;     // 前後のシーンを逆方向へ流す量
  uniform float uDisplace;     // 切り口付近の押しのけ
  uniform float uCaAmount;     // 色収差の強さ

  // --- hex shatter 用 ---
  uniform float uHexScale;    // 画面あたりのセル数
  uniform float uHexJitter;   // セルごとの時間差
  uniform float uHexWarp;     // グリッド自体の歪み（六角形が崩れる）
  uniform float uHexEdge;     // 縁の太さ
  uniform float uHexRefract;  // 縁での屈折
  uniform float uHexSpin;     // セルの回転
  uniform float uHexSoft;     // 円と六角形の接合の丸み
  uniform float uHexWobble;   // 輪郭の波打ち
  uniform float uHexSeedJitter; // 生える起点のばらつき
  uniform float uHexWindow;   // 1 セルが閉じきるまでの長さ（全体に対する割合）
  uniform vec3  uEdgeColor;
  uniform float uHexGlow;     // 輪郭線の強さ。0 で線を消す
  uniform int   uDebug;       // 中間値の可視化。0 = 通常

  varying vec2 vUv;

  // ---- igloo の GLSL ヘルパーと同じ形 ----

  float linstep(float a, float b, float t) {
    return clamp((t - a) / (b - a), 0.0, 1.0);
  }

  /**
   * 進行度に応じて「しきい値の帯」を動かす関数。
   * margin を変えるだけで、同じ切り取り線から**硬い縁**と**柔らかい縁**を別々に取り出せる。
   * これが効いていて、割れ目・ぼかし・押しのけがそれぞれ違う速さで走る。
   */
  float falloff(float x, float start, float end, float margin, float progress) {
    float m = margin * sign(end - start);
    float p = mix(start - m, end, progress);
    return linstep(p + m, p, x);
  }

  float fitc(float x, float a1, float a2, float b1, float b2) {
    return clamp(b1 + ((x - a1) * (b2 - b1)) / (a2 - a1), min(b1, b2), max(b1, b2));
  }

  float power2In(float t) { return t * t; }

  /**
   * ブルーノイズ。色収差の量を画素ごとにばらつかせて継ぎ目を隠す。
   *
   * 交互勾配ノイズ（IGN）で代用してはいけない。IGN は
   * fract(52.98 * fract(0.0671x + 0.00584y)) という**線形式**で構造を持つ。
   * ディザのオフセットとしてなら許容されるが、**量そのものに掛けると
   * hatching パターンが縞として画面に出る**。
   */
  float blueNoise(vec2 frag) {
    return texture2D(uBlue, (frag + uBlueOffset) / uBlueSize).r;
  }

  // ---- 色収差。5 サンプルを樽型に歪ませて重ねる ----
  const int CA_ITER = 5;
  const float CA_RECI = 1.0 / float(CA_ITER);

  float caLinterp(float t) { return clamp(1.0 - abs(2.0 * t - 1.0), 0.0, 1.0); }
  float caRemap(float t, float a, float b) { return clamp((t - a) / (b - a), 0.0, 1.0); }

  vec2 caBarrel(vec2 coord, float amt) {
    vec2 cc = coord - 0.5;
    return coord + cc * dot(cc, cc) * amt;
  }

  vec4 caSpectrum(float t) {
    float lo = step(t, 0.5);
    float hi = 1.0 - lo;
    float w = caLinterp(caRemap(t, 1.0 / 6.0, 5.0 / 6.0));
    return pow(vec4(lo, 1.0, hi, 1.0) * vec4(1.0 - w, w, 1.0 - w, 1.0), vec4(1.0 / 2.2));
  }

  vec3 chromatic(sampler2D tex, vec2 uv, float maxdistort, float bend) {
    vec4 sum = vec4(0.0);
    vec4 sumw = vec4(0.0);
    for (int i = 0; i < CA_ITER; i++) {
      float t = float(i) * CA_RECI;
      vec4 w = caSpectrum(t);
      sumw += w;
      sum += w * texture2D(tex, caBarrel(uv, bend * maxdistort * t));
    }
    return (sum / sumw).rgb;
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  vec2 scaleUv(vec2 uv, float scale) {
    return (uv - 0.5) / scale + 0.5;
  }

  vec3 saturate3(vec3 c, float amount) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(l), c, amount);
  }

  // ---- mode 0: ノイズマスクによる拭き取りワイプ ----
  vec3 noiseWipe() {
    float t = uProgress;

    // 中央ほど拡大させて奥行きを出す（前後フレームで倍率を変える）
    float scaleMul = (1.0 - t) * abs(vUv.x - 0.5) * 2.0;
    vec3 prevColor = texture2D(uSceneA, scaleUv(vUv, 1.0)).rgb;
    vec3 currColor = texture2D(uSceneB, scaleUv(vUv, 1.0 + uZoom * scaleMul)).rgb;

    prevColor *= mix(1.0, 0.32, t);
    currColor *= mix(1.9, 1.0, t);
    prevColor = saturate3(prevColor, mix(1.0, 0.64, t));
    currColor = saturate3(currColor, mix(1.9, 1.0, t));

    vec2 np = vUv * vec2(uAspect, 1.0) * uNoiseScale;
    float n1 = fbm(np) - 0.5;
    float n2 = fbm(np + 17.3) - 0.5;

    float cutX = mix(vUv.x, 1.0 - vUv.x, uDirection);
    // ノイズのはみ出し分だけ範囲を広げ、端まで必ず拭き切れるようにする
    float head = mix(-uEdge - uNoiseAmount, 1.0 + uEdge + uNoiseAmount, t);
    float m1 = smoothstep(head - uEdge, head + uEdge, cutX + n1 * uNoiseAmount);
    float m2 = smoothstep(head - uEdge, head + uEdge, cutX - n2 * uNoiseAmount);
    float mixRatio = 1.0 - mix(m1, m2, 0.32 + n2 * 0.16);

    vec3 color = mix(prevColor, currColor, mixRatio);
    color = mix(color, color * 2.0, sin(mixRatio * 3.14159265) * uFlash);
    return color;
  }

  // ---- mode 1: 劇場カーテン（左右パネルが閉じて開く） ----
  vec3 curtain() {
    float cover = 1.0 - abs(uProgress * 2.0 - 1.0); // 0 → 1 → 0
    float edgeX = cover * 0.5;
    float e = max(uEdge * 0.25, 0.001);

    float left  = 1.0 - smoothstep(edgeX - e, edgeX + e, vUv.x);
    float right = smoothstep(1.0 - edgeX - e, 1.0 - edgeX + e, vUv.x);
    float mask = clamp(left + right, 0.0, 1.0);

    // 幕が閉じきった裏側でシーンを差し替える（ジャンク隠しの再現）
    vec3 base = mix(
      texture2D(uSceneA, vUv).rgb,
      texture2D(uSceneB, vUv).rgb,
      step(0.5, uProgress)
    );
    return mix(base, uOverlayColor, mask);
  }

  // ---- mode 2: 単色オーバーレイのフェード ----
  vec3 overlayFade() {
    float alpha = 1.0 - abs(uProgress * 2.0 - 1.0);
    vec3 base = mix(
      texture2D(uSceneA, vUv).rgb,
      texture2D(uSceneB, vUv).rgb,
      step(0.5, uProgress)
    );
    return mix(base, uOverlayColor, alpha);
  }

  // ---- mode 3: 円形ワイプ ----
  vec3 circleWipe() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float d = length(p);

    vec2 np = vUv * vec2(uAspect, 1.0) * uNoiseScale;
    d += (fbm(np) - 0.5) * uNoiseAmount;

    float maxR = 0.5 * sqrt(uAspect * uAspect + 1.0);
    float r = mix(-uEdge, maxR + uEdge, uProgress);
    float mask = 1.0 - smoothstep(r - uEdge, r + uEdge, d);

    vec3 color = mix(
      texture2D(uSceneA, vUv).rgb,
      texture2D(uSceneB, scaleUv(vUv, 1.0 + uZoom * (1.0 - uProgress))).rgb,
      mask
    );
    return mix(color, color * 2.0, sin(mask * 3.14159265) * uFlash);
  }

  /**
   * 斜めに割れて入れ替わる遷移（igloo 方式）。
   *
   * 肝は **同じ切り取り線から margin 違いで 3 本の縁を取り出す**こと。
   *   - 硬い縁（margin 0.2）→ 割れ目テクスチャと掛けて実際のマスクにする
   *   - 中くらい（0.9）    → 押しのけ量
   *   - 柔らかい縁（2.0）  → 色収差の強さ
   * 3 本が違う速さで走るので、切り口の手前が先にざわつき、遅れて割れる。
   * 1 本のマスクだけで切ると、どれだけ凝った形でも「切り替わった」だけに見える。
   */
  // ---- 六角形グリッド ----

  const vec2 HEX = vec2(1.0, 1.7320508);

  /** uv → (セル内の位置 xy, セル ID zw)。市松に 2 系統の格子を重ねて近い方を採る */
  vec4 hexCoords(vec2 uv) {
    vec2 a = mod(uv, HEX) - HEX * 0.5;
    vec2 b = mod(uv - HEX * 0.5, HEX) - HEX * 0.5;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    return vec4(gv, uv - gv);
  }

  /** 六角形の距離関数。中心 0、辺で 0.5 */
  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(HEX)), p.x);
  }

  vec2 rot2(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }

  /**
   * 六角形グリッドで割れて入れ替わる遷移。
   *
   * 1 枚のマスクで切らない。**セルごとの距離場から 3 つの量を取り出す**。
   *   - 塗り  … 距離をセルの進行度でしきい値切り
   *   - 縁    … 同じ距離の等高線（絶対値の帯）
   *   - 屈折  … 距離の勾配。縁の近くだけ画を曲げる
   *
   * セルごとにハッシュで遅延・回転を散らすので、割れ方が規則的にならない。
   * グリッドを作る前に uv をノイズで歪めると、六角形が崩れて不定形の多角形になる。
   */
  vec3 hexShatter() {
    vec2 p = vUv - 0.5;
    p.x *= uAspect;

    // グリッドを作る前に歪める。これで六角形が崩れる
    float w1 = valueNoise(p * 2.3 + 11.0) - 0.5;
    float w2 = valueNoise(p * 2.3 - 7.0) - 0.5;
    p += vec2(w1, w2) * uHexWarp;

    vec2 ps = p * uHexScale;
    vec4 hc = hexCoords(ps);
    vec2 gv = hc.xy;

    /*
     * セル ID は**量子化してから使う**。
     *
     * id = ps - gv は浮動小数の引き算なので、同じセル内でも下位ビットが画素ごとに揺れる。
     * hash は混沌関数なのでその微小差を全域に増幅し、セル内で rnd がばらつく。
     * 結果、local も spin も画素ごとに変わり、セルが点描のようにざらつく。
     */
    vec2 id = floor(hc.zw * 64.0 + 0.5) / 64.0;

    // セルごとの乱数。遅延・回転・縮み方を散らす
    float rnd = hash(id * 0.137);
    float rnd2 = hash(id * 0.317 + 5.0);

    /*
     * 上から順に閉じる。
     *
     * **1 セルが閉じる時間（window）を短くし、開始時刻を掃引でずらす**のが要点。
     * window を長く取ると全セルの開閉が重なって、画面全体が一斉に変わって見える。
     *
     * 掃引は**セルの中心**で評価する。画素ごとに評価すると local がセル内で
     * 連続的に変わり、しきい値がセル内で傾く。六角形が一様に育たなくなって
     * ぼけ方が場所ごとに変わり、隣接セルとの境に直線状の継ぎ目が出る。
     */
    vec2 cuv = vec2(id.x / (uHexScale * uAspect), id.y / uHexScale) + 0.5;
    float sweep = clamp((1.0 - cuv.y) * 0.85 + cuv.x * 0.15, 0.0, 1.0);
    float order = clamp(mix(sweep, rnd, uHexJitter), 0.0, 1.0);
    float window = max(uHexWindow, 0.02);
    float start = order * (1.0 - window);
    float local = clamp((uProgress - start) / window, 0.0, 1.0);

    /*
     * タイルの生え方。
     *
     * ぼかして現れさせるのではなく、**六角形そのものが変形しながら拡大する**。
     * 小さい間は隣のタイルと接しないので隙間が空き、そこから前のシーンが見える。
     * 満ちると辺どうしが接して隙間が閉じる。
     *
     * 拡大の中心は**波が来る側の端**から始めて、育つにつれてセル中心へ寄る。
     * 中心から等方に膨らませると、波の向きと噛み合わない。
     */
    float aa = max(length(fwidth(ps)) * 0.7, 1e-4);

    vec2 flowDir = normalize(vec2(0.15, -0.85));
    const float extent = 0.5 * 1.7320508 * 0.5;

    float g = local * local * (3.0 - 2.0 * local);
    float scale = max(g, 1e-3);

    vec2 seed = -flowDir * extent * (1.0 + uHexSeedJitter * (rnd - 0.5));
    vec2 center = seed * (1.0 - g);

    // タイル座標へ。回転と拡大をここで戻す
    vec2 q = rot2(gv - center, (rnd2 - 0.5) * uHexSpin * (1.0 - g)) / scale;

    /*
     * 変形。角度によって辺までの距離を伸縮させる。
     * 真っ直ぐな六角形のまま拡大すると硬いので、輪郭を波打たせる。
     */
    float ang = atan(q.y, q.x);
    float wob = 1.0 + uHexWobble * (
      sin(ang * 3.0 + rnd * 6.2831 + uProgress * 3.0) * 0.5 +
      sin(ang * 5.0 - rnd2 * 6.2831) * 0.5
    ) * (1.0 - g);

    float d = hexDist(q);
    float shape = d - 0.5 * wob;

    // q は scale で割ってあるので、アンチエイリアス幅も同じだけ割る
    float aq = aa / scale;
    float fill = smoothstep(aq, -aq, shape);

    float bump = 4.0 * local * (1.0 - local);

    // 発光は出さない。輪郭は形のエッジだけで見せる
    float edge = 0.0;

    /*
     * 隙間のまわりを歪ませる。
     * タイルの縁からの距離で帯を作り、そこだけ画をずらす。
     */
    float nearEdge = smoothstep(uHexEdge * 4.0 / scale, 0.0, abs(shape)) * bump;
    vec2 grad = normalize(q + 1e-6);
    vec2 refr = grad * nearEdge * uHexRefract;

    float ca = uCaAmount * 0.35 * nearEdge;

    float n = blueNoise(gl_FragCoord.xy);

    vec3 a = chromatic(uSceneA, vUv + refr, ca, n);
    vec3 b = chromatic(uSceneB, vUv - refr, ca, n);

    /*
     * 中間値の可視化。症状がどの項から出ているかを推測でなく特定するため。
     * 1=local 2=d 3=fill 4=edge 5=nearEdge 6=aa 7=blueNoise 8=cell id
     */
    if (uDebug == 1) return vec3(local);
    if (uDebug == 2) return vec3(d * 2.0);
    if (uDebug == 3) return vec3(fill);
    if (uDebug == 4) return vec3(edge);
    if (uDebug == 5) return vec3(nearEdge);
    if (uDebug == 6) return vec3(aa * 40.0);
    if (uDebug == 7) return vec3(blueNoise(gl_FragCoord.xy));
    if (uDebug == 8) return vec3(fract(rnd * 7.0), fract(rnd2 * 5.0), 0.5);

    vec3 color = mix(a, b, fill);
    return color + uEdgeColor * edge * uHexGlow;
  }

  vec3 iceCut() {
    vec2 uvTex = vUv - 0.5;
    uvTex.x *= uAspect;
    uvTex += 0.5;
    vec3 scrollTex = texture2D(uScroll, uvTex).rgb;

    // 切り取り線の傾きを低周波ノイズで揺らす。直線だと定規で切ったように見える
    float slopeDisp = (scrollTex.b * 2.0 - 1.0) * 0.4;
    float slope = -uSlope * uAspect;
    float inclination = mix(1.0 - vUv.x + slopeDisp, vUv.x + slopeDisp, step(slope, 0.0));
    float incProgress = fitc(uProgress, 0.0, 1.0, 0.0, 1.0 + abs(slope));
    float axis = vUv.y + inclination * abs(slope);

    float cutBlur = falloff(axis, 0.0, 1.0, 2.0, incProgress);
    float cutDispA = falloff(axis, 0.0, 1.0, 0.9, incProgress);
    float cutDisp = falloff(scrollTex.g, 0.0, 1.0, 1.0, cutDispA);
    float cutDiag = falloff(axis, 0.0, 1.0, 0.2, incProgress);
    float cut = falloff(scrollTex.r, 0.0, 1.0, 2.0, cutDiag);

    // 画面の端では色収差を弱める。四隅で破綻するのを防ぐ
    float modulator = uCaAmount
      * smoothstep(1.0, 0.7, abs(vUv.x * 2.0 - 1.0))
      * smoothstep(1.0, 0.7, abs(vUv.y * 2.0 - 1.0));

    float n1 = blueNoise(gl_FragCoord.xy);
    float n2 = blueNoise(gl_FragCoord.xy + 19.0);

    // 片側が完全に隠れているならサンプルしない
    vec3 s1 = vec3(0.0);
    vec3 s2 = vec3(0.0);
    if (cut < 1.0) {
      vec2 uv1 = vUv - vec2(0.0, uParallax * power2In(uProgress) + uDisplace * cutDisp);
      s1 = chromatic(uSceneA, uv1, modulator, cutBlur * n1);
    }
    if (cut > 0.0) {
      vec2 uv2 = vUv + vec2(0.0, uParallax * power2In(1.0 - uProgress) + uDisplace * (1.0 - cutDisp));
      s2 = chromatic(uSceneB, uv2, modulator, (1.0 - cutBlur) * n2);
    }
    return clamp(mix(s1, s2, cut), vec3(0.0), vec3(1.0));
  }

  void main() {
    vec3 color;
    if (uMode == 5)      color = hexShatter();
    else if (uMode == 4) color = iceCut();
    else if (uMode == 0) color = noiseWipe();
    else if (uMode == 1) color = curtain();
    else if (uMode == 2) color = overlayFade();
    else                 color = circleWipe();

    gl_FragColor = vec4(color, 1.0);
    // FBO はリニア。画面出力時に sRGB へ変換する
    #include <colorspace_fragment>
  }
`
