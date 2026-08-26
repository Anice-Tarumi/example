/**
 * シーン側のマテリアル。MRT で 2 枚同時に書き出す。
 *
 *   textures[0] : rgb = 陰影付きの色, a = surfaceId（面 ID）
 *   textures[1] : r = 深度, gb = spheremap 法線, a = 輪郭を出すマスク
 *
 * ID を 1 枚目のアルファに潜ませているので、追加のバッファが要らない。
 * この ID があると、深度も法線も連続な場所（同じ平面上の素材の切り替わり）にも
 * 線を引ける。深度 + 法線の Sobel だけでは出せない線。
 */

export const normalCodecGLSL = /* glsl */`
  /** 法線を 2 成分に潰す。vec4 1 枚に深度・法線・マスクを詰めるため */
  vec2 encodeNormalSpheremap(vec3 n) {
    float f = sqrt(8.0 * n.z + 8.0);
    return n.xy / f + 0.5;
  }

  vec3 decodeNormalSpheremap(vec2 enc) {
    vec2 fenc = enc * 4.0 - 2.0;
    float f = dot(fenc, fenc);
    float g = sqrt(1.0 - f / 4.0);
    return vec3(fenc * g, 1.0 - f / 2.0);
  }
`

export const gbufferVertexShader = /* glsl */`
  precision highp float;

  // RawShaderMaterial なので three は何も足してくれない。全部自分で宣言する
  in vec3 position;
  in vec3 normal;

  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;

  out vec3 vNormalView;
  out vec3 vWorldPos;
  out vec2 vHighPrecisionZW;
  out float vViewZ;

  void main() {
    vNormalView = normalize(normalMatrix * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;

    vec4 mv = viewMatrix * world;
    vViewZ = -mv.z;

    gl_Position = projectionMatrix * mv;
    // 深度を高精度で渡すため zw をそのまま varying する
    vHighPrecisionZW = gl_Position.zw;
  }
`

export const gbufferFragmentShader = /* glsl */`
  precision highp float;

  // ShaderMaterial だと three が location 0 を prefix で宣言してしまい、
  // 自前の location 1 と組み合わせたときに描画されなくなる。
  // RawShaderMaterial にして両方を自分で宣言する。
  layout(location = 0) out highp vec4 gColor;
  layout(location = 1) out highp vec4 gInfo;

  uniform vec3  uColor;
  uniform vec3  uShadowColor;
  uniform vec3  uLightDir;
  uniform float uSurfaceId;
  uniform float uOutlineMask;
  uniform float uSteps;
  uniform float uSketch;
  uniform float uTime;

  in vec3 vNormalView;
  in vec3 vWorldPos;
  in vec2 vHighPrecisionZW;
  in float vViewZ;

${normalCodecGLSL}

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float valueNoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i);
    float n100 = hash31(i + vec3(1, 0, 0));
    float n010 = hash31(i + vec3(0, 1, 0));
    float n110 = hash31(i + vec3(1, 1, 0));
    float n001 = hash31(i + vec3(0, 0, 1));
    float n101 = hash31(i + vec3(1, 0, 1));
    float n011 = hash31(i + vec3(0, 1, 1));
    float n111 = hash31(i + vec3(1, 1, 1));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 n = normalize(vNormalView);

    // トゥーン陰影。段数で量子化する
    float ndl = dot(normalize(vNormalView), normalize(uLightDir)) * 0.5 + 0.5;
    float stepped = floor(ndl * uSteps) / max(uSteps - 1.0, 1.0);
    vec3 color = mix(uShadowColor, uColor, clamp(stepped, 0.0, 1.0));

    // 輪郭を出すかどうか。ノイズで間引くと手描きのかすれになる
    float mask = uOutlineMask;
    if (uSketch > 0.0) {
      float nz = valueNoise3(vWorldPos * 6.0 + uTime * 0.05);
      mask *= step(uSketch * 0.5, nz);
    }

    // 1 枚目: 色 + 面 ID
    gColor = vec4(color, uSurfaceId);

    // 2 枚目: 深度 + 法線 + マスク
    float depth = 1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5);
    gInfo = vec4(depth, encodeNormalSpheremap(n), mask);
  }
`
