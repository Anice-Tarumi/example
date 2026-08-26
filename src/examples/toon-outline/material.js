import * as THREE from 'three'
import { gbufferVertexShader, gbufferFragmentShader } from './glsl/gbuffer'

/** G-Buffer へ書き出すマテリアルを作る */
export function createGBufferMaterial({ color, shadowColor, surfaceId, outlineMask = 1 }) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: gbufferVertexShader,
    fragmentShader: gbufferFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uShadowColor: { value: new THREE.Color(shadowColor) },
      uLightDir: { value: new THREE.Vector3(0.5, 0.9, 0.4).normalize() },
      uSurfaceId: { value: surfaceId },
      uOutlineMask: { value: outlineMask },
      uSteps: { value: 3 },
      uSketch: { value: 0 },
      uTime: { value: 0 },
    },
  })
}
