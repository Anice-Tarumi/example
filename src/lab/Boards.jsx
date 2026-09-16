/*
 * React Compiler の不変性チェックを、このファイルでは外す。
 *
 * three の材質と uniform は**書き換える前提の入れ物**で、毎フレーム値を
 * 差し替えるのが正しい使い方。state に持たせると 60 回/秒の再レンダーに
 * なるし、ref に持たせると今度は「レンダー中に ref を読むな」で弾かれる。
 * 意図的な例外として明示する。
 */
/* eslint-disable react-hooks/immutability */

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { boardVertexShader, boardFragmentShader } from './glsl/board'
import { useVelocityField } from '../shared/useVelocityField'

/**
 * 領域ごとの板を横に並べ、送って選ぶ。
 *
 * 板は**その領域の中身を面に映す**。ラベルだけの板は目次でしかなく、
 * わざわざ 3D にする理由が無い。Experiments の板には実際の example の絵を
 * 順に流す。
 */

const W = 2.6
const H = 1.62
const GAP = 3.35

/** 絵を順に入れ替える間隔（秒）。速いと落ち着かない */
const SWAP = 3.4
/** 入れ替えに掛ける時間 */
const FADE = 0.9

/**
 * 材質と uniform を作る。
 *
 * 置き場は **ref**。`useMemo` で持つと、`useFrame` の中で書き換えたときに
 * React Compiler が「レンダー後に手を入れている」として最適化を止める。
 * ref は書き換える前提の入れ物なので通る。
 */
function makeItem(board, index) {
  const uniforms = {
    tMap: { value: board.textures?.[0] ?? null },
    tNext: { value: board.textures?.[1] ?? board.textures?.[0] ?? null },
    tFluid: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uBlend: { value: 0 },
    uHasMap: { value: board.textures?.length ? 1 : 0 },
    uSize: { value: new THREE.Vector2(W, H) },
    uRadius: { value: 0.14 },
    uPush: { value: 1 },
    uHover: { value: 0 },
    uFocus: { value: 0 },
    uTint: { value: new THREE.Color(board.tint) },
    uTime: { value: 0 },
    uSeed: { value: index * 0.37 },
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: boardVertexShader,
    fragmentShader: boardFragmentShader,
    uniforms,
    side: THREE.DoubleSide,
    /*
     * **深度を書く。** 書かないと深度バッファが空のまま（＝全部が最遠）に
     * なり、後段の被写界深度が画面全体を最大でぼかす。
     *
     * そのために板は不透明で描く。半透明にすると並び順の問題で三角形が
     * 欠ける。角の外だけ `discard` で落とす。
     */
    transparent: false,
    depthWrite: true,
  })
  return { uniforms, material }
}

function Board({ board, index, focusRef, onOpen, fluidRef, resolution }) {
  const mesh = useRef(null)
  const [hovered, setHovered] = useState(false)
  const swap = useRef({ at: 0, i: 0, blend: 0 })

  const { uniforms, material } = useMemo(() => makeItem(board, index), [board, index])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state, delta) => {
    const m = mesh.current
    if (!m) return
    const t = state.clock.elapsedTime
    const dt = Math.min(delta, 1 / 20)

    // 中心からの距離。0 が正面
    const offset = index - focusRef.current
    const focus = Math.max(0, 1 - Math.abs(offset) * 0.85)

    /*
     * 奥へ逃がしながら傾ける。**横に並べるだけだと帯に見える。**
     * 正面から離れるほど奥・外側・斜めにすると、並びに奥行きが出る。
     */
    m.position.x = offset * GAP
    m.position.z = -Math.abs(offset) * 1.15
    m.position.y = Math.sin(t * 0.4 + index) * 0.035
    m.rotation.y = -offset * 0.42
    m.rotation.z = Math.sin(t * 0.3 + index * 2.1) * 0.006
    const s = 1 + focus * 0.06 + (hovered ? 0.03 : 0)
    m.scale.setScalar(s)

    uniforms.uTime.value = t
    uniforms.tFluid.value = fluidRef.current
    uniforms.uResolution.value.copy(resolution)
    uniforms.uFocus.value += (focus - uniforms.uFocus.value) * Math.min(1, dt * 6)
    uniforms.uHover.value += ((hovered ? 1 : 0) - uniforms.uHover.value) * Math.min(1, dt * 8)

    // --- 絵の差し替え。正面の板だけ流す ---
    const list = board.textures
    if (!list || list.length < 2) return
    const sw = swap.current
    if (focus > 0.6 && t - sw.at > SWAP) {
      sw.at = t
      sw.i = (sw.i + 1) % list.length
      uniforms.tNext.value = list[sw.i]
      sw.blend = 0.0001
    }
    if (sw.blend > 0) {
      sw.blend = Math.min(1, sw.blend + dt / FADE)
      uniforms.uBlend.value = sw.blend * sw.blend * (3 - 2 * sw.blend)
      if (sw.blend >= 1) {
        // 混ぜ終わったら手前へ移す。**毎フレーム両方引かせない**
        uniforms.tMap.value = list[sw.i]
        uniforms.uBlend.value = 0
        sw.blend = 0
      }
    }
  })

  return (
    <mesh
      ref={mesh}
      material={material}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onOpen(index) }}
    >
      <planeGeometry args={[W, H, 24, 16]} />
    </mesh>
  )
}

export default function Boards({ boards, focusRef, onFocus }) {
  const navigate = useNavigate()
  const { gl, camera, size } = useThree()

  /*
   * 画面座標の速度場。**本家と同じ作り。** カーソルでかき混ぜた流れを
   * 板が読み、UV を押して縁を溶かす。板に凝るより、ここが質感を作る。
   * 解く中身は `shared/useVelocityField`（他の example と同じ物）。
   */
  const aspect = size.width / Math.max(1, size.height)
  const stepFluid = useVelocityField(128, aspect)
  const fluidRef = useRef(null)
  const resolution = useMemo(() => new THREE.Vector2(1, 1), [])
  const pointer = useRef({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false })
  const fluidParams = useMemo(() => ({
    fluidForce: 900,
    fluidRadius: 0.22,
    fluidCurl: 12,
    fluidIterations: 3,
    fluidDissipation: 0.955,
  }), [])
  const group = useRef(null)
  const target = useRef(0)
  const drag = useRef({ on: false, x: 0, from: 0, moved: 0 })

  useEffect(() => {
    const el = gl.domElement
    const clamp = (v) => Math.max(0, Math.min(boards.length - 1, v))

    const wheel = (e) => {
      // 横成分も拾う。トラックパッドの横スワイプで送れる
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      target.current = clamp(target.current + d * 0.0016)
    }
    const down = (e) => {
      drag.current = { on: true, x: e.clientX, from: target.current, moved: 0 }
    }
    const move = (e) => {
      const d = drag.current
      if (!d.on) return
      const dx = e.clientX - d.x
      d.moved = Math.max(d.moved, Math.abs(dx))
      target.current = clamp(d.from - dx / 260)
    }
    const up = () => { drag.current.on = false }

    // 流体へ渡すカーソル。uv 空間で前フレームとの差分を取る
    const stir = (e) => {
      const r = el.getBoundingClientRect()
      const pt = pointer.current
      pt.px = pt.x
      pt.py = pt.y
      pt.x = (e.clientX - r.left) / r.width
      pt.y = 1 - (e.clientY - r.top) / r.height
      pt.moved = true
    }

    el.addEventListener('pointermove', stir)
    el.addEventListener('wheel', wheel, { passive: true })
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointermove', stir)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gl, boards.length])

  /*
   * 板が画面に収まる距離まで下がる。**狭い画面ほど遠ざける。**
   * 固定の距離だと、スマホでは正面の板が左右で切れる。
   */
  useEffect(() => {
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    const aspect = size.width / size.height
    const need = Math.max(H / 2 / tan, W / 2 / (tan * aspect)) * 1.35
    /*
     * わずかに見下ろす。**水平のままだと地面が画面の外に落ちて、背景が
     * ただの粒になる。** 少し上から見るだけで、点群が面として読める。
     */
    const dist = Math.max(4.4, need)
    camera.position.set(0, 1.35, dist)
    camera.lookAt(0, 0.05, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    fluidRef.current = stepFluid(gl, dt, pointer.current, fluidParams)
    pointer.current.moved = false
    resolution.set(size.width, size.height)
    /*
     * 送りは**近い整数へ寄る**。自由に止まれると、どの板を見ているのか
     * 曖昧なままになる。掴んでいる間だけ自由。
     */
    if (!drag.current.on) target.current += (Math.round(target.current) - target.current) * Math.min(1, dt * 5)
    focusRef.current += (target.current - focusRef.current) * Math.min(1, dt * 6)
    if (group.current) group.current.position.x = 0
    onFocus(Math.round(focusRef.current))
  })

  const open = (i) => {
    // 掴んで動かした直後は開かない。送っただけのつもりで飛ばされる
    if (drag.current.moved > 6) return
    if (Math.abs(focusRef.current - i) > 0.35) {
      target.current = i
      return
    }
    navigate(boards[i].to)
  }

  return (
    <group ref={group}>
      {boards.map((b, i) => (
        <Board
          key={b.id}
          board={b}
          index={i}
          focusRef={focusRef}
          onOpen={open}
          fluidRef={fluidRef}
          resolution={resolution}
        />
      ))}
    </group>
  )
}
