/* eslint-disable react-hooks/immutability */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bakeMatcap } from '../examples/matcap-material/matcap'

/**
 * 板を貫いて落ちてくる骨の鎖。
 *
 * 参考実装（Active Theory の Work 一覧）には `ChainShader` を貼った
 * 要素があり、配布物は `assets/geometry/spine.bin`。展開して実測したら
 * **2,375 頂点、0.56 x 0.34 x 0.47 の椎骨 1 個**だった。長い鎖ではない。
 *
 * 曲げ方はシェーダーに書いてある。
 *
 *   pos.y -= 17.0 * uScroll;
 *   pos.x -= cos(-pos.y * 0.4) * 1.1;
 *   pos.z -= sin(-pos.y * 0.4) * 1.1;
 *
 * つまり **y 方向に積んだ鎖を、半径 1.1 の螺旋に曲げて落としている**。
 *
 * ここで大事なのは形そのものより**置き方**。板の手前や上に浮かせると
 * 「別の物が浮いている」だけになる。**板の後ろを通して、板に隠れさせる。**
 * 隠れた分だけ空間の前後が読める。
 */

/** 椎骨の間隔。詰めすぎると 1 本の棒、空けすぎると数珠 */
const STEP = 0.34
/** 積む数。上下に画面外まで伸ばす */
const LINKS = 30
/** 螺旋の半径と巻き。参考実装の 1.1 / 0.4 をそのまま使う */
const COIL_RADIUS = 1.1
const COIL_PITCH = 0.4

/**
 * 椎骨 1 個。
 *
 * 実物を真似るのではなく、**遠目に骨と分かる最小限**にする。
 * 体・左右の突起・背側の棘。丸い塊だけだと数珠になり、
 * 棘だけだと魚の骨になる。
 */
function buildVertebra() {
  const parts = []

  // 体。少し潰した球
  /*
   * 体。**隣と重なる大きさにする。** 間隔 0.34 に対して半径 0.19 なら
   * 上下が食い込むので、繋ぎの軸が見えなくなる。軸が見えると
   * 「玉を棒で繋いだ模型」になる。
   */
  const body = new THREE.SphereGeometry(0.19, 20, 14)
  body.scale(1.0, 0.62, 0.95)
  parts.push(body)

  // 左右の突起。細長く寝かせる
  for (const sx of [-1, 1]) {
    const wing = new THREE.SphereGeometry(0.072, 12, 8)
    wing.scale(2.7, 0.5, 0.85)
    wing.rotateZ(sx * 0.2)
    wing.translate(sx * 0.2, 0.01, 0.0)
    parts.push(wing)
  }

  // 背側の棘。後ろへ倒す
  const spike = new THREE.ConeGeometry(0.07, 0.26, 10)
  spike.rotateX(Math.PI * 0.62)
  spike.translate(0, 0.03, -0.18)
  parts.push(spike)

  /*
   * 節を繋ぐ軸。**細すぎると分子模型に見える。**
   * 0.036 で試したら、玉と棒の模型になって骨に見えなかった。
   * 体の半分くらいの太さを持たせて、繋がった 1 本に見せる。
   */
  const link = new THREE.CylinderGeometry(0.062, 0.062, STEP * 1.05, 10)
  link.translate(0, STEP * 0.5, 0)
  parts.push(link)

  const geo = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  return geo
}

function buildChain() {
  const seg = buildVertebra()
  const copies = []
  for (let i = 0; i < LINKS; i++) {
    const g = seg.clone()
    // 1 つずつ軸回りに少し回す。同じ向きが並ぶと機械部品に見える
    g.rotateY(i * 0.31)
    g.translate(0, (i - LINKS / 2) * STEP, 0)
    copies.push(g)
  }
  seg.dispose()
  const merged = mergeGeometries(copies, false)
  copies.forEach((g) => g.dispose())
  merged.computeVertexNormals()
  // 曲げは頂点シェーダーで入れるので、範囲は手で与える
  merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(), LINKS * STEP)
  return merged
}

/*
 * 置き場所。**板の中央を縦に割らない。** 中央を通すと視線を持っていって
 * 板が読めなくなる。少し右へ寄せ、奥へ下げて、板に隠れる部分を作る。
 */
export default function Spine({ position = [0.62, 0, -1.9], scale = 1.05 }) {
  const mesh = useRef(null)

  const geometry = useMemo(() => buildChain(), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const matcap = useMemo(() => bakeMatcap(256, {
    lightA: [0.45, 0.8, 0.45],
    lightB: [-0.7, 0.05, 0.35],
    // 粗い鏡面は狭く。広いと面の大半が同じ明るさになってのっぺりする
    roughPower: 30,
    sharpPower: 220,
    fresnelPower: 3.4,
  }), [])
  useEffect(() => () => matcap.dispose(), [matcap])

  const material = useMemo(() => new THREE.ShaderMaterial({
    // 深度を書く。板に隠れてほしいので、これが要る
    transparent: false,
    depthWrite: true,
    uniforms: {
      tMatcap: { value: matcap },
      uTime: { value: 0 },
      uScroll: { value: 0 },
    },
    vertexShader: /* glsl */`
      precision highp float;
      uniform float uScroll;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying float vY;

      void main() {
        vec3 p = position;

        /*
         * 螺旋へ曲げる。参考実装の ChainShader と同じ式。
         *
         *   pos.y -= 17.0 * uScroll;
         *   pos.x -= cos(-pos.y * 0.4) * 1.1;
         *   pos.z -= sin(-pos.y * 0.4) * 1.1;
         *
         * **真っ直ぐな鎖を置かない。** 縦棒が 1 本通っているだけだと
         * 背景の柄にしか見えない。捻れていると奥行きが読める。
         */
        p.y -= 17.0 * uScroll;
        p.x -= cos(-p.y * ${COIL_PITCH.toFixed(2)}) * ${COIL_RADIUS.toFixed(2)};
        p.z -= sin(-p.y * ${COIL_PITCH.toFixed(2)}) * ${COIL_RADIUS.toFixed(2)};

        vY = p.y;

        /*
         * 法線も曲げる。**元の法線をそのまま使わない。**
         * 曲げは y に応じて x と z をずらすせん断なので、その逆転置を
         * 法線へ掛ける。掛けないと陰影が形と合わず、節の間の軸が
         * 平らな筒に見える（実際そう見えた）。
         *
         *   J = [1 a 0; 0 1 0; 0 b 1]
         *   a = -R k sin(-k y),  b = R k cos(-k y)
         *   逆転置を掛けると n' = (n.x, -a n.x + n.y - b n.z, n.z)
         */
        float kk = ${COIL_PITCH.toFixed(2)} * ${COIL_RADIUS.toFixed(2)};
        float a = -kk * sin(-position.y * ${COIL_PITCH.toFixed(2)});
        float bb = kk * cos(-position.y * ${COIL_PITCH.toFixed(2)});
        vec3 bent = vec3(normal.x, -a * normal.x + normal.y - bb * normal.z, normal.z);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vViewPos = mv.xyz;
        vNormal = normalize(normalMatrix * normalize(bent));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tMatcap;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying float vY;

      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(-vViewPos);

        // matcap。視点座標の法線をそのまま uv にする
        vec2 uv = n.xy * 0.5 + 0.5;
        vec3 m = texture2D(tMatcap, uv).rgb;

        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6);

        /*
         * 金属を白で塗らない。拡散は冷たい鉛色、粗い鏡面でわずかに青、
         * 鋭い鏡面だけ白に寄せる。全部白にするとプラスチックに見える。
         */
        vec3 col = vec3(0.030, 0.036, 0.048) * m.r;
        col += vec3(0.30, 0.36, 0.46) * m.g;
        col += vec3(0.88, 0.91, 0.98) * m.b * 0.85;

        // 縁の虹。薄く。彩度を上げると玩具になる
        float h = fres * 3.1 + uTime * 0.05 + n.y * 0.7;
        vec3 iri = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h));
        col += iri * fres * 0.085;

        // 上下の端を落とす。切れ目が直線で見えると棒が置いてあると分かる
        col *= smoothstep(5.6, 3.6, abs(vY));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  }), [matcap])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    material.uniforms.uTime.value = t
    /*
     * ゆっくり流す。本家はスクロールで送っているが、こちらのトップは
     * スクロールしないので時間で回す。**止めない。** 静止すると
     * 背景に描いた柄に見える。
     */
    material.uniforms.uScroll.value = (t * 0.004) % 1
    const m = mesh.current
    if (m) m.rotation.y = Math.sin(t * 0.07) * 0.12
  })

  return (
    <group position={position} scale={scale}>
      <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}
