import * as THREE from 'three'
import colorA from '../../assets/photos/scene-a.jpg'
import depthA from './assets/depth-a.png'
import colorB from '../../assets/photos/scene-b.jpg'
import depthB from './assets/depth-b.png'

/**
 * 写真 + 深度マップ。
 *
 * この手法の本来の入力。深度は Depth Anything V2 で推定したもので、
 * **白 = 手前**（この example の規約）。
 *
 * 深度テクスチャは絶対に sRGB として読ませないこと。
 * 色ではなく距離の数値なので、ガンマを掛けると奥行きが非線形に歪む。
 * three の既定は NoColorSpace なので、色の方だけ明示的に sRGB にする。
 */
export const PHOTOS = {
  photoA: { label: 'Photo A', color: colorA, depth: depthA, aspect: 2048 / 1365 },
  photoB: { label: 'Photo B', color: colorB, depth: depthB, aspect: 2048 / 3072 },
}

export const SOURCE_OPTIONS = {
  'Photo A': 'photoA',
  'Photo B': 'photoB',
  Procedural: 'procedural',
}

/** 読み込んだテクスチャに色空間とフィルタを設定する */
export function configureTextures(color, depth) {
  color.colorSpace = THREE.SRGBColorSpace
  color.minFilter = THREE.LinearMipmapLinearFilter
  color.magFilter = THREE.LinearFilter
  color.generateMipmaps = true
  color.anisotropy = 4
  color.wrapS = color.wrapT = THREE.ClampToEdgeWrapping

  // 深度は数値。ミップも作らない（縮小で手前と奥が混ざる）
  depth.colorSpace = THREE.NoColorSpace
  depth.minFilter = THREE.LinearFilter
  depth.magFilter = THREE.LinearFilter
  depth.generateMipmaps = false
  depth.wrapS = depth.wrapT = THREE.ClampToEdgeWrapping
}
