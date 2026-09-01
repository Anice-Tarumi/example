import * as THREE from 'three'

/**
 * モデルから画面の領域を自動検出する。
 *
 * 機種ごとに縁の太さも画面の位置も違うので、比率を手で当てると必ずずれる。
 * 生成時に `blank dark screen` を指定してあるので、**正面から見て一番暗い矩形が画面**。
 * それを検出して、位置・大きさ・奥行きを決める。
 *
 *   1. 正射影で正面から小さな RT へ描く（アルベドが出るよう環境光だけで照らす）
 *   2. 画素を読んで暗い領域を拾い、その外接矩形を取る
 *   3. 矩形の中心へレイを飛ばして、ガラス面の z を得る
 *
 * 手で詰めるより速く、モデルを差し替えても壊れない。
 */

const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()

export function detectScreen(renderer, source, res = 160, darkThreshold = 0.22) {
  const object = source.clone(true)

  _box.setFromObject(object)
  _box.getSize(_size)
  _box.getCenter(_center)

  // --- 1. 正面から描く ---
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xff00ff) // 背景は画面と混同しない色にする
  scene.add(object)
  scene.add(new THREE.AmbientLight(0xffffff, 3.0))

  const halfW = _size.x * 0.5
  const halfH = _size.y * 0.5
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, _size.z * 4 + 2)
  camera.position.set(_center.x, _center.y, _center.z + _size.z * 2 + 1)
  camera.lookAt(_center.x, _center.y, _center.z)

  const rt = new THREE.WebGLRenderTarget(res, res, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  })

  const prevTarget = renderer.getRenderTarget()
  renderer.setRenderTarget(rt)
  renderer.clear()
  renderer.render(scene, camera)

  const pixels = new Uint8Array(res * res * 4)
  renderer.readRenderTargetPixels(rt, 0, 0, res, res, pixels)
  renderer.setRenderTarget(prevTarget)
  rt.dispose()

  /*
   * --- 2. 暗い領域のうち**最大の連結成分**を採る ---
   *
   * 暗い画素をまとめて外接矩形にすると、スピーカーグリル・ツマミ・影まで
   * 一緒に囲ってしまい、画面より大きな矩形になる。
   * 連結成分に分けて一番大きいものだけを画面とみなす。
   */
  const dark = new Uint8Array(res * res)
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const i = (y * res + x) * 4
      const r = pixels[i] / 255
      const g = pixels[i + 1] / 255
      const b = pixels[i + 2] / 255

      // 背景（マゼンタ）は除外
      if (r > 0.8 && b > 0.8 && g < 0.3) continue
      // 端に貼り付いた暗がりは影。中央 84% だけ見る
      if (x < res * 0.08 || x > res * 0.92 || y < res * 0.08 || y > res * 0.92) continue

      const lum = r * 0.2126 + g * 0.7152 + b * 0.0722
      if (lum <= darkThreshold) dark[y * res + x] = 1
    }
  }

  const label = new Int32Array(res * res).fill(-1)
  const stack = []
  let best = null

  for (let seed = 0; seed < res * res; seed++) {
    if (!dark[seed] || label[seed] >= 0) continue

    label[seed] = seed
    stack.length = 0
    stack.push(seed)

    let n = 0
    let mnX = res
    let mnY = res
    let mxX = -1
    let mxY = -1

    while (stack.length) {
      const idx = stack.pop()
      const x = idx % res
      const y = (idx / res) | 0
      n++
      if (x < mnX) mnX = x
      if (x > mxX) mxX = x
      if (y < mnY) mnY = y
      if (y > mxY) mxY = y

      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= res || ny >= res) return
        const j = ny * res + nx
        if (!dark[j] || label[j] >= 0) return
        label[j] = seed
        stack.push(j)
      }
      push(x + 1, y)
      push(x - 1, y)
      push(x, y + 1)
      push(x, y - 1)
    }

    if (!best || n > best.n) best = { n, mnX, mnY, mxX, mxY }
  }

  const count = best ? best.n : 0
  const minX = best ? best.mnX : res
  const minY = best ? best.mnY : res
  const maxX = best ? best.mxX : -1
  const maxY = best ? best.mxY : -1

  // 検出できないときは bbox から素直に決める
  if (count < res * res * 0.005 || maxX < 0) {
    return { cx: 0, cy: _size.y * 0.58, w: _size.x * 0.5, h: _size.y * 0.36, z: _size.z * 0.47 }
  }

  // 画素 → モデル座標。RT は下が y=0 なので上下はそのまま対応する
  const toX = (px) => (px / (res - 1) - 0.5) * _size.x + _center.x
  const toY = (py) => (py / (res - 1) - 0.5) * _size.y + _center.y

  const x0 = toX(minX)
  const x1 = toX(maxX + 1)
  const y0 = toY(minY)
  const y1 = toY(maxY + 1)

  const cx = (x0 + x1) * 0.5
  const cy = (y0 + y1) * 0.5
  const w = Math.abs(x1 - x0)
  const h = Math.abs(y1 - y0)

  // --- 3. ガラス面の z。矩形の中心へ正面からレイを飛ばす ---
  const ray = new THREE.Raycaster()
  ray.set(new THREE.Vector3(cx, cy, _center.z + _size.z * 2 + 1), new THREE.Vector3(0, 0, -1))
  const hits = ray.intersectObject(object, true)
  const z = hits.length ? hits[0].point.z : _box.max.z - _size.z * 0.03

  object.traverse((o) => {
    if (o.isMesh) o.geometry.dispose?.()
  })

  return { cx, cy, w, h, z }
}
