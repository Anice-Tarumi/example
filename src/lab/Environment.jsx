/* eslint-disable react-hooks/immutability */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * 板の後ろに置く空間。
 *
 * 本家はフォトグラメトリの点群（3MB の .bin）を置いている。こちらは他所の
 * 走査データを使えないので、**同じ「点で出来た地形」を手続きで作る**。
 *
 * 要点は 3 つ。
 *
 *   1. **構造を持たせる。** 一様に撒いた粒は霧で、空間にならない。
 *      地面・柱・散乱物のように役割の違う塊を混ぜる
 *   2. **奥ほど沈める。** 霞が無いと、遠い点も近い点も同じ濃さで並んで
 *      奥行きが消える
 *   3. **色を置かない。** 濃淡だけ。トーンを上げるのは密度で、彩度ではない
 */

const GROUND = 22000
const PILLARS = 14000
const MOTES = 1600

function hash(n) {
  const s = Math.sin(n) * 43758.5453
  return s - Math.floor(s)
}

/** 値ノイズ。地面の起伏に使う */
function noise2(x, y) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi + yi * 57)
  const b = hash(xi + 1 + yi * 57)
  const c = hash(xi + (yi + 1) * 57)
  const d = hash(xi + 1 + (yi + 1) * 57)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

function fbm(x, y) {
  let v = 0
  let a = 0.5
  let fx = x
  let fy = y
  for (let i = 0; i < 4; i++) {
    v += noise2(fx, fy) * a
    fx = fx * 2.03 + 11.3
    fy = fy * 2.03 - 7.1
    a *= 0.5
  }
  return v
}

function buildCloud() {
  const total = GROUND + PILLARS + MOTES
  const pos = new Float32Array(total * 3)
  const attr = new Float32Array(total * 2) // 明るさ / 大きさ
  let s = 0x2c91
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  let k = 0

  const put = (x, y, z, bright, size) => {
    pos[k * 3] = x
    pos[k * 3 + 1] = y
    pos[k * 3 + 2] = z
    attr[k * 2] = bright
    attr[k * 2 + 1] = size
    k++
  }

  /*
   * 地面。**起伏を付ける。** 平らな床に点を撒くと方眼紙にしかならない。
   * 手前は疎、奥は密にして、視界の奥で面が立ち上がるようにする。
   */
  for (let i = 0; i < GROUND; i++) {
    const x = (rand() - 0.5) * 60
    const z = -2 - rand() * 36
    const h = fbm(x * 0.12, z * 0.12) * 3.2 - 1.2
    const y = -3.2 + h * 0.9 + (rand() - 0.5) * 0.1
    // 尾根の上ほど明るい。陰影が付いて地形に見える
    /*
     * 明るさは**起伏で決める**。一様だと地形ではなく砂嵐に見える。
     * 尾根だけ拾わせて、谷は沈める。
     */
    /*
     * **数を減らして 1 粒を明るくする。** 細かい粒を大量に撒くと、ボケた
     * ときに一様な霧になって奥行きが消える。粒が見えるほうが空間に見える。
     */
    const lit = Math.max(0, h - 1.0)
    put(x, y, z, 0.55 + lit * 1.6 + rand() * 0.2, 1.1 + rand() * 1.1)
  }

  // 柱。垂直の塊がいくつかあるだけで、空間に骨格が入る
  for (let i = 0; i < PILLARS; i++) {
    const cx = (rand() - 0.5) * 52
    const cz = -5 - rand() * 30
    const rad = 0.35 + rand() * 1.1
    const tall = 3 + rand() * 9
    const a = rand() * Math.PI * 2
    const r = rad * (0.75 + rand() * 0.25)
    const y = -2.7 + rand() * tall
    put(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0.6 + rand() * 0.5, 0.9 + rand() * 0.8)
  }

  // 漂う粒。手前にも撒いて、空間に厚みを出す
  for (let i = 0; i < MOTES; i++) {
    put((rand() - 0.5) * 34, -3.2 + rand() * 5.5, -1 - rand() * 28, 0.3 + rand() * 0.45, 0.55 + rand() * 0.8)
  }

  return { pos, attr, count: k }
}

export default function Environment({ fog = '#0b0c10' }) {
  const { pos, attr, count } = useMemo(() => buildCloud(), [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aAttr', new THREE.BufferAttribute(attr, 2))
    geo.setDrawRange(0, count)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -20), 80)
    return geo
  }, [pos, attr, count])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uProj: { value: 800 },
      uFog: { value: new THREE.Color(fog) },
    },
    vertexShader: /* glsl */`
      precision highp float;
      attribute vec2 aAttr;
      uniform float uTime;
      uniform float uProj;
      varying float vDim;

      void main() {
        vec3 p = position;
        // ごくゆっくり揺らす。完全な静止は写真に見える
        p.x += sin(uTime * 0.05 + p.z * 0.3) * 0.06;
        p.y += cos(uTime * 0.04 + p.x * 0.25) * 0.05;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        float dist = -mv.z;
        /*
         * 霞。**奥ほど沈める。** 距離で落とさないと、遠い点も近い点も同じ
         * 濃さになって奥行きが消える。
         */
        float haze = exp(-dist * 0.028);
        vDim = aAttr.x * haze;
        // 遠近で小さく。最低 1 画素は残す（消えるとちらつく）
        gl_PointSize = max(1.0, aAttr.y * uProj * 0.03 / max(0.5, dist));
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vDim;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25) discard;
        float a = smoothstep(0.25, 0.0, d) * vDim;
        // 色は置かない。わずかに青を残すだけ
        gl_FragColor = vec4(vec3(0.60, 0.65, 0.74) * a * 0.32, 1.0);
      }
    `,
  }), [fog])
  useEffect(() => () => material.dispose(), [material])

  const points = useRef(null)

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    const h = state.size.height
    const tan = Math.tan((state.camera.fov * Math.PI) / 360)
    material.uniforms.uProj.value = h / (2 * tan)
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={-50} />
}
