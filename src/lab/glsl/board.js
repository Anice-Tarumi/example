/**
 * 空間に浮くガラスの板。
 *
 * 参考実装（Active Theory の Work 一覧）の `WorkItemShader.glsl` を読んで
 * 組み直した。**以前は `WorkPanelShader.glsl` を読んでいたが、一覧の板は
 * それではない。** あちらは別の場面の物で、一覧は MRT を使う別の材質。
 *
 * `WorkItemShader` の要点。
 *
 *   1. **色は黒から足していく。** 掛けるのではなく足す。だから重なるほど
 *      明るくなり、何も無い所は黒に沈む
 *   2. **屈折の的を別に持つ。** `#drawbuffer WorkRefraction` へ書くのは
 *      粒子と金属と板の裏面だけ。それを放射状にぼかして引く
 *   3. **環境マップが地を作る。** `envColorEquiRGB(tEnv, vRefraction) * 0.08`。
 *      これが無いと板は真っ黒から始まり、粒子の後ろだけ光る穴になる
 *   4. **側面を持ち上げる。** `vSide = abs(normal.x)`、`*= 1.0 + pow(vSide, 3.0)`
 *   5. 中身（映像・絵）は soft light で重ねる。貼るのではない
 *   6. マウスの位置を中心に `blendAdd` で色を足す
 *   7. 頂点でせん断とうねり
 *
 * 透かし方だけ作りを変えてある。素直に `transparent: true` にすると板が
 * 深度を書けず（書かないと後段の被写界深度が画面全体をぼかす）、書けば
 * 並び順で面が欠ける。足し合わせで組む本家の式は、そのまま不透明で通る。
 */

export const boardVertexShader = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHover;
  uniform float uRefractionRatio;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vRefract;   // 環境マップを引く向き（世界座標）
  varying float vSide;     // 側面ほど 1

  void main() {
    vUv = uv;

    vec3 p = position;
    /*
     * うねりとせん断。本家は
     *   pos.z += sin(time * 0.5 + abs(0.5 - pos.x) * 3.0) * 0.1 + uHover * 0.2;
     *   pos.y -= pos.x * 0.08;
     * と、板を平面のまま置いていない。わずかに反って傾いている。
     */
    p.z += sin(uTime * 0.5 + abs(0.5 - uv.x) * 3.0 + uSeed * 6.2831) * 0.012 + uHover * 0.02;
    p.y -= (uv.x - 0.5) * 0.045;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * world;

    vViewPos = mv.xyz;
    vNormal = normalMatrix * normal;
    vSide = abs(normal.x);

    // 視線を屈折させた向き。比 1.0 は曲げない（本家の uRefractionRatio も 1）
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    vec3 toVertex = normalize(world.xyz - cameraPosition);
    vRefract = refract(toVertex, worldNormal, uRefractionRatio);

    gl_Position = projectionMatrix * mv;
  }
`

export const boardFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tMap;
  uniform sampler2D tNext;
  uniform sampler2D tFluid;     // 画面座標で引く速度場
  uniform sampler2D tBehind;    // 屈折の的（粒子と金属だけ、放射状にぼかし済み）
  uniform sampler2D tEnv;       // 等距円筒の環境マップ
  uniform sampler2D tNormal;    // 繰り返せる法線マップ（面の細かい凹凸）
  uniform vec2  uResolution;
  uniform vec2  uMouse;         // 0..1
  uniform float uBlend;
  uniform float uHasMap;
  uniform float uOpacity;
  uniform float uPush;
  uniform float uHover;
  uniform float uFocus;
  uniform vec3  uTint;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vRefract;
  varying float vSide;

  vec2 scaleUV(vec2 uv, vec2 scale) { return (uv - 0.5) / scale + 0.5; }

  /** 本家 refl.fs と同じ。等距円筒を RGB をずらして引く */
  vec3 envColorEquiRGB(sampler2D map, vec3 dir, float angle, float amount) {
    vec2 uv;
    uv.y = asin(clamp(dir.y, -1.0, 1.0)) * 0.31830988618 + 0.5;
    uv.x = atan(dir.z, dir.x) * 0.15915494 + 0.5;
    vec2 off = vec2(cos(angle), sin(angle)) * amount * 0.01;
    return vec3(texture2D(map, uv + off).r, texture2D(map, uv).g, texture2D(map, uv - off).b);
  }

  /** 本家 blendmodes.glsl と同じ */
  vec3 softLight(vec3 base, vec3 blend) {
    return mix(
      2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
      sqrt(max(base, 0.0)) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
      step(0.5, blend)
    );
  }
  vec3 blendSoftLight(vec3 base, vec3 blend, float amt) {
    return mix(base, softLight(base, blend), amt);
  }
  vec3 blendAdd(vec3 base, vec3 blend, float amt) {
    return mix(base, min(base + blend, vec3(1.0)), amt);
  }

  void main() {
    vec2 screenUv = gl_FragCoord.xy / uResolution;

    /*
     * 流体。**画面座標で引く。** 板の uv で引くと、板を送ったときに模様が
     * 一緒に動いてしまい、空間に流れがあるようには見えない。
     * 二乗してから使う。線形のままだと少し動かしただけで板が煙になる。
     * 係数は実測。本家の 0.01 はこちらの速度場には合わない（桁が違う）。
     */
    vec2 flow = texture2D(tFluid, screenUv).xy;
    float stir = pow(min(1.0, abs(flow.x) * 0.0022), 2.0);

    vec3 n = normalize(vNormal);
    float centerDist = length(vUv - 0.5);

    /*
     * 屈折。本家は板の中で毎画素 40 点の放射状ぼかしを掛けているが、
     * こちらは Stage が小さい的に 1 回掛けて焼いてある。
     * ここでは引く位置をずらすだけ。ずらし方は同じ考えで、法線・ホバー・
     * 時間・マウスで動かす。
     */
    /*
     * 面の凹凸。本家は waternormals.jpg を貼って cnoise でずらしている。
     *
     *   vec2 normalUV = scaleUV(vUv, vec2(0.5)) + vNormal.xy * 0.02;
     *   normalUV += cnoise(vUv + time * 0.06) * 0.01;
     *
     * **これが無いと板が一様になる。** 平らな面は環境を引く向きが
     * ほとんど変わらないので、凹凸で向きを散らさないと濃淡が生まれない。
     */
    vec2 normalUV = scaleUV(vUv, vec2(0.5)) + n.xy * 0.02;
    normalUV += sin(vUv.x * 6.0 + uTime * 0.06) * sin(vUv.y * 5.0 - uTime * 0.05) * 0.012;
    vec3 surf = texture2D(tNormal, normalUV).rgb * 2.0 - 1.0;

    vec2 ruv = screenUv;
    ruv -= n.xy * 0.05;
    // ずらすのは**面の法線**。幾何の法線だと板ごと一様に動くだけ
    ruv -= surf.xy * (uHover * 0.03 + 0.02 + sin(uTime * 2.0 + vUv.x * 5.0) * 0.005);
    ruv = scaleUV(ruv, vec2(1.1 + uHover * 0.05));
    ruv += (uMouse - 0.5) * 0.02;
    ruv += stir * uPush * 0.06;
    vec3 refraction = pow(max(texture2D(tBehind, ruv).rgb, 0.0), vec3(1.5));

    /*
     * 中身。絵の有無で経路を分けない（本家に分岐は無い）。
     * 絵の無い板は無地しか中身が無いので、地の光をそのまま見せる。
     */
    vec3 content;
    if (uHasMap > 0.5) {
      vec2 uv = vUv + stir * uPush * 0.6;
      content = mix(texture2D(tMap, uv).rgb, texture2D(tNext, uv).rgb, uBlend) * 0.7;
    } else {
      float sweep = smoothstep(0.35, 0.0, abs(fract((vUv.x - vUv.y) * 0.5 - uTime * 0.035) - 0.5));
      content = uTint * (0.05 + sweep * 0.08);
    }

    // --- ここから黒に足していく。順番は本家と同じ ---
    vec3 col = vec3(0.0);

    /*
     * 1. 環境。板の地の明るさはここから来る。
     *    **係数は小さい。** 本家は 0.08。0.62 で試したら乳白色の板になった。
     *    ここは「地」であって「色」ではない。
     */
    col += envColorEquiRGB(tEnv, normalize(vRefract + vec3(surf.xy * 0.22, 0.0)), 0.2, 0.05) * 0.055;

    // 2. 中身を薄く。貼るのではなく足す
    col += min(vec3(0.5), content) * 0.45 * uOpacity;

    // 3. ごく弱い傾斜。真っ平らな面を作らない
    col += 0.01 * vUv.x + 0.01 * vUv.y;

    // 4. 側面を持ち上げる。厚みのあるスラブは縁が光を拾う
    col *= 1.0 + pow(vSide, 3.0);

    // 5. 屈折。**中央は弱く、縁ほど強い**（本家 mix(1.1, 0.3, ...)）
    /*
     * 係数は本家より大きく取る。あちらの屈折の的には 150,000 個の
     * 色付き粒子が詰まっていて中身が濃い。こちらは 16,000 個なので、
     * 同じ係数だと**環境の地だけが見えて平らな灰色の板**になる。
     */
    col += refraction * 2.6 * mix(1.1, 0.3, smoothstep(0.65, 0.0, centerDist)) * mix(1.0, 0.7, uHover);

    // 6. 中身を soft light で重ねる。中央ほど強い
    col = blendSoftLight(col, content, smoothstep(0.7, 0.0, centerDist) * uOpacity);

    // 7. 面をゆっくり波打たせる
    col *= 1.0 + sin(uTime * 2.0 + vUv.x * 5.0) * 0.15;

    // 8. マウスの位置を中心に色を足す
    vec2 offset = mix(vec2(0.5), vec2(uMouse.x, 1.0 - uMouse.y), uHover);
    col = blendAdd(col, uTint, mix(0.0, 0.3 + uHover * 0.2, smoothstep(0.7, -0.1, length(vUv - offset))));

    // 9. ホバーの立ち上がりで一瞬光らせる
    col *= 1.0 + vSide * uHover * 0.2 + 0.3 * smoothstep(0.5, 0.0, abs(uHover - 0.5));

    // 手前にいない板は沈める。並んだとき、どれを見ているかが分かる
    col *= mix(0.42, 1.0, uFocus);

    // 撫でた所は沈む。透過ではなく明度で（深度を書く必要があるため）
    col *= 1.0 - min(0.5, stir * 5.0);

    gl_FragColor = vec4(col, 1.0);
  }
`
