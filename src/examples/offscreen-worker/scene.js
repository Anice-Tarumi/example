import * as THREE from 'three'

/**
 * メインスレッドとワーカーの両方から使うシーン。
 *
 * **DOM に触れてはいけない。** ワーカーには `document` も `window` も無い。
 * `WebGLRenderer` にキャンバスを渡すのはそのため（渡さないと three が
 * `document.createElement` を呼ぶ）。ピクセル比も外から数値で受け取る。
 *
 * 左右で同じ絵を出して比べるので、初期化は完全に決定的にしておく。
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function createScene({ canvas, width, height, dpr, count = 900 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(width * dpr, height * dpr, false)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#080b12')

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(0, 0.6, 7)
  camera.lookAt(0, 0, 0)

  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const key = new THREE.DirectionalLight(0xbfd4ff, 2.0)
  key.position.set(3, 5, 4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xff9c6b, 0.7)
  fill.position.set(-4, -2, -3)
  scene.add(fill)

  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.35 })
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  scene.add(mesh)

  // 決定的な配置。トーラス結び目の上に並べる
  const rand = makeRandom(0x2f1e5)
  const seeds = new Float32Array(count * 4)
  const colorAttr = new Float32Array(count * 3)
  const cA = new THREE.Color('#2f6df0')
  const cB = new THREE.Color('#ffd27a')

  for (let i = 0; i < count; i++) {
    seeds[i * 4] = (i / count) * Math.PI * 2
    seeds[i * 4 + 1] = 0.6 + rand() * 0.8
    seeds[i * 4 + 2] = rand() * Math.PI * 2
    seeds[i * 4 + 3] = 0.1 + rand() * 0.16

    const t = rand()
    colorAttr[i * 3] = cA.r + (cB.r - cA.r) * t
    colorAttr[i * 3 + 1] = cA.g + (cB.g - cA.g) * t
    colorAttr[i * 3 + 2] = cA.b + (cB.b - cA.b) * t
  }
  const instColor = new THREE.InstancedBufferAttribute(colorAttr, 3)
  mesh.instanceColor = instColor

  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  const euler = new THREE.Euler()

  let spin = 0.6

  function update(time) {
    for (let i = 0; i < count; i++) {
      const a = seeds[i * 4] + time * 0.16
      const r = seeds[i * 4 + 1]
      const ph = seeds[i * 4 + 2]
      const s = seeds[i * 4 + 3]

      // トーラス結び目 (2,3)
      const p = 2
      const q = 3
      const cu = Math.cos(a * q)
      const rad = 1.6 + 0.55 * cu
      pos.set(
        rad * Math.cos(a * p),
        0.55 * Math.sin(a * q) + Math.sin(time * 0.9 + ph) * 0.18,
        rad * Math.sin(a * p),
      )
      pos.multiplyScalar(r * 0.9 + 0.5)

      euler.set(a * 2 + time * spin, ph + time * spin * 0.7, a)
      quat.setFromEuler(euler)
      scl.setScalar(s)
      m.compose(pos, quat, scl)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.rotation.y = time * 0.12
  }

  function render(time) {
    update(time)
    renderer.render(scene, camera)
  }

  function resize(w, h, nextDpr) {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w * nextDpr, h * nextDpr, false)
  }

  function setParams(p) {
    if (typeof p.spin === 'number') spin = p.spin
    if (typeof p.metalness === 'number') material.metalness = p.metalness
    if (typeof p.roughness === 'number') material.roughness = p.roughness
    if (p.background) scene.background.set(p.background)
  }

  function dispose() {
    geometry.dispose()
    material.dispose()
    renderer.dispose()
  }

  return { render, resize, setParams, dispose }
}
