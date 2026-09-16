/* eslint-disable react-hooks/immutability */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * 板の後ろの空間。
 *
 * 本家を読んで分かったのは、**質感を作っているのは板ではなく背景**という
 * こと（あちらはフォトグラメトリの点群と粒子）。真っ黒の上に板を置くと、
 * どれだけ板を凝っても「黒地に長方形」にしかならない。
 *
 * ただし派手にはしない。**濃淡と粒だけ。** 色は置かない。
 */

const DUST = 700

export default function Backdrop({ tint = '#0b0c10' }) {
  const points = useRef(null)

  const geometry = useMemo(() => {
    const pos = new Float32Array(DUST * 3)
    const seed = new Float32Array(DUST)
    let s = 0x4f21
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = (rand() - 0.5) * 26
      pos[i * 3 + 1] = (rand() - 0.5) * 12
      // 奥へ厚く撒く。薄いと 1 枚の膜に見える
      pos[i * 3 + 2] = -1 - rand() * 16
      seed[i] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      precision highp float;
      attribute float aSeed;
      uniform float uTime;
      varying float vDim;
      void main() {
        vec3 p = position;
        // ゆっくり漂う。止めると点を撒いた壁紙に見える
        p.x += sin(uTime * 0.07 + aSeed * 31.0) * 0.5;
        p.y += cos(uTime * 0.05 + aSeed * 17.0) * 0.32;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // 奥ほど小さく暗い。遠近で厚みを出す
        float depth = clamp(-mv.z / 22.0, 0.0, 1.0);
        gl_PointSize = mix(2.4, 0.7, depth) * (0.6 + aSeed * 0.8);
        vDim = mix(0.34, 0.05, depth) * (0.4 + aSeed * 0.9);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vDim;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25) discard;
        gl_FragColor = vec4(vec3(0.62, 0.66, 0.74) * smoothstep(0.25, 0.0, d) * vDim, 1.0);
      }
    `,
  }), [])
  useEffect(() => () => material.dispose(), [material])

  const grad = useMemo(() => new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { uTint: { value: new THREE.Color(tint) } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // 画面いっぱいに置く。行列を通さない
        gl_Position = vec4(position.xy * 2.0, 0.99999, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uTint;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - vec2(0.5, 0.56);
        // 中央をわずかに持ち上げるだけ。板が座る場所を作る
        float v = smoothstep(0.85, 0.0, length(p * vec2(0.8, 1.25)));
        gl_FragColor = vec4(uTint + vec3(0.035, 0.038, 0.05) * v, 1.0);
        #include <colorspace_fragment>
      }
    `,
  }), [tint])
  useEffect(() => () => grad.dispose(), [grad])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <>
      <mesh material={grad} frustumCulled={false} renderOrder={-100}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={-50} />
    </>
  )
}
