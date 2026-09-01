import * as THREE from 'three'
import consoleUrl from './assets/tv-console.glb?url'
import vintageUrl from './assets/tv-vintage.glb?url'
import portableUrl from './assets/tv-portable.glb?url'
import broadcastUrl from './assets/tv-broadcast.glb?url'
import computerUrl from './assets/tv-computer.glb?url'

/**
 * ブラウン管のモデルと、その画面板の置き方。
 *
 * Tripo の出力は 1 メッシュ 1 マテリアルで、**画面が分離されていない**。
 * そこでモデルの前面に自前の画面板を重ねる。
 *
 * 位置と大きさはバウンディングボックスから割り出すが、機種ごとに
 * 縁の太さも画面の位置も違うので、比率だけ手で与える。
 * bbox は正規化されている（底面 y = 0、最大辺 1）ので、比率は使い回せる。
 */

export const TV_MODELS = [
  {
    id: 'console',
    url: consoleUrl,
    // 画面中心の高さ・前面からのオフセット・画面の幅と高さ（すべて bbox 比）
    // z は bbox 比。前面が 0.5 なので、ガラスの引っ込みぶんだけ小さくする
    screen: { y: 0.60, z: 0.47, w: 0.50, h: 0.36 },
  },
  { id: 'vintage', url: vintageUrl, screen: { y: 0.56, z: 0.47, w: 0.52, h: 0.38 } },
  { id: 'portable', url: portableUrl, screen: { y: 0.58, z: 0.47, w: 0.46, h: 0.34 } },
  { id: 'broadcast', url: broadcastUrl, screen: { y: 0.56, z: 0.47, w: 0.54, h: 0.36 } },
  { id: 'computer', url: computerUrl, screen: { y: 0.58, z: 0.47, w: 0.48, h: 0.36 } },
]

/**
 * わずかに膨らんだ画面。
 * 平面のままだと、どれだけシェーダーを重ねても板に見える。
 */
export function createScreenGeometry(bulge = 0.06, seg = 24) {
  const geo = new THREE.PlaneGeometry(1, 1, seg, seg)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * 2
    const y = pos.getY(i) * 2
    // 端ほど手前から引っ込む。中心が最も手前
    pos.setZ(i, (1 - Math.min(1, x * x * 0.8 + y * y * 0.8)) * bulge)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** 台の上に並べる配置。手前ほど大きく、奥は小さく散らす */
export const LAYOUT = [
  { model: 0, pos: [0, 0, 0], rot: 0.0, scale: 1.0 },
  { model: 1, pos: [-1.35, 0, -0.5], rot: 0.42, scale: 0.82 },
  { model: 3, pos: [1.3, 0, -0.45], rot: -0.38, scale: 0.78 },
  { model: 2, pos: [-0.75, 0, 0.75], rot: 0.22, scale: 0.6 },
  { model: 4, pos: [0.85, 0, 0.8], rot: -0.26, scale: 0.66 },
  { model: 1, pos: [-2.1, 0, -1.5], rot: 0.7, scale: 0.7 },
  { model: 3, pos: [2.05, 0, -1.4], rot: -0.66, scale: 0.72 },
]
