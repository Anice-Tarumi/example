import * as THREE from 'three'
import { resolveSphereCollisions } from '../../shared/collideSpheres'

/**
 * 上から降ってきた破片が積み重なって、絵になる。
 *
 * **順方向のシミュレーションだけで作る。逆再生はしない。**
 * 重力は時間反転しても成立するが、摩擦や反発係数はエネルギーを奪う操作なので、
 * 逆に回すとエネルギーを生む。静止した瓦礫が理由もなく動き出し、
 * 接触していた破片が原因なく離れる。一目で逆再生だと分かる。
 *
 * 代わりに **着地点を絵から決めておく**。
 *   1. 絵の不透明な画素から着地スロットを撒く
 *   2. 各破片をそのスロットの真上から落とす
 *   3. 衝突ありで積もらせる
 *
 * 真上から落ちるのでほぼスロットに着く。そのわずかなズレが、
 * 印刷したような整い方ではなく「自然に積もった」見え方を作る。
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * 絵から着地スロットを撒く。
 *
 * 一様乱択だと粗密ができるので、格子を切ってセルごとに 1 点だけ置く（ジッタ格子）。
 * ブルーノイズほど厳密ではないが、抜けと固まりが目に見えて減る。
 */
export function sampleSlots(image, { count, width, depth, alphaThreshold = 0.4, seed = 0x51c0 }) {
  const canvas = document.createElement('canvas')
  const w = 256
  const h = 256
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data

  const rand = makeRandom(seed)

  // 有効画素を数えてから格子の細かさを決める
  let solid = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] / 255 > alphaThreshold) solid++
  if (solid === 0) return { slots: [], colors: [] }

  const coverage = solid / (w * h)
  const grid = Math.max(2, Math.round(Math.sqrt(count / Math.max(coverage, 1e-3))))

  const slots = []
  const colors = []

  for (let gy = 0; gy < grid && slots.length < count; gy++) {
    for (let gx = 0; gx < grid && slots.length < count; gx++) {
      // セル内をランダムに 1 点
      const u = (gx + rand()) / grid
      const v = (gy + rand()) / grid
      const sx = Math.min(w - 1, Math.floor(u * w))
      const sy = Math.min(h - 1, Math.floor(v * h))
      const idx = (sy * w + sx) * 4
      if (data[idx + 3] / 255 <= alphaThreshold) continue

      slots.push([(u - 0.5) * width, (0.5 - v) * depth])
      colors.push([data[idx] / 255, data[idx + 1] / 255, data[idx + 2] / 255])
    }
  }

  return { slots, colors }
}

/**
 * 落下と堆積を焼く。出力は VAT と同じ 2 枚の Float テクスチャ。
 * 実行時は (破片, フレーム) で引くだけ。
 */
export function bakeAssembly({
  slots,
  frames,
  fps = 30,
  dropHeight = 6,
  spread = 0.12,
  stagger = 0.55,
  pieceSize = 0.07,
  sizeVariation = 0.45,
  floorY = 0,
  // よく跳ねる・よく滑ると山が広がって絵がぼやける。どちらも小さく
  restitution = 0.04,
  friction = 0.62,
  substeps = 2,
  seed = 0x9e11,
}) {
  const rand = makeRandom(seed)
  const count = slots.length

  const px = new Float64Array(count)
  const py = new Float64Array(count)
  const pz = new Float64Array(count)
  const vx = new Float64Array(count)
  const vy = new Float64Array(count)
  const vz = new Float64Array(count)
  const radius = new Float64Array(count)
  const invMass = new Float64Array(count)
  const delay = new Float64Array(count)

  const sizes = new Float32Array(count * 3)
  const quats = []
  const spins = []

  let maxR = 0
  for (let i = 0; i < count; i++) {
    const [tx, tz] = slots[i]
    const s = pieceSize * (1 - sizeVariation * 0.5 + rand() * sizeVariation)

    sizes[i * 3] = s * (0.8 + rand() * 0.6)
    sizes[i * 3 + 1] = s * (0.35 + rand() * 0.4)
    sizes[i * 3 + 2] = s * (0.8 + rand() * 0.6)

    // 目標の真上。水平のばらつきは小さく。大きいと絵が崩れる
    px[i] = tx + (rand() - 0.5) * spread
    pz[i] = tz + (rand() - 0.5) * spread
    py[i] = floorY + dropHeight * (0.55 + rand() * 0.75)

    vx[i] = (rand() - 0.5) * 0.15
    vz[i] = (rand() - 0.5) * 0.15
    vy[i] = 0

    // 一斉に降ると壁が落ちてくるように見える。降り始めをずらす
    delay[i] = rand() * stagger

    const r = 0.5 * Math.hypot(sizes[i * 3], sizes[i * 3 + 1], sizes[i * 3 + 2]) * 0.8
    radius[i] = r
    invMass[i] = 1 / (r * r * r)
    if (r > maxR) maxR = r

    quats.push(new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI),
    ))
    spins.push(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(3.5))
  }

  const state = { px, py, pz, vx, vy, vz, radius, invMass, count }
  const cell = Math.max(maxR * 2, 1e-3)

  const posData = new Float32Array(count * frames * 4)
  const oriData = new Float32Array(count * frames * 4)

  const spinQuat = new THREE.Quaternion()
  const axis = new THREE.Vector3()
  const dtFrame = 1 / fps
  const onHit = (i, j) => {
    spins[i].multiplyScalar(0.86)
    spins[j].multiplyScalar(0.86)
  }

  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < count; i++) {
      const idx = (f * count + i) * 4
      posData[idx] = px[i]
      posData[idx + 1] = py[i]
      posData[idx + 2] = pz[i]
      posData[idx + 3] = 1

      const q = quats[i]
      oriData[idx] = q.x
      oriData[idx + 1] = q.y
      oriData[idx + 2] = q.z
      oriData[idx + 3] = q.w
    }

    const sub = Math.max(1, substeps)
    const dt = dtFrame / sub
    const t = f * dtFrame

    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < count; i++) {
        // 降り始めるまでは空中で止めておく
        if (t < delay[i]) continue
        vy[i] -= 9.8 * dt
        px[i] += vx[i] * dt
        py[i] += vy[i] * dt
        pz[i] += vz[i] * dt
      }

      resolveSphereCollisions(state, { cell, restitution, onHit })

      for (let i = 0; i < count; i++) {
        const limit = floorY + radius[i]
        if (py[i] < limit) {
          py[i] = limit
          if (vy[i] < 0) vy[i] *= -restitution
          vx[i] *= friction
          vz[i] *= friction
          spins[i].multiplyScalar(0.6)
        }
      }
    }

    for (let i = 0; i < count; i++) {
      const spin = spins[i]
      const len = spin.length()
      if (len > 1e-5) {
        axis.copy(spin).divideScalar(len)
        spinQuat.setFromAxisAngle(axis, len * dtFrame)
        quats[i].premultiply(spinQuat)
      }
    }
  }

  const makeTex = (data) => {
    const tex = new THREE.DataTexture(data, count, frames, THREE.RGBAFormat, THREE.FloatType)
    tex.minFilter = THREE.NearestFilter
    tex.magFilter = THREE.NearestFilter
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.needsUpdate = true
    return tex
  }

  return {
    positionTexture: makeTex(posData),
    orientTexture: makeTex(oriData),
    sizes,
    count,
    frames,
  }
}
