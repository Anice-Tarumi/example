/**
 * 時計のまわりを駆け抜ける流れ星。
 *
 * 画面に斜線を引くのではなく、**時計のまわりを実際に回す**。斜線は
 * どれだけ丁寧に描いても背景の模様にしか見えず、時計と同じ空間にいる
 * 感じが出ない。傾いた軌道を通せば、字の手前と奥を交互に抜ける。
 *
 * ただし回し続けない。ずっと同じ輪の上を回っていると、飾りの輪に見えて
 * 動きが止まって感じられる。**一本ずつ現れ、弧を駆け抜け、消える。**
 * 消えたら別の軌道で出直す。
 *
 * 1 本は「同じ軌道を少しずつ遅れて進む点の列」で作る。尾を別に持たない。
 * 角度をずらすだけで、軌道の曲がりに沿った尾になる。
 */

const ORBIT = /* glsl */`
  attribute float aSeed;   // 筋ごとの種
  attribute float aT;      // 尾のどこか。0 が頭、1 が末

  uniform float uTime;
  uniform float uSpeed;
  uniform float uTail;     // 尾の長さ（角度）
  uniform float uRadius;
  uniform float uCamDist;  // カメラから時計までの距離

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  /** 位置と濃さ。w に濃さを入れて返す */
  vec4 orbit() {
    float base = hash11(aSeed + 1.3);

    // 1 回ぶんの寿命。筋ごとにずらす。揃えると全部が一斉に現れる
    float life = mix(2.2, 5.5, base) / max(0.05, uSpeed);
    float u = uTime / life + base * 17.0;
    float pass = floor(u);   // 何回目の登場か
    float ph = fract(u);     // その中でどこまで進んだか

    // **登場ごとに軌道を引き直す。** 同じ軌道の使い回しは輪に見える
    float h1 = hash11(aSeed * 3.1 + pass * 7.77);
    float h2 = hash11(aSeed * 5.3 + pass * 3.19);
    float h3 = hash11(aSeed * 9.7 + pass * 11.3);
    float h4 = hash11(aSeed * 2.9 + pass * 5.51);

    // 半分は逆回り。全部が同じ向きだと回転する輪に見える
    float dir = h4 > 0.5 ? 1.0 : -1.0;
    // 通り抜ける弧の長さ。一周させない。掠めて消えるほうが速く見える
    float arc = 1.8 + h1 * 2.4;
    float ang = (h2 * 6.2831 + ph * arc - aT * uTail) * dir;

    float rx = uRadius * (0.7 + h3 * 0.7);
    float rz = rx * (0.5 + h1 * 0.7);
    vec3 p = vec3(cos(ang) * rx, 0.0, sin(ang) * rz);

    // 軌道面を倒す。倒さないと全部が同じ輪の上に乗る
    p.yz = rot((h2 - 0.5) * 1.7) * p.yz;
    p.xy = rot((h3 - 0.5) * 1.2) * p.xy;
    p.y += (h4 - 0.5) * uRadius * 0.5;

    /*
     * 出入りは端で溶かす。**唐突に消すと点滅に見える。**
     * 入りは短く、抜けは長く取る。流れ去った残像のように見える。
     */
    float fade = smoothstep(0.0, 0.07, ph) * smoothstep(1.0, 0.55, ph);
    // 末ほど薄く。線形だと尾が棒に見える
    fade *= pow(1.0 - aT, 2.2);
    // 頭だけ持ち上げる。全体が同じ明るさだと線が漂っているだけに見える
    fade *= 1.0 + smoothstep(0.18, 0.0, aT) * 2.2;
    // 明るさも登場ごとに散らす。全部同じだと同時に湧いたように見える
    fade *= 0.45 + h1 * 0.9;

    return vec4(p, fade);
  }
`

export const cometVertexShader = /* glsl */`
  precision highp float;
  ${ORBIT}

  varying float vFade;

  void main() {
    vec4 o = orbit();
    vec4 mv = modelViewMatrix * vec4(o.xyz, 1.0);
    gl_Position = projectionMatrix * mv;

    /*
     * 奥ほど暗く、手前ほど明るくする。
     *
     * 線は太さを持たないので、**明るさでしか前後が読めない。** 均一に描くと
     * 時計の前を通ったのか後ろを通ったのか分からない。
     */
    float rel = clamp((-mv.z - uCamDist) / max(0.001, uRadius), -1.0, 1.0);
    vFade = o.w * mix(1.5, 0.35, rel * 0.5 + 0.5);
  }
`

export const cometFragmentShader = /* glsl */`
  precision highp float;
  uniform vec3 uColor;
  uniform float uGain;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor * vFade * uGain, 1.0);
    #include <colorspace_fragment>
  }
`
