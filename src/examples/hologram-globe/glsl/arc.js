import { HOLO } from './holo'

/**
 * 都市を結ぶ弧。
 *
 * 線ではなく**帯**で描く。線幅は WebGL では 1px から変えられない。
 * 帯なら太さも先細りも作れる。
 *
 * 帯は毎フレーム**カメラのほうへ向け直す**。固定の向きだと、真横から見た
 * ときに紙のように消える。曲線の接線と視線の外積が、常に見えている向き。
 */

export const arcVertexShader = /* glsl */`
  precision highp float;
  ${HOLO}

  attribute vec3 aStart;
  attribute vec3 aC1;
  attribute vec3 aC2;
  attribute vec3 aEnd;
  attribute float aBirth;   // 出た時刻
  attribute float aSeed;

  uniform float uRadius;
  uniform float uThickness;
  uniform float uDuration;
  uniform float uTail;      // 尾の長さ（弧に対する割合）

  varying float vT;
  varying float vHead;
  varying float vAge;
  varying float vBright;

  vec3 bezier(float t) {
    float u = 1.0 - t;
    return u * u * u * aStart + 3.0 * u * u * t * aC1 + 3.0 * u * t * t * aC2 + t * t * t * aEnd;
  }

  vec3 tangent(float t) {
    float u = 1.0 - t;
    vec3 d = -3.0 * u * u * aStart
           + 3.0 * (3.0 * t * t - 4.0 * t + 1.0) * aC1
           + 3.0 * (2.0 * t - 3.0 * t * t) * aC2
           + 3.0 * t * t * aEnd;
    return normalize(d);
  }

  void main() {
    float t = uv.y;
    float side = uv.x * 2.0 - 1.0;

    float age = (uTime - aBirth) / uDuration;
    // 頭の位置。1 を越えたら着いていて、そこから尾が追いつくのを待つ
    float head = clamp(age, 0.0, 1.0);
    vT = t;
    vHead = head;
    vAge = age;
    vBright = 0.55 + 0.45 * fract(aSeed * 0.618);

    /*
     * どこまで見えるかは**フラグメントで決める**。
     *
     * ここで頂点を画面外へ逃がすと、頭をまたぐ三角形は片方の角だけが
     * 飛んで引き伸ばされ、先端が曲がる。刻みの数でしか頭が進まないので
     * 動きもかくつく。
     *
     * 逃がしてよいのは**帯 1 本まるごと**消えているときだけ。その判定は
     * t を含まないので、三角形が裂けない。
     */
    if (age < 0.0 || age > 1.0 + uTail * 2.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    vec3 local = holoGlitch(bezier(t) * uRadius);
    vec3 world = (modelMatrix * vec4(local, 1.0)).xyz;
    vec3 dir = normalize((modelMatrix * vec4(tangent(t), 0.0)).xyz);

    // 常にカメラへ正対させる。接線と視線の外積が帯の横方向
    vec3 look = normalize(world - cameraPosition);
    vec3 across = normalize(cross(look, dir));
    // 尾へ向かって細める。太さが一定だと帯に見え、光跡に見えない
    float taper = mix(0.35, 1.0, smoothstep(head - uTail, head, t));
    world += across * side * uThickness * taper;

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

export const arcFragmentShader = /* glsl */`
  precision highp float;
  ${HOLO}

  uniform vec3 uHeadTint;
  uniform float uGain;
  uniform float uTail;

  varying float vT;
  varying float vHead;
  varying float vAge;
  varying float vBright;

  void main() {
    /*
     * 見えるのは頭の後ろ uTail ぶんだけ。全長を一度に出すと、都市の間に
     * 線が置かれただけで、飛んで見えない。
     *
     * 頂点ではなく**ここで切る**。刻みに縛られないので、頭が連続に進む。
     */
    float body = smoothstep(vHead - uTail, vHead, vT);
    // 頭の先は落とす。硬く切ると階段が出るので、わずかにぼかす
    body *= 1.0 - smoothstep(vHead - 0.003, vHead + 0.003, vT);
    // 着いたあと全体が消える。消えないと画面が線で埋まる
    body *= 1.0 - smoothstep(1.0, 1.0 + uTail * 2.5, vAge);

    float a = body * vBright;
    if (a <= 0.002) discard;

    // 頭だけ色を変える。同じ色だと、どちらへ進んでいるのか読めない
    vec3 col = mix(uTint, uHeadTint, smoothstep(0.4, 1.0, a));
    gl_FragColor = vec4(col * a * uGain * holoGrain(gl_FragCoord.xy), 1.0);
    #include <colorspace_fragment>
  }
`
