/**
 * 解析的な面光源ライティング。
 *
 * 点光源しか無い世界では、ハイライトは常に点にしかならない。
 * 現実の光は必ず面積を持つので、蛍光灯は細長く、電球は丸く映り込む。
 *
 * ふつうこれを出すには
 *   - IBL 用の環境マップを焼く
 *   - LTC（Linearly Transformed Cosines）の 2 枚のルックアップテーブルを読む
 * のどちらかを使うが、ここは **閉じた式だけ**で解く。テクスチャは 1 枚も要らない。
 *
 *   1. 拡散  … 球光源の放射照度は解析解がある
 *   2. 鏡面  … MRP（最も寄与する代表点）へ光源を潰して点光源として解き、
 *              広がったぶんだけ正規化して明るさを保つ
 *   3. 遮蔽  … 近くの球が視半球をどれだけ塞ぐかを立体角で求める
 *
 * 3 番が「近接」の部分。シャドウマップを持たずに、
 * 物が接している場所が締まる（コンタクトシャドウ）。
 */

export const litVertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const litFragmentShader = /* glsl */ `
  precision highp float;

  #define MAX_OCCLUDERS 6

  uniform vec3  uCameraPos;
  uniform vec3  uBaseColor;
  uniform float uRoughness;
  uniform float uMetalness;

  uniform int   uLightType;     // 0: 球 1: 管 2: 矩形
  uniform vec3  uLightPos;
  uniform vec3  uLightColor;
  uniform float uLightPower;
  uniform float uLightRadius;   // 球の半径 / 管の太さ
  uniform vec3  uLightAxis;     // 管の向き（長さ = 半分の長さ）
  uniform vec3  uLightRight;    // 矩形の横（長さ = 半分の幅）
  uniform vec3  uLightUp;       // 矩形の縦（長さ = 半分の高さ）

  uniform vec3  uAmbient;
  uniform float uOcclusion;     // 近接遮蔽の強さ
  uniform int   uOccluderCount;
  uniform vec4  uOccluders[MAX_OCCLUDERS];  // xyz = 中心, w = 半径

  varying vec3 vWorld;
  varying vec3 vNormal;

  const float PI = 3.14159265359;

  /** ACES の近似。tonemapping_fragment チャンクは pars が要るので自前で持つ */
  vec3 acesFilmic(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  // ---- GGX ----------------------------------------------------------------

  float distributionGGX(float ndoth, float a) {
    float a2 = a * a;
    float d = ndoth * ndoth * (a2 - 1.0) + 1.0;
    return a2 / max(PI * d * d, 1e-7);
  }

  float geometrySmith(float ndotv, float ndotl, float a) {
    float k = (a + 1.0) * (a + 1.0) / 8.0;
    float gv = ndotv / (ndotv * (1.0 - k) + k);
    float gl = ndotl / (ndotl * (1.0 - k) + k);
    return gv * gl;
  }

  vec3 fresnelSchlick(float vdoth, vec3 f0) {
    return f0 + (1.0 - f0) * pow(clamp(1.0 - vdoth, 0.0, 1.0), 5.0);
  }

  // ---- 光源の形 -------------------------------------------------------------

  /** 線分上で点 p に最も近い位置 */
  vec3 closestOnSegment(vec3 p, vec3 center, vec3 halfAxis) {
    float len = length(halfAxis);
    if (len < 1e-5) return center;
    vec3 dir = halfAxis / len;
    float t = clamp(dot(p - center, dir), -len, len);
    return center + dir * t;
  }

  /** 矩形上で点 p に最も近い位置 */
  vec3 closestOnRect(vec3 p, vec3 center, vec3 halfRight, vec3 halfUp) {
    vec3 d = p - center;
    float lr = length(halfRight);
    float lu = length(halfUp);
    vec3 r = lr > 1e-5 ? halfRight / lr : vec3(1.0, 0.0, 0.0);
    vec3 u = lu > 1e-5 ? halfUp / lu : vec3(0.0, 1.0, 0.0);
    return center + r * clamp(dot(d, r), -lr, lr) + u * clamp(dot(d, u), -lu, lu);
  }

  /**
   * MRP（most representative point）。
   *
   * 反射ベクトルに最も近い光源上の点へ光源を潰し、そこにある点光源として解く。
   * 面光源を積分するかわりの近似だが、ハイライトの**形**は光源の形になる。
   * 潰したぶん明るさが変わるので、正規化係数で戻す。
   */
  vec3 representativePoint(vec3 pos, vec3 refl, out float sphereRadius) {
    sphereRadius = uLightRadius;

    if (uLightType == 0) {
      // 球。反射レイに最も近い球面上の点
      vec3 toLight = uLightPos - pos;
      vec3 onRay = refl * max(dot(toLight, refl), 0.0);
      vec3 toRay = onRay - toLight;
      float len = length(toRay);
      return uLightPos + toRay * (min(len, uLightRadius) / max(len, 1e-5));
    }

    if (uLightType == 1) {
      // 管。まず芯線上の最近点を取り、そこを中心の球として扱う
      vec3 onAxis = closestOnSegment(pos + refl * dot(uLightPos - pos, refl), uLightPos, uLightAxis);
      vec3 toLight = onAxis - pos;
      vec3 onRay = refl * max(dot(toLight, refl), 0.0);
      vec3 toRay = onRay - toLight;
      float len = length(toRay);
      return onAxis + toRay * (min(len, uLightRadius) / max(len, 1e-5));
    }

    // 矩形。面と反射レイの交点を面内へ丸める
    vec3 n = normalize(cross(uLightRight, uLightUp));
    float denom = dot(refl, n);
    vec3 hit;
    if (abs(denom) > 1e-4) {
      float t = dot(uLightPos - pos, n) / denom;
      hit = pos + refl * max(t, 0.0);
    } else {
      hit = uLightPos;
    }
    sphereRadius = max(uLightRadius, 0.02);
    return closestOnRect(hit, uLightPos, uLightRight, uLightUp);
  }

  /**
   * 球光源の拡散（放射照度）。
   *
   * 半径 r の球が距離 d にあるとき、面が受ける放射照度には閉じた式がある。
   * 光源が地平線をまたぐ場合も式で扱えるので、点光源のように
   * 「真横で急にゼロ」にならず、ふわりと回り込む。
   *
   * Frostbite の illuminanceSphereOrDisk と同じ形。
   */
  float sphereIlluminance(vec3 n, vec3 pos, vec3 lightPos, float radius) {
    vec3 toLight = lightPos - pos;
    float d = max(length(toLight), radius + 1e-4);
    vec3 l = toLight / d;

    float cosTheta = clamp(dot(n, l), -0.999, 0.999);
    float sinSigmaSqr = min(radius * radius / (d * d), 0.9999);

    // 光源が完全に地平線の上にある
    if (cosTheta * cosTheta > sinSigmaSqr) {
      return PI * sinSigmaSqr * clamp(cosTheta, 0.0, 1.0);
    }

    // 地平線をまたいでいる。見えている部分だけを積分した式
    float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
    float x = sqrt(max(1.0 / sinSigmaSqr - 1.0, 1e-6));
    float y = -x * (cosTheta / max(sinTheta, 1e-4));
    float e = sinTheta * sqrt(max(1.0 - y * y, 0.0));

    float value = (cosTheta * acos(clamp(y, -1.0, 1.0)) - x * e) * sinSigmaSqr + atan(e / x);
    return max(value, 0.0);
  }

  /**
   * 近接遮蔽。
   *
   * 半径 r の球が距離 d にあるとき、その球が張る立体角は
   *   Ω = 2π (1 - cos α),  sin α = r / d
   * で閉じている。これを法線方向の余弦で重み付ければ、
   * 「その球にどれだけ空を塞がれているか」がテクスチャなしで出る。
   *
   * シャドウマップと違って影の形は出ないが、
   * 物が接している場所が締まる効果（コンタクトシャドウ）はこれで十分出る。
   */
  float proximityOcclusion(vec3 n, vec3 pos) {
    float visible = 1.0;
    for (int i = 0; i < MAX_OCCLUDERS; i++) {
      if (i >= uOccluderCount) break;
      vec3 c = uOccluders[i].xyz;
      float r = uOccluders[i].w;

      vec3 toC = c - pos;
      float d = length(toC);
      if (d < 1e-4 || d > 40.0) continue;

      float sinAlpha = min(r / d, 0.9999);
      // 立体角を半球（2π）で割った比
      float solid = 1.0 - sqrt(1.0 - sinAlpha * sinAlpha);
      // 法線から見て裏側にあるものは空を塞がない
      float facing = clamp(dot(n, toC / d), 0.0, 1.0);
      visible *= 1.0 - clamp(solid * facing, 0.0, 1.0);
    }
    return mix(1.0, visible, uOcclusion);
  }

  /**
   * 管・矩形を「投影面積の等しい円板」に置き換えたときの半径。
   *
   * 最近点にある半径 r の球として扱うと、長さや面積の寄与が丸ごと落ちて暗くなる。
   * シルエットの面積が同じ円の半径に直せば、明るさの桁が合う。
   *   管   … 幅 2r × 長さ 2L⊥ のスタジアム形 → πr² + 4rL⊥
   *   矩形 … 面積 × 光源方向との傾き
   */
  float effectiveRadius(vec3 pos, vec3 lightPoint) {
    float r = max(uLightRadius, 0.02);
    if (uLightType == 0) return r;

    vec3 l = normalize(lightPoint - pos);

    if (uLightType == 1) {
      // 視線に垂直な向きに投影した半長
      float perp = length(uLightAxis - l * dot(uLightAxis, l));
      return sqrt(r * r + 4.0 * r * perp / PI);
    }

    vec3 nrm = normalize(cross(uLightRight, uLightUp));
    float facing = abs(dot(nrm, l));
    float area = 4.0 * length(uLightRight) * length(uLightUp) * facing;
    return sqrt(max(area, 1e-4) / PI);
  }

  // ---- 本体 -----------------------------------------------------------------

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(uCameraPos - vWorld);
    if (dot(n, v) < 0.0) n = -n;

    float rough = clamp(uRoughness, 0.03, 1.0);
    float a = rough * rough;

    vec3 f0 = mix(vec3(0.04), uBaseColor, uMetalness);
    vec3 albedo = uBaseColor * (1.0 - uMetalness);

    vec3 refl = reflect(-v, n);

    // --- 鏡面。MRP へ潰してから正規化 ---
    float mrpRadius;
    vec3 mrp = representativePoint(vWorld, refl, mrpRadius);
    vec3 lv = mrp - vWorld;
    float dist = max(length(lv), 1e-4);
    vec3 l = lv / dist;

    vec3 h = normalize(l + v);
    float ndotl = max(dot(n, l), 0.0);
    float ndotv = max(dot(n, v), 1e-4);
    float ndoth = max(dot(n, h), 0.0);
    float vdoth = max(dot(v, h), 0.0);

    // 光源を潰したぶん、粗さを広げて明るさを保つ（球面正規化）
    float widened = clamp(a + mrpRadius / (3.0 * dist), 0.0, 1.0);
    float norm = (a / widened) * (a / widened);

    float ndf = distributionGGX(ndoth, widened);
    float geo = geometrySmith(ndotv, ndotl, rough);
    vec3 fres = fresnelSchlick(vdoth, f0);
    vec3 spec = ndf * geo * fres * norm / max(4.0 * ndotv * ndotl, 1e-4) * ndotl;

    /*
     * 距離減衰。拡散側は sphereIlluminance の中に r²/d² が入っているが、
     * 鏡面側は MRP を点光源として解いた素の値なので入っていない。
     * 同じ立体角の比を掛けて、遠くのハイライトだけ明るいままになるのを防ぐ。
     */
    float specR = effectiveRadius(vWorld, mrp);
    float solidAngle = min(specR * specR / (dist * dist), 1.0);
    spec *= PI * solidAngle;

    // --- 拡散。球光源の解析解 ---
    // 管と矩形は「最近点にある、投影面積の等しい円板」として解く
    vec3 lightPoint = uLightPos;
    if (uLightType == 1) lightPoint = closestOnSegment(vWorld, uLightPos, uLightAxis);
    else if (uLightType == 2) lightPoint = closestOnRect(vWorld, uLightPos, uLightRight, uLightUp);

    float rEff = effectiveRadius(vWorld, lightPoint);
    float diffTerm = sphereIlluminance(n, vWorld, lightPoint, rEff);

    float occ = proximityOcclusion(n, vWorld);

    vec3 radiance = uLightColor * uLightPower;
    vec3 color = (albedo / PI * diffTerm + spec) * radiance * occ;
    color += uAmbient * albedo * occ;

    gl_FragColor = vec4(acesFilmic(color), 1.0);
    #include <colorspace_fragment>
  }
`
