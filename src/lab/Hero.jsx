/* eslint-disable react-hooks/immutability */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bakeMatcap } from '../examples/matcap-material/matcap'

/**
 * 板の上に浮く金属の形。
 *
 * 本家の画面を撮ったら、板の真上に**虹色のクロムの塊**が回っていた
 * （設定上は `ChainShader`。matcap と MRO と法線マップを引いている）。
 * これが無いと、場面に硬い物が 1 つも無く、柔らかい粒とガラスだけの
 * 絵になる。**硬い物が 1 つあると、他の柔らかさが効く。**
 *
 * あちらの `spine.bin` は使えないので、形は手続きで作る。円を雑音で
 * 崩した閉曲線に沿ってチューブを通す。円環や結び目をそのまま置くと
 * 「プリミティブを置きました」に見える。
 *
 * 照明は matcap。`matcap-material` で焼いた物をそのまま使う
 * （R 拡散 / G 粗い鏡面 / B 鋭い鏡面）。権利の要る素材が要らない。
 */

const SEGMENTS = 420
const RADIAL = 16
const TUBE_RADIUS = 0.115

function buildCurve() {
  /*
   * 乱数。線形合同法は使わない（連続値で格子が出る）。
   */
  let s = 0x3b19
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /*
   * 制御点は**少なく**取る。多いと崩しがそのまま曲線に出て、
   * 縮れた輪ゴムになる。9 点を Catmull-Rom で繋いで滑らかに通す。
   */
  const N = 9
  const pts = []
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    const r = 0.62 + (rand() - 0.5) * 0.34
    pts.push(new THREE.Vector3(
      Math.cos(a) * r,
      (rand() - 0.5) * 0.52,
      Math.sin(a) * r * 0.78,
    ))
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5)
}

/*
 * 置き場所。**画面の外へはみ出させない。** 上に大きく置いたら枠で切れて、
 * 何の形か分からないまま視線だけ持っていく物になった。
 */
export default function Hero({ position = [0.42, 1.06, -0.7], scale = 0.66 }) {
  const mesh = useRef(null)

  const geometry = useMemo(() => {
    const curve = buildCurve()
    const geo = new THREE.TubeGeometry(curve, SEGMENTS, TUBE_RADIUS, RADIAL, true)

    /*
     * **太さを一定にしない。** 均一な管は、どれだけ曲げても針金か輪ゴムに
     * 見える（実際そうなった）。膨らみと絞りを入れると、鋳込んだ金属の
     * 塊に見える。
     *
     * `TubeGeometry` は太さを変えられないので、生成後に頂点を芯から
     * 押し引きする。頂点は「区間 → 断面」の順に並んでいるので、
     * 区間の番号から芯の座標が引ける。
     */
    const pos = geo.attributes.position
    const center = new THREE.Vector3()
    const p = new THREE.Vector3()
    for (let seg = 0; seg <= SEGMENTS; seg++) {
      const t = seg / SEGMENTS
      curve.getPointAt(t % 1, center)
      // 周期の違う 3 つを重ねる。1 つだと規則正しい数珠になる
      const swell =
        0.26 +
        0.52 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2 + 0.7)) +
        0.40 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 3 - 1.9)) +
        0.18 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 7 + 2.4))
      for (let r = 0; r <= RADIAL; r++) {
        const i = seg * (RADIAL + 1) + r
        p.fromBufferAttribute(pos, i)
        p.sub(center).multiplyScalar(swell).add(center)
        pos.setXYZ(i, p.x, p.y, p.z)
      }
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const matcap = useMemo(() => {
    /*
     * 光は 2 灯。**片側だけだと円柱が平たく見える。**
     * 鋭い鏡面を強めに焼いて、金属らしい細いハイライトを出す。
     */
    return bakeMatcap(256, {
      lightA: [0.45, 0.8, 0.45],
      lightB: [-0.7, 0.05, 0.35],
      /*
       * **粗い鏡面を広げすぎない。** 9 で焼いたら面の大半が同じ明るさに
       * なり、のっぺりした鉛の輪になった。狭くして、暗い所を作る。
       */
      roughPower: 30,
      sharpPower: 220,
      fresnelPower: 3.4,
    })
  }, [])
  useEffect(() => () => matcap.dispose(), [matcap])

  const material = useMemo(() => new THREE.ShaderMaterial({
    // 深度を書く。後段の被写界深度に奥行きを渡す
    transparent: false,
    depthWrite: true,
    uniforms: {
      tMatcap: { value: matcap },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      precision highp float;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tMatcap;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewPos;

      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(-vViewPos);

        /*
         * matcap の引き方。**視点座標の法線をそのまま uv にする。**
         * 正射影で見た単位球を撮った 1 枚なので、法線の xy が
         * そのまま焼いた球のどこかを指す。
         */
        vec2 uv = n.xy * 0.5 + 0.5;
        vec3 m = texture2D(tMatcap, uv).rgb;

        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6);

        /*
         * 色。**金属を白で塗らない。** 拡散は冷たい鉛色、粗い鏡面で
         * わずかに青、鋭い鏡面だけ白に寄せる。全部白にすると
         * プラスチックに見える。
         */
        vec3 col = vec3(0.030, 0.036, 0.048) * m.r;
        col += vec3(0.30, 0.36, 0.46) * m.g;
        col += vec3(0.88, 0.91, 0.98) * m.b * 0.85;

        /*
         * 縁の虹。本家のクロムは縁が虹色に割れていた。
         * **薄く。** 彩度を上げると玩具になる。角度でゆっくり回す。
         */
        float h = fres * 3.1 + uTime * 0.05 + n.y * 0.7;
        vec3 iri = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h));
        col += iri * fres * 0.085;

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  }), [matcap])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const m = mesh.current
    if (!m) return
    const t = state.clock.elapsedTime
    material.uniforms.uTime.value = t
    /*
     * ゆっくり回す。**一定速で 1 軸だけ回さない。** 回転台に載せた
     * 見本に見える。2 軸を違う周期で揺らして、漂っているようにする。
     */
    m.rotation.y = t * 0.11
    m.rotation.x = 0.34 + Math.sin(t * 0.17) * 0.12
    m.rotation.z = Math.cos(t * 0.13) * 0.09
    m.position.y = Math.sin(t * 0.23) * 0.055
  })

  return (
    <group position={position} scale={scale}>
      <mesh ref={mesh} geometry={geometry} material={material} />
    </group>
  )
}
