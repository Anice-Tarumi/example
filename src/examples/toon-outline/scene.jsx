import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createGBufferMaterial } from './material'
import characterUrl from './assets/character.glb?url'

useGLTF.preload(characterUrl)

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

/** キャラの周りに置く小物。ID の差で線が出る相手が要る */
const PROPS = [
  { key: 'cliff', geo: () => new THREE.CylinderGeometry(2.3, 2.5, 0.35, 32), pos: [0, -1.62, 0] },
  { key: 'rock', geo: () => new THREE.IcosahedronGeometry(0.42, 0), pos: [1.55, -1.15, 0.5] },
  { key: 'rock', geo: () => new THREE.IcosahedronGeometry(0.26, 0), pos: [-1.5, -1.28, -0.7] },
  { key: 'wallA', geo: () => new THREE.BoxGeometry(0.42, 1.3, 0.42), pos: [-1.35, -0.8, 0.9] },
  { key: 'trunk', geo: () => new THREE.CylinderGeometry(0.1, 0.13, 1.6, 8), pos: [1.75, -0.65, -0.9] },
  { key: 'leaf', geo: () => new THREE.IcosahedronGeometry(0.5, 1), pos: [1.75, 0.35, -0.9] },
]

/**
 * キャラクター。
 *
 * モデルは 1 メッシュ 1 マテリアルなので **surfaceId は 1 つしか振れない**。
 * だから内側の線は深度と法線のエッジで出る。ID が効くのは背景・小物との境界。
 *
 * 惑星（Island）は逆で、同一球面上に素材を重ねてあるので深度も法線も連続。
 * そこに線が引けるのは ID があるから。2 つ並べると ID の役割が分かる。
 */
export function Character({ params }) {
  const group = useRef(null)
  const { scene } = useGLTF(characterUrl)
  const model = useMemo(() => scene.clone(true), [scene])

  // モデルが albedo テクスチャを持っていればそれを基準色に使う。
  // 持っていなければ単色になる（1 メッシュ 1 マテリアルだと全身が同じ色になる）
  const modelMap = useMemo(() => {
    let found = null
    scene.traverse((o) => {
      if (!found && o.isMesh && o.material && o.material.map) found = o.material.map
    })
    return found
  }, [scene])

  const bodyMaterial = useMemo(
    () =>
      createGBufferMaterial({
        color: PALETTE.wallA.color,
        shadowColor: PALETTE.wallA.shadow,
        surfaceId: 0.62,
        map: modelMap,
      }),
    [modelMap],
  )

  const props = useMemo(
    () =>
      PROPS.map((p, i) => ({
        ...p,
        geometry: p.geo(),
        // 隣接要素の ID が近すぎると差分が出ないので、無理数っぽい間隔で散らす
        material: createGBufferMaterial({
          color: PALETTE[p.key].color,
          shadowColor: PALETTE[p.key].shadow,
          surfaceId: ((i + 1) * 0.137) % 1,
        }),
      })),
    [],
  )

  const materials = useMemo(
    () => [bodyMaterial, ...props.map((p) => p.material)],
    [bodyMaterial, props],
  )

  // スケールと原点は生成側に依存するので、bbox から毎回求める
  useLayoutEffect(() => {
    model.traverse((o) => {
      if (o.isMesh) o.material = bodyMaterial
    })

    const g = group.current
    if (!g) return
    g.scale.setScalar(1)
    g.position.set(0, 0, 0)
    g.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    box.getSize(size)
    const fit = 2.9 / Math.max(size.y, 1e-4)
    const center = new THREE.Vector3()
    box.getCenter(center)

    g.scale.setScalar(fit)
    g.position.set(-center.x * fit, -1.45 - box.min.y * fit, -center.z * fit)
  }, [model, bodyMaterial])

  useEffect(
    () => () => {
      materials.forEach((m) => m.dispose())
      props.forEach((p) => p.geometry.dispose())
    },
    [materials, props],
  )

  const root = useRef(null)
  useFrame((state, delta) => {
    if (root.current) root.current.rotation.y += delta * params.spin
    for (const m of materials) {
      if (!m.uniforms) continue
      m.uniforms.uSteps.value = params.toonSteps
      m.uniforms.uSketch.value = params.sketch
      m.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <group ref={root} rotation={[0.1, 0, 0]}>
      <group ref={group}>
        <primitive object={model} />
      </group>
      {props.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} position={p.pos} />
      ))}
    </group>
  )
}
