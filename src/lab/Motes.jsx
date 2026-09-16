/* eslint-disable react-hooks/immutability */

import { useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import {
  quadVertexShader,
  velocityFragmentShader,
  positionFragmentShader,
  copyFragmentShader,
  moteVertexShader,
  moteFragmentShader,
} from './motes/glsl'

/**
 * 空間に漂う粒。
 *
 * 本家の画面を撮って分かったのは 2 つ。
 *
 *   1. **粒は塵ではなくボケ玉。** 大小ばらばらの柔らかい円盤が房で漂う。
 *      1 画素の点をいくら撒いても均一な靄にしかならない
 *   2. **粒は状態を持っている。** 挙動コードは
 *      `pos += (target - pos) * 0.07 * HZ` で、位置を毎フレーム持ち越す。
 *      状態が無いと撫でた瞬間しか動かず、流れの跡が残らない
 *
 * どちらも作りの話で、トーンとは関係ない。ここでは位置と速度を FBO に
 * 持って解く。数は本家が 150,000 個、こちらは 65,536 個。
 */

/*
 * 一辺。粒の数は二乗。本家は 150,000 個だが、**同じ数にしても同じ絵には
 * ならない。** あちらの粒は大半が 1〜2 画素の細かい点で、大きく柔らかい
 * 玉は被写界深度が作っている。こちらは玉をスプライトで作っているので、
 * 同じ数を撒くと画面が吹雪になる（実際なった）。
 * 玉として見える数に合わせる。
 */
const SIDE = 128
const COUNT = SIDE * SIDE

/** 房の数。塊で置く。一様に撒くと空間ではなく壁紙になる */
const CLUSTERS = 34

function buildInitial() {
  const home = new Float32Array(COUNT * 4)
  const pos = new Float32Array(COUNT * 4)

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

  const per = Math.ceil(COUNT / CLUSTERS)
  let k = 0
  for (let c = 0; c < CLUSTERS && k < COUNT; c++) {
    const cx = (rand() - 0.5) * 22
    const cy = (rand() - 0.5) * 9
    /*
     * **板より奥に置く。** 手前に湧かせると粒が主役になって板が
     * 見えなくなる（実際そうなって、泡の写真のようになった）。
     */
    const cz = -0.8 - rand() * 9.5
    const spread = 1.0 + rand() * 2.6
    for (let i = 0; i < per && k < COUNT; i++) {
      // 房の中は中心に寄せる。均一に詰めると球に見える
      const r = Math.pow(rand(), 1.7) * spread
      const a = rand() * Math.PI * 2
      const b = (rand() - 0.5) * Math.PI
      const x = cx + Math.cos(a) * Math.cos(b) * r
      const y = cy + Math.sin(b) * r * 0.7
      const z = cz + Math.sin(a) * Math.cos(b) * r

      home[k * 4] = x
      home[k * 4 + 1] = y
      home[k * 4 + 2] = z
      // 大きさは 3 乗で偏らせる。大玉はごく一部
      home[k * 4 + 3] = Math.pow(rand(), 3)

      pos[k * 4] = x
      pos[k * 4 + 1] = y
      pos[k * 4 + 2] = z
      pos[k * 4 + 3] = rand() // 色と位相の種
      k++
    }
  }

  const mk = (data) => {
    const t = new THREE.DataTexture(data, SIDE, SIDE, THREE.RGBAFormat, THREE.FloatType)
    t.needsUpdate = true
    return t
  }
  return { homeTex: mk(home), posTex: mk(pos) }
}

export default function Motes({ fluidRef }) {
  const { gl } = useThree()
  const points = useRef(null)

  const fboOpts = useMemo(() => ({
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  }), [])

  const posA = useFBO(SIDE, SIDE, fboOpts)
  const posB = useFBO(SIDE, SIDE, fboOpts)
  const velA = useFBO(SIDE, SIDE, fboOpts)
  const velB = useFBO(SIDE, SIDE, fboOpts)

  const { homeTex, posTex } = useMemo(() => buildInitial(), [])
  useEffect(() => () => { homeTex.dispose(); posTex.dispose() }, [homeTex, posTex])

  /*
   * 位置パスと速度パスで同じ uniform を共有する。**片方だけ更新して
   * ずれる**のが一番よくあるバグなので、そもそも 1 つにしておく。
   */
  const shared = useMemo(() => ({
    tPosition: { value: null },
    tVelocity: { value: null },
    tOriginal: { value: homeTex },
    tFluid: { value: null },
    uModelViewMat: { value: new THREE.Matrix4() },
    uProjMat: { value: new THREE.Matrix4() },
    uDtRatio: { value: 1 },
    uTime: { value: 0 },
    uPush: { value: 0.030 },
    uReturn: { value: 0.0016 },
    uFriction: { value: 0.94 },
  }), [homeTex])

  const velQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVertexShader, fragmentShader: velocityFragmentShader, uniforms: shared,
  })), [shared])
  const posQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVertexShader, fragmentShader: positionFragmentShader, uniforms: shared,
  })), [shared])
  const copyUniforms = useMemo(() => ({ tSource: { value: null } }), [])
  const copyQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: quadVertexShader, fragmentShader: copyFragmentShader, uniforms: copyUniforms,
  })), [copyUniforms])
  useEffect(() => () => { velQuad.dispose(); posQuad.dispose(); copyQuad.dispose() }, [velQuad, posQuad, copyQuad])

  const geometry = useMemo(() => {
    // 頂点には「自分の状態がテクスチャのどこにあるか」だけ持たせる
    const ref = new Float32Array(COUNT * 2)
    const dummy = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      ref[i * 2] = ((i % SIDE) + 0.5) / SIDE
      ref[i * 2 + 1] = (Math.floor(i / SIDE) + 0.5) / SIDE
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(dummy, 3))
    geo.setAttribute('aRef', new THREE.BufferAttribute(ref, 2))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -5), 24)
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const drawUniforms = useMemo(() => ({
    tPosition: { value: null },
    tVelocity: { value: null },
    tOriginal: { value: homeTex },
    uProj: { value: 800 },
    uScale: { value: 1 },
  }), [homeTex])

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    // 深度は書かない。書くと後段の被写界深度が玉を近景と誤認する
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: drawUniforms,
    vertexShader: moteVertexShader,
    fragmentShader: moteFragmentShader,
  }), [drawUniforms])
  useEffect(() => () => material.dispose(), [material])

  /*
   * 初期値を FBO へ流し込む。**1 回だけ。** 毎フレーム入れると
   * 積み上げた状態が消えて、状態を持つ意味が無くなる。
   */
  const ready = useRef(false)
  const flip = useRef(false)

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20)

    if (!ready.current) {
      copyUniforms.tSource.value = posTex
      for (const t of [posA, posB]) {
        gl.setRenderTarget(t)
        copyQuad.render(gl)
      }
      // 速度は 0 から。初期化しないと未定義の値が残る環境がある
      gl.setRenderTarget(velA)
      gl.setClearColor(0x000000, 0)
      gl.clear()
      gl.setRenderTarget(velB)
      gl.clear()
      gl.setRenderTarget(null)
      ready.current = true
    }

    const p = points.current
    if (!p) return

    const readPos = flip.current ? posB : posA
    const writePos = flip.current ? posA : posB
    const readVel = flip.current ? velB : velA
    const writeVel = flip.current ? velA : velB

    shared.tPosition.value = readPos.texture
    shared.tVelocity.value = readVel.texture
    shared.tFluid.value = fluidRef?.current ?? null
    shared.uDtRatio.value = dt * 60
    shared.uTime.value = state.clock.elapsedTime
    /*
     * 投影に使う行列。**粒の親（揺れる group）ごと掛ける。**
     * カメラの行列だけで投影すると、場面が揺れたときに流れが
     * 空間からずれる。
     */
    shared.uModelViewMat.value.multiplyMatrices(state.camera.matrixWorldInverse, p.matrixWorld)
    shared.uProjMat.value.copy(state.camera.projectionMatrix)

    gl.setRenderTarget(writeVel)
    velQuad.render(gl)

    // 位置パスは**今書いた速度**を読む。1 フレーム遅らせると手応えが鈍る
    shared.tVelocity.value = writeVel.texture
    gl.setRenderTarget(writePos)
    posQuad.render(gl)
    gl.setRenderTarget(null)

    drawUniforms.tPosition.value = writePos.texture
    drawUniforms.tVelocity.value = writeVel.texture
    const tan = Math.tan((state.camera.fov * Math.PI) / 360)
    drawUniforms.uProj.value = state.size.height / (2 * tan)

    flip.current = !flip.current
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={-40} />
}
