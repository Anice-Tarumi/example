/**
 * 漂う粒の計算と描画。
 *
 * 本家の粒子は**状態を持っている**。挙動コードにこう書いてあった。
 *
 *   target += flow * 0.0001 * uMouseStrength * texture2D(tFluidMask, screenUV).r;
 *   pos += (target - pos) * 0.07 * HZ;
 *
 * 位置を毎フレーム持ち越して、目標へ寄せている。こちらは以前これを
 * 頂点シェーダーで「その場でずらす」だけにしていた。状態が無いので
 * 撫でた瞬間しか動かず、**尾を引かない**。流れが去った跡に何も残らない。
 *
 * ここでは位置と速度を FBO に持ち、2 枚で入れ替えながら解く。
 * 速度 → 位置の 2 パスに分けてある（Float の MRT は通らない環境がある）。
 */

export const quadVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const shared = /* glsl */`
  precision highp float;

  uniform sampler2D tPosition;   // xyz = 位置 / w = 色の種
  uniform sampler2D tVelocity;   // xyz = 速度 / w = 速さの均し
  uniform sampler2D tOriginal;   // xyz = 定位置 / w = 大きさ
  uniform sampler2D tFluid;      // 画面座標の速度場

  uniform mat4  uModelViewMat;
  uniform mat4  uProjMat;
  uniform float uDtRatio;        // 60fps を 1 とした刻み
  uniform float uTime;
  uniform float uPush;           // 流れから受ける力
  uniform float uReturn;         // 定位置へ戻る強さ
  uniform float uFriction;

  varying vec2 vUv;

  /** 刻みが変わっても減衰が同じになるよう補正する */
  float frictionFPS(float t, float dt) { return exp2(log2(t) * dt); }
`

/** 速度パス */
export const velocityFragmentShader = /* glsl */`
${shared}

  void main() {
    vec4 posData = texture2D(tPosition, vUv);
    vec4 velData = texture2D(tVelocity, vUv);
    vec3 home = texture2D(tOriginal, vUv).xyz;

    vec3 pos = posData.xyz;
    vec3 vel = velData.xyz;

    /*
     * 流体。**画面座標で引く。** 粒を一度投影して、画面のどこにいるかを
     * 求めてから速度場を読む。世界座標で読むと、カメラが動いたときに
     * 流れが空間に貼り付いてしまう。
     */
    vec4 mv = uModelViewMat * vec4(pos, 1.0);
    vec4 clip = uProjMat * mv;
    vec2 screenUv = clip.xy / max(0.001, clip.w) * 0.5 + 0.5;
    vec2 flow = texture2D(tFluid, screenUv).xy;

    /*
     * 頭打ちにする。速度場は速く撫でると桁で跳ねるので、そのまま足すと
     * 粒が画面外へ飛んで戻ってこない。
     */
    vec2 push = clamp(flow * 0.0016, vec2(-1.0), vec2(1.0));
    // 視点座標の左右・上下へ効かせる。奥行きへは弱く
    vel += vec3(push * uPush, 0.0) * uDtRatio;

    /*
     * 定位置へ戻す。**戻さないと雲が散って二度と集まらない。**
     * 本家も目標へ寄せる形で、自由な粒子ではない。
     */
    vel += (home - pos) * uReturn * uDtRatio;

    // ごく弱い漂い。完全な静止は写真に見える
    float ph = posData.w * 6.2831;
    vel += vec3(
      sin(uTime * 0.21 + ph),
      cos(uTime * 0.17 + ph * 1.7),
      sin(uTime * 0.13 + ph * 2.3)
    ) * 0.00035 * uDtRatio;

    vel *= frictionFPS(uFriction, uDtRatio);

    // w には速さを均して入れる。描画で「流れている粒」を少し明るくする
    float speed = length(vel);
    float smoothed = mix(velData.w, speed, 0.12 * uDtRatio);

    gl_FragColor = vec4(vel, smoothed);
  }
`

/** 位置パス */
export const positionFragmentShader = /* glsl */`
${shared}

  void main() {
    vec4 posData = texture2D(tPosition, vUv);
    vec3 vel = texture2D(tVelocity, vUv).xyz;
    gl_FragColor = vec4(posData.xyz + vel * uDtRatio, posData.w);
  }
`

/** 初期値をテクスチャへ写す */
export const copyFragmentShader = /* glsl */`
  precision highp float;
  uniform sampler2D tSource;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tSource, vUv); }
`

export const moteVertexShader = /* glsl */`
  precision highp float;

  attribute vec2 aRef;        // 自分の状態がテクスチャのどこにあるか

  uniform sampler2D tPosition;
  uniform sampler2D tVelocity;
  uniform sampler2D tOriginal;
  uniform float uProj;        // 画面高 / (2 tan(fov/2))
  uniform float uScale;

  varying float vBright;
  varying float vBig;
  varying vec3  vTint;

  void main() {
    vec4 posData = texture2D(tPosition, aRef);
    float big = texture2D(tOriginal, aRef).w;
    float speed = texture2D(tVelocity, aRef).w;

    vec4 mv = modelViewMatrix * vec4(posData.xyz, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = -mv.z;
    vBig = big;

    // 世界での大きさを投影する。遠近が効かないと張り付いて見える
    float world = mix(0.030, 0.30, big) * uScale;
    gl_PointSize = clamp(world * uProj / max(0.6, dist), 1.0, 84.0);

    /*
     * 大きいほど暗く。同じ明るさで大玉を出すと白く飛んで、
     * 画面に穴が空いたように見える。
     */
    float haze = exp(-dist * 0.045);
    /*
     * **数と明るさは必ず一緒に決める。** 加算で重ねるので明るさは数に
     * ほぼ比例して効く。1,700 個のときの値のまま 65,000 個に増やしたら、
     * 画面が吹雪になった。
     */
    vBright = haze * mix(0.20, 0.028, big);
    // 流れている粒だけ少し持ち上げる。跡が見えるようになる
    vBright *= 1.0 + min(1.6, speed * 14.0);

    /*
     * 色。本家の画面を撮ったら、粒はマゼンタや黄や水色の**色付き**だった
     * （FlowerParticleShader が matcap を引いている）。
     * こちらはトーンを上げないので、冷たい側を基調にして、
     * ごく一部だけ暖色を混ぜる。無彩色だと画面が金属の靄になる。
     */
    float seed = posData.w;
    vec3 cool = mix(vec3(0.52, 0.62, 0.82), vec3(0.62, 0.74, 0.78), fract(seed * 7.3));
    vec3 warm = vec3(0.86, 0.72, 0.52);
    vTint = mix(cool, warm, step(0.88, seed) * 0.75);
  }
`

export const moteFragmentShader = /* glsl */`
  precision highp float;
  varying float vBright;
  varying float vBig;
  varying vec3  vTint;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;

    /*
     * 縁に輪を出す。実際のボケは絞りの形で縁が明るい。
     * 輪が無いと、ただの「ぼかした丸」で作り物に見える。
     * 小さい玉には出さない（1 画素に輪は乗らない）。
     */
    float core = smoothstep(0.5, 0.36, r);
    float ring = smoothstep(0.34, 0.5, r) * smoothstep(0.5, 0.46, r);
    float a = core * (0.72 + ring * 1.9 * smoothstep(0.15, 0.5, vBig));

    gl_FragColor = vec4(vTint * a * vBright, 1.0);
  }
`
