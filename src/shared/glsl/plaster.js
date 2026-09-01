/**
 * 石膏の壁。
 *
 * ジオメトリは板 1 枚。立体に見えているのは全部**高さ場から作った法線**。
 * 隆起を実際のメッシュで作ると、ドラッグのたびに頂点を書き換えることになり、
 * 解像度も上げられない。法線だけなら 1 枚のテクスチャで済む。
 *
 * ただし法線ライティングだけでは「凹凸の絵が描いてある平面」に見える。
 * 立体感を出しているのは次の 3 つ:
 *
 *   1. セルフシャドウ  … 高さ場を光の方向へ進みながら遮蔽を調べる
 *   2. 谷の陰り        … 周囲より低い所を暗く落とす（キャビティ）
 *   3. 微細な地肌      … 石膏の肌理。これが無いと隆起だけが浮いて見える
 */

export const plasterVertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const plasterFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D uHeight;
  uniform vec2  uTexel;        // 1 / 高さ場の解像度
  uniform float uHeightScale;  // 法線の立ち上がり
  uniform vec3  uLightDir;     // 正規化済み
  uniform vec3  uBaseColor;
  uniform float uAmbient;
  uniform float uShadow;
  uniform float uCavity;
  uniform float uMicro;        // 地肌の強さ
  uniform float uSpecular;

  varying vec2 vUv;

  float h(vec2 uv) {
    return texture2D(uHeight, clamp(uv, vec2(0.0), vec2(1.0))).r;
  }

  /* 滑らかな値ノイズ。石膏の肌理に使う。
     hash を直接使うと画素ノイズになって砂目に見える */
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  /*
   * 画素より細かいオクターブは折り返して縞になる。
   * 1 画素あたりの周期数がナイキストに近づいたオクターブは寄与を落とす。
   * px は「uv 1 あたり何画素か」の逆数。
   */
  float fbm(vec2 p, float px) {
    float s = 0.0;
    float a = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
      s += vnoise(p) * a * smoothstep(0.5, 0.18, freq * px);
      p *= 2.03;
      freq *= 2.03;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    float hC = h(vUv);

    /*
     * 1. 高さ場 → 法線。中心差分。
     *    テクセル幅で割って傾きにしてから縦方向のスケールを掛ける。
     *    割らずにスケールだけ掛けると、解像度を変えた瞬間に見た目が変わる。
     */
    float hL = h(vUv - vec2(uTexel.x, 0.0));
    float hR = h(vUv + vec2(uTexel.x, 0.0));
    float hD = h(vUv - vec2(0.0, uTexel.y));
    float hU = h(vUv + vec2(0.0, uTexel.y));
    vec3 n = normalize(vec3(
      -(hR - hL) / (2.0 * uTexel.x) * uHeightScale,
      -(hU - hD) / (2.0 * uTexel.y) * uHeightScale,
      1.0
    ));

    /*
     * 3. 地肌。法線を微妙に揺らす。
     *    平滑な面のままだと、隆起だけが浮いて貼り付けたように見える。
     */
    float px = length(fwidth(vUv)) * 220.0;
    float m = fbm(vUv * 220.0, px);
    float mx = fbm(vUv * 220.0 + vec2(0.7, 0.0), px) - m;
    float my = fbm(vUv * 220.0 + vec2(0.0, 0.7), px) - m;
    n = normalize(n + vec3(mx, my, 0.0) * uMicro * 6.0);

    /*
     * 1. セルフシャドウ。光の方向へ高さ場を進み、
     *    途中の高さが「光線の高さ」を超えていれば遮られている。
     *    完全な二値だと縁がガタつくので、超過量で柔らかく落とす。
     */
    vec2 ldir = normalize(uLightDir.xy) * uTexel * 2.0;
    // 光線が uv 1 進むあいだに上がる高さ
    float lz = uLightDir.z / max(length(uLightDir.xy), 1e-3);
    // 比較は**同じ単位**でやる。高さ場の生値と縦スケールを掛けた値を混ぜない
    float z0 = hC * uHeightScale;
    float occ = 0.0;
    for (int i = 1; i <= 20; i++) {
      float fi = float(i);
      vec2 sp = ldir * fi;
      float zs = h(vUv + sp) * uHeightScale;
      float zr = z0 + length(sp) * lz;
      // 遠いほど寄与を弱める。等しく扱うと影が延々と伸びて帯になる
      occ = max(occ, (zs - zr) * 26.0 / (0.6 + fi * 0.2));
    }
    float shadow = 1.0 - clamp(occ, 0.0, 1.0) * uShadow;

    /*
     * 2. 谷の陰り。広い範囲の平均より低ければ窪み。
     *    セルフシャドウだけだと光と反対側の窪みが潰れて読めない。
     */
    float wide = (h(vUv + vec2(uTexel.x, 0.0) * 8.0) + h(vUv - vec2(uTexel.x, 0.0) * 8.0)
                + h(vUv + vec2(0.0, uTexel.y) * 8.0) + h(vUv - vec2(0.0, uTexel.y) * 8.0)) * 0.25;
    float cavity = 1.0 - clamp((wide - hC) * 30.0, 0.0, 1.0) * uCavity;

    /*
     * 石膏なので拡散主体。ラップライティングで陰を浅くする。
     * ランバートそのままだと陰が黒くなって石に見える。
     */
    vec3 l = normalize(uLightDir);
    float wrap = 0.35;
    float diff = clamp((dot(n, l) + wrap) / (1.0 + wrap), 0.0, 1.0);

    // ざらついた面のごく弱い反射。真っ平らな部分に階調を作る
    vec3 v = vec3(0.0, 0.0, 1.0);
    vec3 hv = normalize(l + v);
    float spec = pow(max(dot(n, hv), 0.0), 24.0) * uSpecular;

    /*
     * 環境光と拡散を足すと 1 を超えて白飛びする。
     * 環境光のぶんだけ拡散の取り分を減らして、合計を 1 に収める。
     */
    vec3 albedo = uBaseColor * (0.96 + m * 0.08);
    float light = uAmbient + (1.0 - uAmbient) * diff * shadow * cavity;
    vec3 col = albedo * light + spec * shadow;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
