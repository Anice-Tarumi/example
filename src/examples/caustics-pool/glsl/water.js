import { WAVES } from './waves'

/**
 * 底と水面。
 *
 * 底は焦線テクスチャを世界座標の xz で引く。uv ではなく世界座標にするのは、
 * **水面（別のメッシュ）から屈折して底を見るときも同じ場所を引く**ため。
 * uv で持つと、水越しの底と直に見える底で模様がずれる。
 */

/** 底のタイル。素材は持たず手続きで作る */
const FLOOR = /* glsl */`
  uniform sampler2D tCaustic;
  uniform float uPoolSize;
  uniform float uCausticGain;
  uniform float uSkylight;
  uniform vec3  uFloorA;
  uniform vec3  uFloorB;
  uniform float uTile;

  /*
   * 世界の xz から焦線テクスチャの uv へ。
   *
   * z の符号が反転する。焦線を焼くカメラは真下を向いていて、その上向きを
   * -z に取っているので、**画面の上が世界の -z** になる。ここを合わせないと
   * 網だけが前後反転して、水面の皺と噛み合わない。
   */
  vec2 causticUv(vec2 world) {
    return vec2(world.x / uPoolSize + 0.5, 0.5 - world.y / uPoolSize);
  }

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  /** 世界座標から底の色。焦線を掛ける前の素の色 */
  vec3 floorAlbedo(vec2 world) {
    vec2 g = world * uTile;
    vec2 cell = floor(g);
    vec2 f = fract(g);
    // 目地。両方向の縁を細く暗くする
    float grout = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float line = smoothstep(0.0, 0.045, grout);
    // タイルごとに焼きむらを入れる。均一だと印刷に見える
    float v = hash21(cell) * 0.14 - 0.07;
    return mix(uFloorB, uFloorA + v, line);
  }

  /**
   * 焦線。テクスチャの値は**平らな水面を 1 とした相対の明るさ**。
   * そのまま掛けると素直すぎるので、1 からの差を強調できるようにする。
   * テクスチャの外は水が無い扱いで 1 倍。
   */
  float causticAt(vec2 world) {
    vec2 uv = causticUv(world);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
    float d = texture2D(tCaustic, uv).r;
    /*
     * 底に届く光 = 空からの散乱 + 太陽が集まったぶん。
     *
     * **散乱を足さないと、網の外が真っ黒になる。** 実際のプールは、直射が
     * 当たらない所も空の光で見えている。散乱と直射の比を 1 に保てば、
     * 平らな水面のとき全体の明るさが変わらない。
     */
    return uSkylight + (1.0 - uSkylight) * d * uCausticGain;
  }
`

export const floorVertexShader = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export const floorFragmentShader = /* glsl */`
  precision highp float;
  ${FLOOR}

  uniform vec3 uWaterColor;
  uniform float uDepth;
  uniform float uAbsorb;

  varying vec3 vWorld;

  void main() {
    vec3 col = floorAlbedo(vWorld.xz) * causticAt(vWorld.xz);
    /*
     * 水の吸収。**深さに応じて赤から先に消える。** 一様に暗くすると
     * 濁った板に見え、水に見えない。
     */
    float path = uDepth;
    vec3 absorb = exp(-uAbsorb * path * (1.0 - uWaterColor));
    gl_FragColor = vec4(col * absorb, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * 水面。
 *
 * 底を別に描いてテクスチャへ取らない。**底は式で引ける**ので、屈折した先の
 * 座標を直接計算して同じ関数を呼ぶ。取り込みの一往復が省ける上、屈折が
 * 画面のずらしではなく本物の交点になる。
 */
export const waterVertexShader = /* glsl */`
  precision highp float;
  ${WAVES}

  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float h = waveHeight(w.xz);
    w.y += h;
    vWorld = w.xyz;
    // 法線は頂点で取る。面の分割より細かい皺は法線が持つ
    vNormal = waveNormal(w.xz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export const waterFragmentShader = /* glsl */`
  precision highp float;
  ${WAVES}
  ${FLOOR}

  uniform vec3  uSun;
  uniform vec3  uSunColor;
  uniform vec3  uSkyColor;
  uniform vec3  uWaterColor;
  uniform float uIor;
  uniform float uDepth;
  uniform float uAbsorb;
  uniform float uSpecular;
  uniform float uShine;

  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    /*
     * 法線は画素ごとに取り直す。頂点で渡した法線を補間すると、面の分割の
     * 粗さがそのまま出て、細かい皺が消える。
     */
    vec3 n = waveNormal(vWorld.xz);
    vec3 view = normalize(cameraPosition - vWorld);

    // 空気から水へ。視線を逆に辿るので -view を屈折させる
    vec3 refr = refract(-view, n, 1.0 / uIor);

    vec3 below = uSkyColor * 0.4;
    float path = uDepth;
    if (refr.y < -0.001) {
      // 底との交点。ここが「本物の屈折」で、画面をずらす手法との差
      float t = (vWorld.y + uDepth) / -refr.y;
      vec2 hit = vWorld.xz + refr.xz * t;
      below = floorAlbedo(hit) * causticAt(hit);
      path = t;
      below *= exp(-uAbsorb * path * (1.0 - uWaterColor));
    }

    /*
     * フレネル。Schlick 近似。水は正面から見ればほぼ透明で、
     * 寝かせるほど鏡になる。**これが無いと色つきガラスの板に見える。**
     */
    float f0 = pow((1.0 - uIor) / (1.0 + uIor), 2.0);
    float fres = f0 + (1.0 - f0) * pow(1.0 - max(dot(n, view), 0.0), 5.0);

    // 空の映り込み。上ほど明るい単純な勾配で足りる
    vec3 refl = mix(uSkyColor, uSkyColor * 1.35, clamp(reflect(-view, n).y, 0.0, 1.0));

    // 太陽の照り返し
    vec3 hvec = normalize(-normalize(uSun) + view);
    float spec = pow(max(dot(n, hvec), 0.0), uShine) * uSpecular;

    vec3 col = mix(below, refl, fres) + uSunColor * spec;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
