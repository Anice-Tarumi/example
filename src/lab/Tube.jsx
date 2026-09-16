/* eslint-disable react-hooks/immutability */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * 場面を囲む発光の筒。
 *
 * 本家の設定に `World.TUBE` という要素があり、`WorkTubeShader` を加算で
 * 貼っていた。中身は取得して読んだとおり、これだけ。
 *
 *   noise = fract(worldPos.y * 0.2 + time * 0.3);
 *   noise = smoothstep(0.5, 0.0, abs(noise - 0.5));
 *   color = vec3(pow(noise, 5.0));
 *
 * つまり**上下に流れる細い光の輪**。凝った物ではないが、これが無いと
 * 場面に光源がひとつも無く、ブルームが拾う物も無い。暗いだけの空間に
 * 板が浮いている絵になる（実際そうなっていた）。
 */

/** 光の輪の間隔。本家の 0.2 は「5 世界単位に 1 本」 */
const BAND = 0.16

/*
 * 筒は**遠くに置く。** 近いと輪が視界を横切る巨大な白い帯になり、
 * 抑えたトーンが一気に崩れる（半径 13 で試したらそうなった）。
 * 遠ければ、被写界深度でぼけた淡い光の層として効く。
 */
export default function Tube({ radius = 24, height = 60 }) {
  const geometry = useMemo(() => {
    // 内側から見る筒。蓋は要らない
    const geo = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true)
    return geo
  }, [radius, height])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    // **深度を書かない。** 書くと後段の被写界深度が筒を近景と誤認する
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      precision highp float;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime;
      varying vec3 vWorldPos;
      void main() {
        float n = fract(vWorldPos.y * ${BAND.toFixed(2)} + uTime * 0.3);
        n = smoothstep(0.5, 0.0, abs(n - 0.5));
        // 高い乗数で輪を細く鋭くする。低いと縞模様の壁になる
        float band = pow(n, 9.0);
        /*
         * 上下の端を落とす。**切りっぱなしにしない。** 筒の縁が直線の境目
         * として見えると、ただの円筒が置いてあると分かってしまう。
         */
        float fade = smoothstep(${(height / 2).toFixed(1)}, ${(height / 4).toFixed(1)}, abs(vWorldPos.y));
        gl_FragColor = vec4(vec3(0.42, 0.50, 0.62) * band * fade * 0.16, 1.0);
      }
    `,
  }), [height])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-60} />
}
