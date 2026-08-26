import * as THREE from 'three'
import {
  baseVertexShader,
  splatShader,
  curlShader,
  vorticityShader,
  divergenceShader,
  clearShader,
  pressureShader,
  gradientSubtractShader,
  advectionShader,
  displayShader,
} from './glsl/fluid'

function mat(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: baseVertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  })
}

/** 各パスのマテリアルを 1 度だけ生成する。uniform は呼び出し側が書き換える */
export function createMaterials() {
  return {
    splat: mat(splatShader, {
      texelSize: { value: new THREE.Vector2() },
      uTarget: { value: null },
      aspectRatio: { value: 1 },
      color: { value: new THREE.Vector3() },
      point: { value: new THREE.Vector2() },
      prevPoint: { value: new THREE.Vector2() },
      radius: { value: 0.25 },
    }),
    curl: mat(curlShader, {
      texelSize: { value: new THREE.Vector2() },
      uVelocity: { value: null },
    }),
    vorticity: mat(vorticityShader, {
      texelSize: { value: new THREE.Vector2() },
      uVelocity: { value: null },
      uCurl: { value: null },
      curl: { value: 30 },
      dt: { value: 1 / 60 },
    }),
    divergence: mat(divergenceShader, {
      texelSize: { value: new THREE.Vector2() },
      uVelocity: { value: null },
    }),
    clear: mat(clearShader, {
      texelSize: { value: new THREE.Vector2() },
      uTexture: { value: null },
      value: { value: 0.8 },
    }),
    pressure: mat(pressureShader, {
      texelSize: { value: new THREE.Vector2() },
      uPressure: { value: null },
      uDivergence: { value: null },
    }),
    gradientSubtract: mat(gradientSubtractShader, {
      texelSize: { value: new THREE.Vector2() },
      uPressure: { value: null },
      uVelocity: { value: null },
    }),
    advection: mat(advectionShader, {
      texelSize: { value: new THREE.Vector2() },
      dyeTexelSize: { value: new THREE.Vector2() },
      uVelocity: { value: null },
      uSource: { value: null },
      dt: { value: 1 / 60 },
      dissipation: { value: 0.2 },
    }),
    display: mat(displayShader, {
      texelSize: { value: new THREE.Vector2() },
      uTexture: { value: null },
      uVelocity: { value: null },
      uCurlTex: { value: null },
      uExposure: { value: 1 },
      uShadingAmount: { value: 0.35 },
      uMode: { value: 0 },
    }),
  }
}

export function disposeMaterials(materials) {
  for (const m of Object.values(materials)) m.dispose()
}
