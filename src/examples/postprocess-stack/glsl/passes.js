/**
 * ポストプロセスの各パス。
 *
 * scene → bright → (down → blurH → blurV) × 4 → upsampleAdd × 4 → composite
 *
 * ブルームは three の UnrealBloomPass を使わず自前でミップチェーンを組む。
 * 段ごとに重みを触れるようにするのが目的で、
 * 「小さい段だけ強くして滲みを広げる」といった調整ができる。
 */

export const quadVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** 明るい部分だけ抜く。しきい値の際で階段が出ないよう soft knee を入れる */
export const brightFragmentShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform float uThreshold;
  uniform float uKnee;
  uniform float uClamp;
  varying vec2 vUv;

  void main() {
    vec3 c = min(texture2D(tScene, vUv).rgb, vec3(uClamp));
    float l = max(c.r, max(c.g, c.b));

    // しきい値の前後 knee 幅を二次関数で繋ぐ
    float knee = uThreshold * uKnee + 1e-5;
    float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee);

    float contrib = max(soft, l - uThreshold) / max(l, 1e-5);
    gl_FragColor = vec4(c * contrib, 1.0);
  }
`

/** 1/2 に縮める。4 tap のボックス。テクセル中心の半分ずらしで線形補間を効かせる */
export const downFragmentShader = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;

  void main() {
    vec4 s = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0));
    s += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0));
    s += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0));
    s += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0));
    gl_FragColor = s * 0.25;
  }
`

/**
 * 分離ガウス 5 tap。
 * 線形補間を使って 9 tap 相当のカーネルを 5 回のサンプルで拾う。
 */
export const blurFragmentShader = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uDir;
  uniform float uScale;
  varying vec2 vUv;

  void main() {
    vec2 d = uDir * uScale;
    vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270;
    s += texture2D(tSrc, vUv + d * 1.3846153846).rgb * 0.3162162162;
    s += texture2D(tSrc, vUv - d * 1.3846153846).rgb * 0.3162162162;
    s += texture2D(tSrc, vUv + d * 3.2307692308).rgb * 0.0702702703;
    s += texture2D(tSrc, vUv - d * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(s, 1.0);
  }
`

/** 小さい段を拡大しながら足し込む。tPrev は 1 段小さい累積 */
export const upsampleFragmentShader = /* glsl */ `
  uniform sampler2D tSrc;
  uniform sampler2D tPrev;
  uniform float uPrevWeight;
  uniform float uWeight;
  varying vec2 vUv;

  void main() {
    vec3 s = texture2D(tSrc, vUv).rgb * uWeight;
    s += texture2D(tPrev, vUv).rgb * uPrevWeight;
    gl_FragColor = vec4(s, 1.0);
  }
`

/**
 * 最終合成。GLSL3。3D LUT の texelFetch に sampler3D が要る。
 *
 * 順序:
 *   scene(+色収差) → bloom 加算 → レンズゴースト → 露出 → ビネット
 *   → トーンマップ → sRGB → 3D LUT → グレイン
 *
 * LUT はトーンマップと sRGB 変換の**後**に掛ける。
 * カラリストが .cube を作るのは表示色空間なので、リニア値に掛けると意図が変わる。
 */
export const compositeFragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  // GLSL3 の ShaderMaterial には gl_FragColor が無い。出力は自分で宣言する
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tGhostSrc;
  uniform sampler3D tLut;

  uniform float uBloomStrength;
  uniform float uBloomNorm;
  uniform float uExposure;

  uniform float uGhostSpacing;
  uniform float uGhostStrength;
  uniform float uHaloRadius;
  uniform float uHaloStrength;

  uniform float uChroma;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uLutMix;
  uniform float uLutSize;
  uniform float uTime;
  uniform vec2  uAspect;

  varying vec2 vUv;

  const int GHOSTS = 5;

  /**
   * 累積したブルーム。段を素で足しているので、重みの総和で割って
   * 段数や falloff を変えても明るさが跳ねないようにする。
   */
  vec3 bloomAt(vec2 uv) {
    return texture2D(tBloom, uv).rgb / uBloomNorm;
  }

  /** 中心からの距離に比例して RGB をずらす。レンズの倍率色収差 */
  vec3 sampleChroma(vec2 uv) {
    vec2 d = uv - 0.5;
    float amount = uChroma * dot(d, d);
    return vec3(
      texture2D(tScene, uv - d * amount).r,
      texture2D(tScene, uv).g,
      texture2D(tScene, uv + d * amount).b
    );
  }

  /** ゴーストの色。段ごとに違う色が乗ると「レンズ内の反射」らしくなる */
  /**
   * 画面外を参照したら捨てる。
   * RT は ClampToEdge なので、はみ出したサンプルは端の 1 列が
   * 引き伸ばされて巨大な色面になる。
   */
  float inFrame(vec2 uv) {
    vec2 s = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    return s.x * s.y;
  }

  vec3 ghostTint(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t * 0.85 + vec3(0.0, 0.33, 0.67)));
  }

  /**
   * レンズ内の多重反射（ゴースト）とハロー。
   *
   * ゴーストは画面を 180 度回した像を、中心を基準に **1 より大きい倍率** で
   * 縮小コピーしたもの。倍率が 1 付近を通ると中心の数テクセルが全画面へ
   * 拡大されて巨大な色面になるので、1 を跨がないよう段ごとに離しておく。
   * 符号を交互に振ると、反転・非反転のゴーストが混ざって本物らしくなる。
   *
   * 引くのは累積ブルームではなく 1/2 段だけ。累積は最小段の全画面の霞を
   * 含んでいて、ゴーストに使うと画面いっぱいの色ムラになる。
   */
  vec3 lensGhosts(vec2 uv) {
    vec2 flipped = vec2(1.0) - uv;
    vec3 sum = vec3(0.0);

    for (int i = 0; i < GHOSTS; i++) {
      float fi = float(i);
      float k = (1.0 + uGhostSpacing * (fi + 1.0) * 2.0) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
      vec2 g = (flipped - 0.5) * k + 0.5;

      // 画面中心から離れたゴーストほど暗く
      float w = 1.0 - clamp(length((g - 0.5) * uAspect) * 1.3, 0.0, 1.0);
      sum += texture2D(tGhostSrc, g).rgb * (w * w) * inFrame(g) * ghostTint(fi / float(GHOSTS));
    }

    // ハロー。光源と反対側に開く輪。中心からの距離でリング状に重み付けする
    vec2 haloDir = normalize(vec2(0.5) - flipped + 1e-6) * uHaloRadius;
    vec2 h = flipped + haloDir;
    float hw = pow(1.0 - clamp(length((h - 0.5) * uAspect) / 0.707, 0.0, 1.0), 5.0);
    sum += texture2D(tGhostSrc, h).rgb * hw * inFrame(h) * uHaloStrength;

    return sum * uGhostStrength;
  }

  vec3 lutFetch(ivec3 p) {
    int m = int(uLutSize) - 1;
    return texelFetch(tLut, clamp(p, ivec3(0), ivec3(m)), 0).rgb;
  }

  /**
   * 3D LUT のテトラヘドラル補間。
   *
   * 三線形は立方体の 8 頂点を混ぜるので、対角方向で LUT に無い色が出る。
   * 立方体を 6 個の四面体に割り、入力が属する四面体の 4 頂点だけを混ぜると
   * グラデーションが折れず、コントラストの強いグレードでも破綻しない。
   * どの四面体かは r,g,b の小数部の大小関係だけで決まる。
   */
  vec3 lutTetrahedral(vec3 col) {
    float n = uLutSize - 1.0;
    vec3 c = clamp(col, 0.0, 1.0) * n;
    ivec3 i0 = clamp(ivec3(floor(c)), ivec3(0), ivec3(int(n) - 1));
    vec3 d = c - vec3(i0);

    vec3 v000 = lutFetch(i0);
    vec3 v111 = lutFetch(i0 + ivec3(1, 1, 1));

    if (d.r > d.g) {
      if (d.g > d.b) {
        return (1.0 - d.r) * v000 + (d.r - d.g) * lutFetch(i0 + ivec3(1, 0, 0))
             + (d.g - d.b) * lutFetch(i0 + ivec3(1, 1, 0)) + d.b * v111;
      } else if (d.r > d.b) {
        return (1.0 - d.r) * v000 + (d.r - d.b) * lutFetch(i0 + ivec3(1, 0, 0))
             + (d.b - d.g) * lutFetch(i0 + ivec3(1, 0, 1)) + d.g * v111;
      }
      return (1.0 - d.b) * v000 + (d.b - d.r) * lutFetch(i0 + ivec3(0, 0, 1))
           + (d.r - d.g) * lutFetch(i0 + ivec3(1, 0, 1)) + d.g * v111;
    }

    if (d.b > d.g) {
      return (1.0 - d.b) * v000 + (d.b - d.g) * lutFetch(i0 + ivec3(0, 0, 1))
           + (d.g - d.r) * lutFetch(i0 + ivec3(0, 1, 1)) + d.r * v111;
    } else if (d.b > d.r) {
      return (1.0 - d.g) * v000 + (d.g - d.b) * lutFetch(i0 + ivec3(0, 1, 0))
           + (d.b - d.r) * lutFetch(i0 + ivec3(0, 1, 1)) + d.r * v111;
    }
    return (1.0 - d.g) * v000 + (d.g - d.r) * lutFetch(i0 + ivec3(0, 1, 0))
         + (d.r - d.b) * lutFetch(i0 + ivec3(1, 1, 0)) + d.b * v111;
  }

  /** ACES の近似。three のチャンクは使わず、変換を 1 箇所に閉じ込める */
  vec3 acesFilmic(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  vec3 linearToSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 color = sampleChroma(vUv);
    color += bloomAt(vUv) * uBloomStrength;
    color += lensGhosts(vUv);

    color *= uExposure;

    // ビネットはトーンマップ前に掛ける。光量を落とす操作なので
    vec2 v = (vUv - 0.5) * uAspect;
    color *= mix(1.0, smoothstep(0.95, 0.25, length(v)), uVignette);

    color = acesFilmic(color);
    color = linearToSrgb(color);

    color = mix(color, lutTetrahedral(color), uLutMix);

    // グレインは最後。表示値に乗せないとフィルム粒子に見えない
    float g = hash(vUv * 1024.0 + fract(uTime) * 91.7) - 0.5;
    color += g * uGrain;

    fragColor = vec4(color, 1.0);
  }
`
