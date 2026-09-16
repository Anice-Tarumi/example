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
/*
 * 板の厚み。本家のジオメトリ（`panels/2x3.bin`）を展開して実測したら、
 * 2 × 3 の板に対して **0.05**（長辺の 1.7%）だった。平面ではなく、
 * 角丸が頂点として焼かれたスラブ。側面があるから縁が光を拾う。
 */
const THICK = W * 0.017
/** 角の丸み。実測では長辺の 1 割弱を弧が占めていた */
const RADIUS = H * 0.085

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

  /*
   * 角丸のスラブ。**平面 + discard では側面が無い。**
   * 本家のジオメトリを展開したら厚みのある角丸板だった。押し出しで作る。
   */
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    const w = W / 2
    const h = H / 2
    const r = RADIUS
    shape.moveTo(-w + r, -h)
    shape.lineTo(w - r, -h)
    shape.quadraticCurveTo(w, -h, w, -h + r)
    shape.lineTo(w, h - r)
    shape.quadraticCurveTo(w, h, w - r, h)
    shape.lineTo(-w + r, h)
    shape.quadraticCurveTo(-w, h, -w, h - r)
    shape.lineTo(-w, -h + r)
    shape.quadraticCurveTo(-w, -h, -w + r, -h)
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: THICK,
      bevelEnabled: false,
      curveSegments: 10,
    })
    geo.translate(0, 0, -THICK / 2)
    geo.computeVertexNormals()

    /*
     * **UV を貼り直す。** `ExtrudeGeometry` が既定で使う `WorldUVGenerator`
     * は、シェイプの座標をそのまま uv に入れる。つまり 0〜1 ではなく
     * -1.3〜1.3 が入る。気付かずに使うと、角丸の判定も絵の参照も座標系ごと
     * ずれる（実際、板の大半が `discard` で消えて中央の一部だけが残った）。
     */
    const pos = geo.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / W + 0.5
      uv[i * 2 + 1] = pos.getY(i) / H + 0.5
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

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
      geometry={geometry}
      material={material}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onOpen(index) }}
    >

    </mesh>
  )
}

export default function Boards({ boards, focusRef, onFocus, fluidRef, resolution }) {
  const navigate = useNavigate()
  const { gl, camera, size } = useThree()

  /*
   * 速度場は `Stage` が 1 本だけ持っていて、板も背景の粒子も**同じ物**を
   * 読む。ここで別に解くと、板と背景がばらばらの流れで揺れて、
   * 同じ空間にいるように見えない。
   */
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

    el.addEventListener('wheel', wheel, { passive: true })
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
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
    /*
     * 余白を広く取る。**正面の板で画面を埋めない。** 埋めると隣の板が
     * 見えず、送れることが分からないうえ、壁を見ている絵になる。
     */
    const need = Math.max(H / 2 / tan, W / 2 / (tan * aspect)) * 1.9
    /*
     * わずかに見下ろす。**水平のままだと地面が画面の外に落ちて、背景が
     * ただの粒になる。** 少し上から見るだけで、点群が面として読める。
     */
    const dist = Math.max(5.6, need)
    camera.position.set(0, 1.35, dist)
    camera.lookAt(0, 0.05, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
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
