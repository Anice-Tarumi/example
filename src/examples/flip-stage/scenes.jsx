import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import forestUrl from '../../assets/dioramas/forest.glb?url'
import townUrl from '../../assets/dioramas/town.glb?url'
import desertUrl from '../../assets/dioramas/desert.glb?url'
import iceUrl from '../../assets/dioramas/ice.glb?url'
import ruinsUrl from '../../assets/dioramas/ruins.glb?url'
import lighthouseUrl from '../../assets/dioramas/lighthouse.glb?url'

/**
 * 床に乗せる小シーン。
 *
 * 盤面は 2 面しかないので、シーンの数だけ用意して visible で出し分ける。
 * 回転で裏に回った瞬間に差し替えるため、全部マウントしたままにしておく。
 *
 * モデルは Tripo 生成の GLB。テクスチャは 4096 で来るので 1024 へ落として同梱している
 * （円盤の上では小さくしか映らない）。
 */

export const STAGE_SCENES = [
  { id: 'forest', label: 'Forest', url: forestUrl, ground: '#4f8f57', rim: '#2f5f39' },
  { id: 'town', label: 'Town', url: townUrl, ground: '#8b8478', rim: '#4a463e' },
  { id: 'desert', label: 'Desert', url: desertUrl, ground: '#dcc08a', rim: '#a58b57' },
  { id: 'ice', label: 'Ice', url: iceUrl, ground: '#9fd3e8', rim: '#4f8ba6' },
  { id: 'ruins', label: 'Ruins', url: ruinsUrl, ground: '#9a9384', rim: '#5b564b' },
  { id: 'lighthouse', label: 'Lighthouse', url: lighthouseUrl, ground: '#5c6470', rim: '#333a44' },
]

export const SCENE_COUNT = STAGE_SCENES.length

STAGE_SCENES.forEach((s) => useGLTF.preload(s.url))

/**
 * GLB を円盤に載せる。
 *
 * 元のスケールや原点は生成側に依存するので当てにしない。
 * 実際のバウンディングボックスから毎回求める。
 *   - 底面を y=0 に落とす
 *   - 円盤の直径に収まるよう xz の広がりで正規化する
 */
export function Diorama({ url, radius }) {
  const { scene } = useGLTF(url)
  const group = useRef(null)

  // 同じモデルを表と裏の両方に置くのでクローンする
  const model = useMemo(() => scene.clone(true), [scene])

  useLayoutEffect(() => {
    const g = group.current
    if (!g) return

    g.scale.setScalar(1)
    g.position.set(0, 0, 0)
    g.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    box.getSize(size)

    const spread = Math.max(size.x, size.z, 1e-4)
    const fit = (radius * 1.9) / spread
    g.scale.setScalar(fit)

    // 底面を接地させ、中心を円盤の中心に合わせる
    const center = new THREE.Vector3()
    box.getCenter(center)
    g.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit)
  }, [model, radius])

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  )
}

/**
 * 円盤。表裏どちらが上に来ても同じに見えるよう y=0 対称に置く。
 * 天面の色はシーン側の円が受け持つので、ここは縁（側面）だけ。
 */
export function Slab({ radius, thickness, rim }) {
  return (
    <mesh>
      <cylinderGeometry args={[radius, radius, thickness, 48]} />
      <meshStandardMaterial color={rim} flatShading />
    </mesh>
  )
}
