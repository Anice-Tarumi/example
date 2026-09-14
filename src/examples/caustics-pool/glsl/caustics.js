import { WAVES } from './waves'

/**
 * 焦線。
 *
 * 「それらしい模様」を描かない。**太陽光を水面で屈折させ、底のどこに
 * 落ちたかを数える。** 明るさは光の密度そのもので、面が凹んだ所に光が
 * 集まって網になる。模様を手で描くと、波と網が別々に動いて嘘になる。
 *
 *   1. 水面に光子を格子状に撒く
 *   2. その点の法線でスネルの法則を解く（空気 → 水）
 *   3. 屈折した向きに進めて、底との交点を出す
 *   4. 交点に 1 発ぶんの明るさを加算する
 *
 * 加算した数がそのまま密度になる。平らな水面なら一様に散るので、
 * **その一様な値で割れば「何倍明るいか」**が出る。
 */

export const photonVertexShader = /* glsl */`
  precision highp float;
  ${WAVES}

  uniform float uIor;       // 水の屈折率
  uniform vec3  uSun;       // 太陽の向き（下向き）
  uniform float uDepth;     // 水深
  uniform float uSize;

  varying float vGain;

  void main() {
    // position.xz に光子を撒いてある。y は使わない
    vec2 p = position.xz;
    vec3 f = waveField(p);
    float h = f.x;
    vec3 n = normalize(vec3(-f.y, 1.0, -f.z));

    // 空気から水へ。全反射する角度では refract が 0 を返す
    vec3 dir = refract(normalize(uSun), n, 1.0 / uIor);
    if (dir.y >= -0.001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    // 底までの距離。水面の高さぶんだけ経路が伸びる
    float t = (h + uDepth) / -dir.y;
    vec3 hit = vec3(p.x, h, p.y) + dir * t;

    /*
     * 深いほど散って弱くなる。距離での減衰を入れないと、水深を変えても
     * 網の明るさが変わらず、**深さの手掛かりが消える**。
     */
    vGain = 1.0 / (1.0 + t * 0.06);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(hit.x, 0.0, hit.z, 1.0);
    gl_PointSize = uSize;
  }
`

export const photonFragmentShader = /* glsl */`
  precision highp float;
  uniform float uUnit;   // 光子 1 発ぶんの明るさ
  varying float vGain;

  void main() {
    /*
     * 点は丸く落とす。四角いままだと、密度の低い所で粒が格子に見える。
     * 中心を強くしておくと、少ない発数でも網の芯が出る。
     */
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float w = smoothstep(0.25, 0.0, d);
    gl_FragColor = vec4(vec3(uUnit * vGain * w), 1.0);
  }
`

/**
 * 焦線テクスチャの後始末。
 *
 * 光子は跳ねるので、そのままだと粒状のむらが残る。**にじませてから使う。**
 * 加算した生の密度を平均へ寄せるのではなく、隣を混ぜるだけにする。
 * 平均へ寄せると網の芯まで消える。
 */
export const blurFragmentShader = /* glsl */`
  precision highp float;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform vec2 uDir;
  varying vec2 vUv;

  void main() {
    // 5 タップの二項係数。狭く、芯を残す
    vec2 o = uTexel * uDir;
    vec3 c = texture2D(tSrc, vUv).rgb * 0.375;
    c += texture2D(tSrc, vUv + o).rgb * 0.25;
    c += texture2D(tSrc, vUv - o).rgb * 0.25;
    c += texture2D(tSrc, vUv + o * 2.0).rgb * 0.0625;
    c += texture2D(tSrc, vUv - o * 2.0).rgb * 0.0625;
    gl_FragColor = vec4(c, 1.0);
  }
`

export const quadVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`
