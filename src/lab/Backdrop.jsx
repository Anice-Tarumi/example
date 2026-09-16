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

/*
 * 近景の塵。本家はここに **150,000 個**を詰めていた
 * （`work_page_config_particleCount`、体積は `[-1,1] × [-1,1] × [-0.5,0.5]`
 * の箱）。**地形ではなく板のすぐ周り**に濃く撒くのが要点で、
 * カーソルで空気がかき混ざって見えるのはこの層。
 *
 * 1 粒は極端に暗くする。加算で重ねるので、明るいまま数を増やすと
 * 画面全体が灰色の霧になって奥行きが消える。
 */
const DUST = 16000

export default function Backdrop({ tint = '#0b0c10', fluidRef }) {
  const points = useRef(null)

  const geometry = useMemo(() => {
    const pos = new Float32Array(DUST * 3)
    const seed = new Float32Array(DUST)
    /*
     * 乱数。**素朴な線形合同法は使わない。** 連続する 3 つの値を x, y, z に
     * 使うと、出た点が斜めの平面群に乗る（Marsaglia の格子）。実際それで
     * 塵が斜め縞に固まって、撒いた粒ではなく模様に見えた。
     */
    let s = 0x4f21
    const rand = () => {
      s |= 0
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    for (let i = 0; i < DUST; i++) {
      // 板が並ぶ帯を覆う箱。広げすぎると密度が落ちて塵に見えない
      pos[i * 3] = (rand() - 0.5) * 13
      pos[i * 3 + 1] = (rand() - 0.5) * 5.2
      pos[i * 3 + 2] = 1.6 - rand() * 5.2
      seed[i] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -1), 12)
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      tFluid: { value: null },
    },
    vertexShader: /* glsl */`
      precision highp float;
      attribute float aSeed;
      uniform float uTime;
      uniform sampler2D tFluid;
      varying float vDim;
      void main() {
        vec3 p = position;
        // ゆっくり漂う。止めると点を撒いた壁紙に見える
        p.x += sin(uTime * 0.07 + aSeed * 31.0) * 0.5;
        p.y += cos(uTime * 0.05 + aSeed * 17.0) * 0.32;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);

        /*
         * **板と同じ速度場で押す。** 本家の粒子に付いていた挙動は名前まで
         * "Mouse Fluid" で、板とまったく同じ tFluid を読んでいた
         * （target += flow * 0.0001 * uMouseStrength）。
         * 板だけ反応すると「板に効果が乗っている」に見えるが、
         * 周りの塵ごと流れると**空気をかき混ぜている**ように見える。
         */
        vec4 clip = projectionMatrix * mv;
        vec2 screenUv = clip.xy / max(0.001, clip.w) * 0.5 + 0.5;
        vec2 flow = texture2D(tFluid, screenUv).xy;
        // 頭打ちにする。速く撫でると速度は桁で跳ねて、塵が画面外へ飛ぶ
        mv.xy += clamp(flow * 0.0014, vec2(-1.0), vec2(1.0)) * 0.42;

        gl_Position = projectionMatrix * mv;
        // 奥ほど小さく暗い。遠近で厚みを出す
        float depth = clamp(-mv.z / 12.0, 0.0, 1.0);
        gl_PointSize = mix(2.0, 0.7, depth) * (0.6 + aSeed * 0.7);
        vDim = mix(0.075, 0.010, depth) * (0.4 + aSeed * 0.9);
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
    material.uniforms.tFluid.value = fluidRef?.current ?? null
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
