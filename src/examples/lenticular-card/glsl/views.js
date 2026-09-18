/**
 * サブ画像のアトラスを焼く。
 *
 * レンチキュラーの肝は「**印刷された絵は動かない**」こと。動くのは
 * どのストリップが見えるかだけ。だから絵は先に N 枚焼いて固定する。
 * 毎フレーム角度に応じて描き直すと、それはただの視差エフェクトで、
 * レンチキュラー特有の**飛び（コマ落ち）とゴースト**が出ない。
 *
 * ここでは層を重ねた絵を、視線角を変えて N 回描く。
 * 層ごとに奥行きを持たせ、`tan(θ) * depth` でずらす。
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

  uniform vec2  uGrid;        // アトラスの並び（列, 行）
  uniform float uViews;       // 総枚数
  uniform float uMaxAngle;    // 端の視線角（ラジアン）
  uniform float uParallax;    // 視差の強さ
  uniform float uHiddenAt;    // 隠し絵が出始める位置（0..1）
  uniform vec3  uTint;
  uniform vec3  uAccent;

  varying vec2 vUv;

  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float vnoise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  /** 円。r より内側が 1 */
  float disc(vec2 p, float r, float soft) {
    return smoothstep(r, r - soft, length(p));
  }

  vec2 rot(vec2 p, float a) {
    float c = cos(a), si = sin(a);
    return mat2(c, -si, si, c) * p;
  }

  /** 輪。太さ w */
  float ring(vec2 p, float r, float w, float soft) {
    float d = abs(length(p) - r);
    return smoothstep(w, w - soft, d);
  }

  void main() {
    // どのコマか
    vec2 cell = floor(vUv * uGrid);
    float index = cell.y * uGrid.x + cell.x;
    // コマ内の位置
    vec2 uv = fract(vUv * uGrid);

    /*
     * 視線角。**両端で対称**にする。片側だけ深くすると、傾けたとき
     * 手応えが左右で変わって気持ち悪い。
     */
    float t = uViews > 1.0 ? (index / (uViews - 1.0)) * 2.0 - 1.0 : 0.0;
    float theta = t * uMaxAngle;
    float shift = tan(theta) * uParallax;

    vec2 p = uv - 0.5;
    p.x *= 1.6;   // コマは横長

    vec3 col = vec3(0.0);

    /*
     * 奥の層。**一番大きくずれる。** ここが動かないと「窓の中に空間が
     * ある」感じが出ない。
     */
    vec2 far = p + vec2(shift * 1.0, 0.0);
    col += uTint * 0.10 * (1.0 - length(far) * 0.5);
    // 星。粒が流れると奥行きが読める
    /*
     * 星。**細かく、暗く。** レンズは横方向の解像度をレンズの本数まで
     * 落とすので、点のような要素はそのまま 1 本ぶんの太い塊になる。
     * 実物のレンチキュラーで細かい柄を避けるのと同じ理由。
     */
    vec2 sg = far * 26.0;
    float star = step(0.962, hash12(floor(sg)));
    star *= disc(fract(sg) - 0.5, 0.11, 0.16);
    col += vec3(0.62, 0.70, 0.86) * star * 0.30;

    /*
     * 中景。**ずらすだけでなく回す。**
     * 平行移動だけだと、コマ同士の差が小さくて「切り替わっている」と
     * 分からない（実際、視差だけにしたら動いていないと言われた）。
     * 角度で構造が変わると、1 コマ進んだのがはっきり見える。
     */
    vec2 mid = rot(p, t * 0.42) + vec2(shift * 0.55, 0.0);
    /*
     * 色も角度で振る。**レンチキュラーは色が変わるとすぐ分かる。**
     * 形の差だけだと、傾けても同じ絵に見えてしまう。
     */
    vec3 acc = mix(uAccent, vec3(1.0, 0.72, 0.42), clamp(t * 0.5 + 0.5, 0.0, 1.0));
    col += acc * ring(mid, 0.34, 0.010, 0.006) * 0.85;
    col += acc * ring(mid, 0.46, 0.004, 0.004) * 0.35;

    // 中景の塊。少しだけ散らす
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float a = fi * 1.2566 + 0.4;
      vec2 c = vec2(cos(a), sin(a)) * (0.30 + hash12(vec2(fi, 3.0)) * 0.16);
      /*
       * **明るい小さい塊を置かない。** レンズで横の解像度が落ちるので、
       * 小さくて明るい物は角張った白い箱になる（実際なった）。
       * 大きめ・柔らかめ・暗めにする。
       */
      float r = 0.042 + hash12(vec2(fi, 7.0)) * 0.040;
      col += mix(acc, vec3(1.0), 0.25) * disc(mid - c, r, 0.040) * 0.42;
    }

    /*
     * 手前の層。**ほとんどずれない。** 全部が同じだけ動くと、絵が
     * 丸ごと平行移動しているだけに見える。近い物を止めるのが要点。
     */
    vec2 near = rot(p, t * -0.10) + vec2(shift * 0.12, 0.0);
    float cross = 0.0;
    cross += smoothstep(0.0022, 0.0, abs(near.y)) * smoothstep(0.30, 0.0, abs(near.x));
    cross += smoothstep(0.0022, 0.0, abs(near.x)) * smoothstep(0.20, 0.0, abs(near.y));
    col += vec3(0.85, 0.90, 1.0) * cross * 0.26;
    // 目盛り
    float ticks = smoothstep(0.0018, 0.0, abs(fract(near.x * 12.0) - 0.5) - 0.46);
    ticks *= smoothstep(0.03, 0.0, abs(abs(near.y) - 0.24));
    col += vec3(0.8, 0.86, 1.0) * ticks * 0.10;

    /*
     * 隠し絵。**端まで倒したときだけ出す。**
     * これが無いと「動く絵」で終わる。見つける物があると、人は端まで
     * 倒してみる。レンチキュラーの土産物が面白いのはここ。
     */
    float hide = smoothstep(uHiddenAt, 1.0, abs(t));
    if (hide > 0.001) {
      vec2 h = p * 1.15;
      // 縁を柔らかく。量子化で角が立つので、元から角を丸めておく
      float mark = ring(h, 0.22, 0.045, 0.030);
      // 輪の右下を欠けさせる。ただの輪より記号に見える
      mark *= 1.0 - smoothstep(0.02, 0.0, max(h.x - 0.10, -h.y - 0.02));
      mark += disc(h - vec2(0.0, -0.005), 0.075, 0.030);
      vec3 hidCol = mix(vec3(1.0, 0.86, 0.55), vec3(1.0), 0.25);
      // 出るときに元の絵を沈める。重なると読めない
      col *= mix(1.0, 0.22, hide);
      col += hidCol * mark * hide * 1.15;
    }

    /*
     * 印刷の粒。**綺麗すぎると画面に見える。**
     * 紙に刷った物として扱うと、レンズの下に紙があると感じられる。
     */
    /*
     * 周辺を落とす。**中心に見る所を作る。** 一様だと、どこを見れば
     * いいのか分からないまま柄が動くだけになる。
     */
    col *= smoothstep(1.15, 0.30, length(p));

    // 印刷の粒。綺麗すぎると画面に見える
    col *= 0.94 + vnoise(uv * 420.0) * 0.12;

    gl_FragColor = vec4(col, 1.0);
  }
`
