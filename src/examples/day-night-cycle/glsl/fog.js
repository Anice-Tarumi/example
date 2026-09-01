/**
 * 二色のグラデーションフォグ。
 *
 * three の霧は単色。遠景が全部同じ色に沈むので、朝夕でも「灰色に霞む」
 * 以上のことが起きない。実際は**太陽の側だけ霧が明るく色づく**。
 * 逆光の霞みと順光の霞みが同じ色をしている絵は、必ず嘘に見える。
 *
 * 組み込みの `fog_fragment` を差し替えて、視線方向と太陽方向の内積で
 * 2 色を混ぜる。霧の密度計算そのものは three のものをそのまま使う。
 */

const FOG_FRAGMENT = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif

  // 太陽の側ほど uFogSun に寄る
  float sunAmount = pow(max(dot(normalize(vFogWorldDir), normalize(uFogSunDir)), 0.0), uFogSunPower);
  vec3 fogTint = mix(fogColor, uFogSun, sunAmount);

  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogTint, fogFactor);
#endif
`

/**
 * マテリアルに差し込む。`uniforms` はページ側で共有しているオブジェクトを渡す。
 * three は onBeforeCompile ごとにプログラムを分けないので、cache key も変える。
 */
export function patchFog(material, uniforms, key = 'gradient-fog') {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\n varying vec3 vFogWorldDir;')
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
         vFogWorldDir = (modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <fog_pars_fragment>',
        `#include <fog_pars_fragment>
         varying vec3 vFogWorldDir;
         uniform vec3  uFogSun;
         uniform vec3  uFogSunDir;
         uniform float uFogSunPower;`,
      )
      .replace('#include <fog_fragment>', FOG_FRAGMENT)
  }
  material.customProgramCacheKey = () => key
  material.needsUpdate = true
  return material
}
