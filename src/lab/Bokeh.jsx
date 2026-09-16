/* eslint-disable react-hooks/immutability */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * 漂うボケ玉。
 *
 * 本家の画面を実際に撮って並べて分かったこと。**あちらの粒は塵ではなく
 * ボケ玉**だった。大小がばらばらの柔らかい円盤が、房になって漂っている。
 * こちらが撒いていた 1 画素の点は、いくら数を増やしても均一な靄にしか
 * ならず、これが「安っぽい」の主因だった。
 *
 * ボケ玉に見せるのに要るのは 3 つ。
 *
 *   1. **大きさをばらけさせる。** 揃うと模様になる。3 乗で偏らせて、
 *      ごく一部だけ大きく
 *   2. **縁を少し明るくする。** 実際のボケは縁に輪が出る。輪が無いと
 *      ただのぼかした丸
 *   3. **大きいほど暗くする。** 同じ明るさだと大玉が白飛びして、
 *      画面に穴が空く
 *
 * 色は置かない（本家の彩度は映像の中身から来ている）。冷たい側へ
 * わずかに振るだけ。
 */

/** 房の数。塊で置く。一様に撒くと空間ではなく壁紙になる */
const CLUSTERS = 22
const PER_CLUSTER = 80

export default function Bokeh({ fluidRef }) {
  const geometry = useMemo(() => {
    const total = CLUSTERS * PER_CLUSTER
    const pos = new Float32Array(total * 3)
    /** x: 大きさ / y: 明るさ / z: 位相 */
    const attr = new Float32Array(total * 3)

    /*
     * 乱数。線形合同法は使わない。連続する 3 値を x, y, z に充てると
     * 点が斜めの平面群に乗る（Marsaglia の格子）。
     */
    let s = 0x91f3
    const rand = () => {
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    let k = 0
    for (let c = 0; c < CLUSTERS; c++) {
      // 房の中心。板の帯を避けて、手前と奥に散らす
      const cx = (rand() - 0.5) * 20
      const cy = (rand() - 0.5) * 8
      /*
       * **板より奥に置く。** 手前に湧かせると、玉が主役になって板が
       * 見えなくなる（実際そうなって、泡の写真のようになった）。
       */
      const cz = -0.8 - rand() * 8.5
      const spread = 1.0 + rand() * 2.4
      for (let i = 0; i < PER_CLUSTER; i++) {
        // 房の中は中心に寄せる。均一に詰めると球に見える
        const r = Math.pow(rand(), 1.7) * spread
        const a = rand() * Math.PI * 2
        const b = (rand() - 0.5) * Math.PI
        pos[k * 3] = cx + Math.cos(a) * Math.cos(b) * r
        pos[k * 3 + 1] = cy + Math.sin(b) * r * 0.7
        pos[k * 3 + 2] = cz + Math.sin(a) * Math.cos(b) * r
        // 大きさは 3 乗で偏らせる。大玉はごく一部
        attr[k * 3] = Math.pow(rand(), 3)
        attr[k * 3 + 1] = 0.35 + rand() * 0.65
        attr[k * 3 + 2] = rand()
        k++
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aAttr', new THREE.BufferAttribute(attr, 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -4), 20)
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    // 深度は書かない。書くと後段の被写界深度が玉を近景と誤認する
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uProj: { value: 800 },
      tFluid: { value: null },
    },
    vertexShader: /* glsl */`
      precision highp float;
      attribute vec3 aAttr;
      uniform float uTime;
      uniform float uProj;
      uniform sampler2D tFluid;
      varying float vBright;
      varying float vBig;

      void main() {
        vec3 p = position;
        float ph = aAttr.z * 6.2831;
        // ゆっくり漂う。止めると点を撒いた壁紙に見える
        p.x += sin(uTime * 0.09 + ph) * 0.30;
        p.y += cos(uTime * 0.07 + ph * 1.7) * 0.22;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;

        /*
         * 板と同じ速度場で押す。本家の粒子の挙動コードは名前まで
         * "Mouse Fluid" で、板とまったく同じ速度場を読んでいた。
         * 板だけ反応すると効果が板に乗っているだけに見えるが、
         * 周りの玉ごと流れると空気をかき混ぜているように見える。
         */
        vec4 clip = projectionMatrix * mv;
        vec2 screenUv = clip.xy / max(0.001, clip.w) * 0.5 + 0.5;
        vec2 flow = texture2D(tFluid, screenUv).xy;
        // 頭打ちにする。速く撫でると速度は桁で跳ねて、玉が画面外へ飛ぶ
        mv.xy += clamp(flow * 0.0016, vec2(-1.0), vec2(1.0)) * 0.5;

        gl_Position = projectionMatrix * mv;

        float big = aAttr.x;
        vBig = big;
        // 世界での大きさを投影する。遠近が効かないと張り付いて見える
        float world = mix(0.032, 0.30, big);
        gl_PointSize = clamp(world * uProj / max(0.6, dist), 1.0, 84.0);

        /*
         * 大きいほど暗く。同じ明るさで大玉を出すと白く飛んで、
         * 画面に穴が空いたように見える。
         */
        float haze = exp(-dist * 0.045);
        vBright = aAttr.y * haze * mix(0.42, 0.055, big);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vBright;
      varying float vBig;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;

        /*
         * 縁に輪を出す。実際のボケは絞りの形で縁が明るい。
         * 輪が無いと、ただの「ぼかした丸」で作り物に見える。
         * 小さい玉には輪を出さない（1 画素に輪は乗らない）。
         */
        float core = smoothstep(0.5, 0.36, r);
        float ring = smoothstep(0.34, 0.5, r) * smoothstep(0.5, 0.46, r);
        float a = core * (0.72 + ring * 1.9 * smoothstep(0.15, 0.5, vBig));

        // 色は置かない。冷たい側へわずかに振るだけ
        gl_FragColor = vec4(vec3(0.62, 0.68, 0.80) * a * vBright, 1.0);
      }
    `,
  }), [])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.tFluid.value = fluidRef?.current ?? null
    const tan = Math.tan((state.camera.fov * Math.PI) / 360)
    material.uniforms.uProj.value = state.size.height / (2 * tan)
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-40} />
}
