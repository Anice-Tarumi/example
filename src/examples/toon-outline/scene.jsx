import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createGBufferMaterial } from './material'

/**
 * 小惑星。messenger.abeto.co のタイトル画面に寄せて、球の上に街と木を生やす。
 *
 * 全メッシュが同じ規約で G-Buffer へ書き出す。surfaceId は要素ごとに違う値を振り、
 * 地面は「草」「土」「水辺」を同一球面上に重ねてある。深度も法線もほぼ連続なので、
 * ID が無ければ線が引けない場所になる。
 */

const R = 1.9

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** フィボナッチ球。球面上に偏りなく点を撒く */
function fibonacciPoint(i, total) {
  const k = i + 0.5
  const phi = Math.acos(1 - (2 * k) / total)
  const theta = Math.PI * (1 + Math.sqrt(5)) * k
  return new THREE.Vector3(
    Math.cos(theta) * Math.sin(phi),
    Math.cos(phi),
    Math.sin(theta) * Math.sin(phi),
  )
}

/** 球面上の点に、法線方向を上にして置くための姿勢 */
const UP = new THREE.Vector3(0, 1, 0)
function orientTo(dir) {
  return new THREE.Quaternion().setFromUnitVectors(UP, dir)
}

const PALETTE = {
  grass: { color: '#8fc46a', shadow: '#3d7040' },
  dirt: { color: '#c9a877', shadow: '#6f5334' },
  cliff: { color: '#b9b3a6', shadow: '#5c574e' },
  rock: { color: '#a8b0b8', shadow: '#4a525c' },
  trunk: { color: '#8b6039', shadow: '#3f2a18' },
  leaf: { color: '#5fae5c', shadow: '#245c32' },
  wallA: { color: '#f2efe6', shadow: '#8d8a80' },
  wallB: { color: '#d9d3c4', shadow: '#7b7568' },
  roofA: { color: '#e2553f', shadow: '#742418' },
  roofB: { color: '#8f9aa4', shadow: '#414951' },
  crane: { color: '#e8672f', shadow: '#7a2e10' },
  water: { color: '#63c9c6', shadow: '#256d76' },
}

export function Island({ params }) {
  const group = useRef(null)

  const items = useMemo(() => {
    const rand = makeRandom(0xbadc0de)
    const list = []
    let id = 0
    // 隣接要素の ID が近すぎると差分が出ないので、無理数っぽい間隔で散らす
    const nextId = () => ((id++ * 0.137) % 1)

    const push = (key, geometry, position, quaternion, scale) =>
      list.push({
        key: `${key}-${list.length}`,
        geometry,
        position: position.toArray(),
        quaternion: quaternion ? quaternion.toArray() : [0, 0, 0, 1],
        scale: scale || 1,
        palette: PALETTE[key],
        surfaceId: nextId(),
      })

    // 惑星本体。低ポリに見せるため細分化を抑える
    push('grass', new THREE.IcosahedronGeometry(R, 3), new THREE.Vector3(), null)

    // 岩肌。惑星と同心で少しだけ大きい球を部分的に被せる代わりに、
    // 板状の岩を貼って「同一球面上で素材が変わる」状況を作る
    for (let i = 0; i < 10; i++) {
      const dir = fibonacciPoint(i * 3 + 1, 40)
      const s = 0.32 + rand() * 0.3
      push(
        'cliff',
        new THREE.IcosahedronGeometry(1, 1),
        dir.clone().multiplyScalar(R * 0.97),
        orientTo(dir),
        [s, s * 0.35, s],
      )
    }

    // 水辺
    for (let i = 0; i < 4; i++) {
      const dir = fibonacciPoint(i * 7 + 3, 30)
      const s = 0.42 + rand() * 0.22
      push(
        'water',
        new THREE.CylinderGeometry(1, 1, 0.12, 14),
        dir.clone().multiplyScalar(R * 0.995),
        orientTo(dir),
        [s, 1, s],
      )
    }

    // 街。棟をいくつか固めて置くと「街区」に見える
    const districts = 5
    for (let d = 0; d < districts; d++) {
      const base = fibonacciPoint(d * 5 + 2, 26)
      for (let b = 0; b < 4; b++) {
        // 街区の中心から少しずらす
        const jitter = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5)
          .multiplyScalar(0.42)
        const dir = base.clone().add(jitter).normalize()
        const h = 0.22 + rand() * 0.4
        const w = 0.2 + rand() * 0.16

        const q = orientTo(dir)
        push(
          rand() < 0.5 ? 'wallA' : 'wallB',
          new THREE.BoxGeometry(w, h, w * (0.8 + rand() * 0.5)),
          dir.clone().multiplyScalar(R + h * 0.5 - 0.03),
          q,
        )
        // 屋根
        push(
          rand() < 0.55 ? 'roofA' : 'roofB',
          new THREE.ConeGeometry(w * 0.82, h * 0.5, 4),
          dir.clone().multiplyScalar(R + h + h * 0.2 - 0.03),
          q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 4)),
        )
      }
    }

    // クレーン。実物のアクセントカラー
    {
      const dir = fibonacciPoint(9, 26)
      const q = orientTo(dir)
      push('crane', new THREE.BoxGeometry(0.07, 1.0, 0.07), dir.clone().multiplyScalar(R + 0.5), q)
      push(
        'crane',
        new THREE.BoxGeometry(0.9, 0.07, 0.07),
        dir.clone().multiplyScalar(R + 0.95),
        q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.12)),
      )
    }

    // 木
    for (let i = 0; i < 26; i++) {
      const dir = fibonacciPoint(i * 2 + 1, 54)
      const h = 0.26 + rand() * 0.2
      const q = orientTo(dir)
      push('trunk', new THREE.CylinderGeometry(0.028, 0.038, h, 6), dir.clone().multiplyScalar(R + h * 0.5 - 0.02), q)
      push('leaf', new THREE.ConeGeometry(0.15, 0.34, 7), dir.clone().multiplyScalar(R + h + 0.13), q)
      push('leaf', new THREE.ConeGeometry(0.11, 0.26, 7), dir.clone().multiplyScalar(R + h + 0.28), q)
    }

    // 岩
    for (let i = 0; i < 8; i++) {
      const dir = fibonacciPoint(i * 6 + 4, 50)
      const s = 0.05 + rand() * 0.07
      push(
        'rock',
        new THREE.IcosahedronGeometry(1, 0),
        dir.clone().multiplyScalar(R + s * 0.4),
        orientTo(dir),
        s,
      )
    }

    // 惑星の下側に土の層をのぞかせる
    push('dirt', new THREE.IcosahedronGeometry(R * 0.99, 2), new THREE.Vector3(0, -0.06, 0), null)

    return list
  }, [])

  const materials = useMemo(
    () =>
      items.map((it) =>
        createGBufferMaterial({
          color: it.palette.color,
          shadowColor: it.palette.shadow,
          surfaceId: it.surfaceId,
        }),
      ),
    [items],
  )

  useFrame((state, delta) => {
    if (group.current) group.current.rotation.y += delta * params.spin
    for (const m of materials) {
      if (!m.uniforms) continue
      m.uniforms.uSteps.value = params.toonSteps
      m.uniforms.uSketch.value = params.sketch
      m.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <group ref={group} rotation={[0.18, 0, 0.12]}>
      {items.map((it, i) => (
        <mesh
          key={it.key}
          geometry={it.geometry}
          material={materials[i]}
          position={it.position}
          quaternion={it.quaternion}
          scale={it.scale}
        />
      ))}
    </group>
  )
}
