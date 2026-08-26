/**
 * MeshPhysicalMaterial の transmission を onBeforeCompile で差し替える。
 *
 * three は transmission を解くためにシーンを別 RT へ描き、
 * `transmissionSamplerMap` として渡してくる。その背景サンプルを
 *
 *   - RGB それぞれ別の IOR で引く → プリズム分散
 *   - サンプルごとに厚みをばらす   → 曇りガラス
 *   - mip 付き bicubic で引く      → 粗いガラスでもバンディングが出ない
 *
 * という形に拡張したもの。igloo.inc の氷マテリアルの移植。
 */

/** `#include <transmission_pars_fragment>` を置き換える宣言部 */
export const transmissionParsGLSL = /* glsl */`
  // three が transmission 用に用意する背景 RT。
  // pars を丸ごと差し替えるとこの宣言も消えるので、自分で宣言し直す。
  uniform sampler2D transmissionSamplerMap;
  uniform vec2 transmissionSamplerSize;

  uniform float uChromaticAberration;
  uniform float uThickness;
  uniform float uAttenuationDistance;
  uniform vec3  uAttenuationColor;
  uniform vec3  uFrostColor;
  uniform float uFrostAmount;
  uniform float uNoiseSeed;

  uniform mat4 modelMatrix;
  uniform mat4 projectionMatrix;

  varying vec3 vWorldPosition;

  // Mipped Bicubic Texture Filtering by N8
  // https://www.shadertoy.com/view/Dl2SDW
  float w0(float a) { return (1.0 / 6.0) * (a * (a * (-a + 3.0) - 3.0) + 1.0); }
  float w1(float a) { return (1.0 / 6.0) * (a * a * (3.0 * a - 6.0) + 4.0); }
  float w2(float a) { return (1.0 / 6.0) * (a * (a * (-3.0 * a + 3.0) + 3.0) + 1.0); }
  float w3(float a) { return (1.0 / 6.0) * (a * a * a); }
  float g0(float a) { return w0(a) + w1(a); }
  float g1(float a) { return w2(a) + w3(a); }
  float h0(float a) { return -1.0 + w1(a) / (w0(a) + w1(a)); }
  float h1(float a) { return 1.0 + w3(a) / (w2(a) + w3(a)); }

  vec4 bicubicSample(sampler2D tex, vec2 uv, vec4 texelSize, float lod) {
    uv = uv * texelSize.zw + 0.5;
    vec2 iuv = floor(uv);
    vec2 fuv = fract(uv);
    float g0x = g0(fuv.x); float g1x = g1(fuv.x);
    float h0x = h0(fuv.x); float h1x = h1(fuv.x);
    float h0y = h0(fuv.y); float h1y = h1(fuv.y);
    vec2 p0 = (vec2(iuv.x + h0x, iuv.y + h0y) - 0.5) * texelSize.xy;
    vec2 p1 = (vec2(iuv.x + h1x, iuv.y + h0y) - 0.5) * texelSize.xy;
    vec2 p2 = (vec2(iuv.x + h0x, iuv.y + h1y) - 0.5) * texelSize.xy;
    vec2 p3 = (vec2(iuv.x + h1x, iuv.y + h1y) - 0.5) * texelSize.xy;
    return g0(fuv.y) * (g0x * textureLod(tex, p0, lod) + g1x * textureLod(tex, p1, lod)) +
           g1(fuv.y) * (g0x * textureLod(tex, p2, lod) + g1x * textureLod(tex, p3, lod));
  }

  vec4 textureBicubicLod(sampler2D tex, vec2 uv, float lod) {
    vec2 fLodSize = vec2(textureSize(tex, int(lod)));
    vec2 cLodSize = vec2(textureSize(tex, int(lod + 1.0)));
    vec4 fSample = bicubicSample(tex, uv, vec4(1.0 / fLodSize, fLodSize), floor(lod));
    vec4 cSample = bicubicSample(tex, uv, vec4(1.0 / cLodSize, cLodSize), ceil(lod));
    return mix(fSample, cSample, fract(lod));
  }

  /**
   * サンプルごとに厚みをばらすためのディザ。高周波でよい
   * （サンプル数ぶん平均されるので、むしろバンディングが消える）。
   */
  vec4 hashNoise(vec2 p, float seed) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + seed);
    p3 += dot(p3, p3.yxz + 33.33);
    vec3 a = fract((p3.xxy + p3.yzz) * p3.zyx);
    return vec4(a, fract(a.x + a.y + a.z));
  }

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  /**
   * すりガラスの法線を散らす用。こちらは高周波だとピクセル単位でざらつくので
   * 低周波の value noise を使う。元実装はブルーノイズテクスチャを引いている。
   */
  vec3 surfaceJitter(vec2 p) {
    vec2 q = p * 0.035;
    return vec3(
      valueNoise2(q),
      valueNoise2(q + 41.7),
      valueNoise2(q + 93.1)
    ) - 0.5;
  }

  vec3 volumeTransmissionRay(vec3 n, vec3 v, float thickness, float ior, mat4 model) {
    vec3 refractionVector = refract(-v, normalize(n), 1.0 / ior);
    vec3 modelScale = vec3(
      length(model[0].xyz),
      length(model[1].xyz),
      length(model[2].xyz)
    );
    return normalize(refractionVector) * thickness * modelScale;
  }

  float iorToRoughness(float roughness, float ior) {
    return roughness * clamp(ior * 2.0 - 2.0, 0.0, 1.0);
  }

  /** Beer-Lambert 吸収。厚みぶんだけ色が抜ける */
  vec3 attenuate(float dist, vec3 color, float distance) {
    if (isinf(distance) || distance <= 0.0) return vec3(1.0);
    vec3 att = -log(clamp(color, vec3(0.0001), vec3(1.0))) / distance;
    return exp(-att * dist);
  }

  /**
   * 屈折した光線が背面から出る位置を求め、その画面座標で背景を引く。
   * three の getIBLVolumeRefraction と同じ流れだが、bicubic で引く点が違う。
   */
  vec4 refractThrough(
    vec3 n, vec3 v, float roughness,
    vec3 diffuseColor, vec3 specularColor, float specularF90,
    vec3 position, mat4 model, mat4 view, mat4 proj,
    float ior, float thickness, vec3 attenuationColor, float attenuationDistance
  ) {
    vec3 ray = volumeTransmissionRay(n, v, thickness, ior, model);
    vec3 exitPoint = position + ray;
    vec4 ndc = proj * view * vec4(exitPoint, 1.0);
    vec2 coords = (ndc.xy / ndc.w) * 0.5 + 0.5;

    // 粗いほど高い mip を引く＝ぼけた背景になる
    float lod = log2(float(textureSize(transmissionSamplerMap, 0).x))
              * iorToRoughness(roughness, ior);
    vec4 transmittedLight = textureBicubicLod(transmissionSamplerMap, coords, lod);

    vec3 transmittance = diffuseColor * attenuate(length(ray), attenuationColor, attenuationDistance);
    vec3 attenuatedColor = transmittance * transmittedLight.rgb;
    vec3 F = EnvironmentBRDF(n, v, specularColor, specularF90, roughness);
    float factor = (transmittance.r + transmittance.g + transmittance.b) / 3.0;

    return vec4((1.0 - F) * attenuatedColor, 1.0 - (1.0 - transmittedLight.a) * factor);
  }
`

/**
 * `#include <transmission_fragment>` を置き換える本体。
 * numSamples を増やすほど曇りが滑らかになるが、その回数だけ背景を引き直す。
 */
export function transmissionFragmentGLSL(numSamples) {
  const n = Math.max(1, Math.round(numSamples))
  return /* glsl */`
    material.transmission = 0.0;
    material.transmissionAlpha = 1.0;
    material.thickness = uThickness;
    material.attenuationDistance = uAttenuationDistance;
    material.attenuationColor = uAttenuationColor;

    {
      vec3 pos = vWorldPosition;
      vec3 v = normalize(cameraPosition - pos);
      vec3 n = inverseTransformDirection(normal, viewMatrix);

      vec4 transmitted = vec4(0.0);
      float total = ${n}.0;

      // 厚みをサンプルごとにずらす量。粗いほど大きく散らす
      float smear = uThickness * pow(max(roughnessFactor, 0.001), 0.33);

      vec4 nz = hashNoise(gl_FragCoord.xy, uNoiseSeed);

      // 粗さに応じて法線を散らす＝すりガラス
      vec3 distortion = roughnessFactor * roughnessFactor * 1.4 * normalize(surfaceJitter(gl_FragCoord.xy));
      vec3 sampleNorm = normalize(n + distortion);

      for (float i = 0.0; i < ${n}.0; i++) {
        // R / G / B を別々の IOR で引くことで分散させる。
        // UV をずらすだけの疑似分散と違い、屈折そのものが波長ごとに変わる。
        transmitted.r += refractThrough(
          sampleNorm, v, material.roughness, material.diffuseColor,
          material.specularColor, material.specularF90,
          pos, modelMatrix, viewMatrix, projectionMatrix,
          material.ior,
          uThickness + smear * (i + nz.g) / total,
          uAttenuationColor, uAttenuationDistance
        ).r;

        transmitted.g += refractThrough(
          sampleNorm, v, material.roughness, material.diffuseColor,
          material.specularColor, material.specularF90,
          pos, modelMatrix, viewMatrix, projectionMatrix,
          material.ior * (1.0 + uChromaticAberration * (i + nz.r) / total),
          uThickness + smear * (i + nz.r) / total,
          uAttenuationColor, uAttenuationDistance
        ).g;

        transmitted.b += refractThrough(
          sampleNorm, v, material.roughness, material.diffuseColor,
          material.specularColor, material.specularF90,
          pos, modelMatrix, viewMatrix, projectionMatrix,
          material.ior * (1.0 + 2.0 * uChromaticAberration * (i + nz.b) / total),
          uThickness + smear * (i + nz.b) / total,
          uAttenuationColor, uAttenuationDistance
        ).b;
      }

      transmitted /= total;
      transmitted.a = 1.0;

      // 表面の霜。フレネル的に縁ほど白く濁らせる
      float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
      transmitted.rgb = mix(transmitted.rgb, uFrostColor, fres * uFrostAmount);

      totalDiffuse = clamp(transmitted.rgb, vec3(0.0), vec3(1.0));
    }
  `
}

/** 頂点側。three は USE_TRANSMISSION 時に vWorldPosition を用意する */
export const transmissionUniforms = () => ({
  uChromaticAberration: { value: 0.1 },
  uThickness: { value: 2 },
  uAttenuationDistance: { value: 4 },
  uAttenuationColor: { value: null },
  uFrostColor: { value: null },
  uFrostAmount: { value: 0.25 },
  uNoiseSeed: { value: 0 },
})
