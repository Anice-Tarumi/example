/**
 * 画像をタイルに割って裏返す。
 *
 * 1 枚のインスタンス化した板で、板ごとに
 *   ・自分が担当する uv の矩形（aTile）
 *   ・いつ動き出すか（aDelay）
 * を持つ。表は画像 A、裏は画像 B。半分回ったところで見える面が入れ替わる。
 *
 * 板ごとに three の Object3D を持って CPU で行列を組んでも動くが、
 * 1000 枚を毎フレーム compose すると行列計算だけで無視できない時間になる。
 * **回転は頂点シェーダーでやる。** CPU が触るのは進行度ひとつ。
 *
 * 面の裏表は `gl_FrontFacing` で判定する。板を 2 枚重ねると
 * 厚みが出て、めくれる途中に隙間が見える。
 */

export const tileVertexShader = /* glsl */`
  precision highp float;

  attribute vec2  aTile;    // タイルの列・行
  attribute float aDelay;   // 0..1。順番
  attribute float aSpin;    // 回転軸のばらつき
  attribute float aProg;    // hover モードで板ごとに持つ進行度

  uniform vec2  uGrid;
  uniform vec2  uSize;      // 板全体のワールドサイズ
  uniform float uProgress;  // 0..1
  uniform float uStagger;   // 時間差の幅。0 なら一斉
  uniform float uLift;      // めくる途中に手前へ出る量
  uniform float uGap;       // タイル間の隙間
  uniform float uAxisMix;   // 0 = 横軸まわり / 1 = 縦軸まわり
  uniform float uHover;     // 1 なら板ごとの進行度を使う

  varying vec2  vUv;
  varying vec2  vUvBack;  // 裏面が拾う uv
  varying vec2  vLocal;   // タイル内の 0..1
  varying vec3  vNormal;
  varying float vT;

  void main() {
    /*
     * 進行度を板ごとにずらす。
     * uStagger のぶんだけ持ち時間が短くなるので、遅い板も 1 で必ず終わる。
     */
    float span = max(1e-3, 1.0 - uStagger);
    float t = clamp((uProgress - aDelay * uStagger) / span, 0.0, 1.0);
    // 板ごとにめくるときは、進行度を CPU 側が板ごとに持つ
    t = mix(t, aProg, uHover);
    // 等速だとロボットに見える。両端を寝かせる
    t = t * t * (3.0 - 2.0 * t);
    vT = t;

    float angle = t * 3.14159265;

    /*
     * 板の中心と大きさをワールド単位で出す。
     * メッシュ側を非等方にスケールすると、回転が先に掛かっているぶん
     * めくれ方まで潰れる。位置と大きさをここで決めるほうが素直。
     */
    vec2 cell = ((aTile + 0.5) / uGrid - 0.5) * uSize;
    /*
     * 隙間は**めくっている最中だけ**開ける。常に開けていると、静止して
     * いるときも格子が見えて「1 枚の画像」に見えない。
     */
    vec2 size = (uSize / uGrid) * (1.0 - uGap * sin(t * 3.14159265));

    vec3 p = vec3(position.xy * size, 0.0);

    // 回転軸。横軸と縦軸を混ぜられるようにしておく
    float ca = cos(angle);
    float sa = sin(angle);
    vec3 rp = p;
    vec3 rn = vec3(0.0, 0.0, 1.0);
    if (uAxisMix < 0.5) {
      rp = vec3(p.x, p.y * ca, p.y * sa);
      rn = vec3(0.0, -sa, ca);
    } else {
      rp = vec3(p.x * ca, p.y, -p.x * sa);
      rn = vec3(sa, 0.0, ca);
    }

    // 途中だけ手前へ出す。平面のまま回ると板が紙に見える
    float lift = sin(t * 3.14159265) * uLift * mix(0.6, 1.4, aSpin);

    vec3 world = vec3(cell, 0.0) + rp + vec3(0.0, 0.0, lift);

    vLocal = position.xy + 0.5;
    vUv = (aTile + vLocal) / uGrid;

    /*
     * 裏面の uv。
     *
     * 反転する向きは**回転軸で決まる**。横軸まわりに回せば裏は上下が逆、
     * 縦軸まわりなら左右が逆。片方に固定すると必ずどちらかで絵が転ぶ。
     *
     * そして反転は**タイルの中で閉じる**。画像全体の uv を反転すると、
     * 裏面が別のタイルの絵を拾って、めくった先が繋がらない。
     */
    vec2 backLocal = uAxisMix < 0.5
      ? vec2(vLocal.x, 1.0 - vLocal.y)
      : vec2(1.0 - vLocal.x, vLocal.y);
    vUvBack = (aTile + backLocal) / uGrid;
    vNormal = normalize(mat3(modelMatrix) * rn);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

export const tileFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D uFront;
  uniform sampler2D uBack;
  uniform vec2  uFrontScale;
  uniform vec2  uBackScale;
  uniform vec3  uLightDir;
  uniform float uAmbient;
  uniform float uEdge;

  varying vec2  vUv;
  varying vec2  vUvBack;
  varying vec2  vLocal;
  varying vec3  vNormal;
  varying float vT;

  vec2 cover(vec2 uv, vec2 scale) {
    return (uv - 0.5) * scale + 0.5;
  }

  void main() {
    /*
     * 裏返ったかどうかは gl_FrontFacing で分かる。
     * 進行度で切り替えると、斜めから見たときに実際の見え方とずれる。
     */
    vec3 col = gl_FrontFacing
      ? texture2D(uFront, cover(vUv, uFrontScale)).rgb
      : texture2D(uBack, cover(vUvBack, uBackScale)).rgb;

    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;

    // 平行光ひとつ。板が回ると陰影が変わり、厚みのある板に見える
    float diff = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);
    col *= uAmbient + (1.0 - uAmbient) * diff;

    /*
     * 回っている最中だけ縁を締める。全部に掛けると格子が常に見える。
     * 距離は**タイル内の座標**で測る。画像全体の uv で測ると、
     * 画面の外周にだけ枠が付いて、タイルの縁には何も出ない。
     */
    float edge = min(min(vLocal.x, 1.0 - vLocal.x), min(vLocal.y, 1.0 - vLocal.y));
    col *= 1.0 - uEdge * sin(vT * 3.14159265) * smoothstep(0.09, 0.0, edge);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
