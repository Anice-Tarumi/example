import * as THREE from 'three'

/**
 * 糸（strand）を束ねて球を作る。
 *
 * 本家（BlueYard）は GLB に per-strand 属性を焼き込んで持ってくる。
 * ここは外部アセットを持たないので手続きで生成するが、**属性の設計は同じ**。
 *
 *   aLen     … 糸の長さ方向パラメータ 0..1
 *   aStrand1 … 糸ごとのバリエーション（色・太さのばらつき）
 *   aStrand2 … 同上（位相のばらつき）
 *   aBundle  … 束の ID
 *
 * この 4 つがあれば、位相も色もリビール順も **シェーダーの中だけ**で散らせる。
 * CPU 側で糸ごとにループを回す必要がない。
 *
 * 太さは画面空間で付ける。頂点を接線に垂直な向きへ ±1 ずらす情報（aSide）を持たせ、
 * 頂点シェーダーがクリップ空間で押し出す。`THREE.Line` は太さを持てないので、
 * 細い糸を安定して出すにはこの方法になる。
 */

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 3D の緩いノイズ。糸を揺らすためだけなので簡易でよい */
function wobble(a, b, c, t) {
  return (
    Math.sin(t * 1.7 + a) * 0.6 + Math.sin(t * 2.9 + b) * 0.3 + Math.sin(t * 4.7 + c) * 0.15
  )
}

const _axis = new THREE.Vector3()
const _start = new THREE.Vector3()
const _p = new THREE.Vector3()
const _prev = new THREE.Vector3()
const _next = new THREE.Vector3()
const _tan = new THREE.Vector3()
const _q = new THREE.Quaternion()

/**
 * @param bundles       束の数
 * @param perBundle     1 束あたりの糸の数
 * @param samples       1 本あたりの分割数
 * @param radius        球の半径
 * @param spread        束の中で糸をどれだけ散らすか
 * @param wobbleAmount  糸の揺らぎ
 */
export function buildStrandOrb({
  bundles = 14,
  perBundle = 18,
  samples = 72,
  radius = 1,
  spread = 0.22,
  wobbleAmount = 0.12,
  seed = 0x51ea,
}) {
  const rand = makeRandom(seed)
  const strandCount = bundles * perBundle
  const vertsPerStrand = samples * 2
  const total = strandCount * vertsPerStrand

  const position = new Float32Array(total * 3)
  const tangent = new Float32Array(total * 3)
  const side = new Float32Array(total)
  const aLen = new Float32Array(total)
  const strand1 = new Float32Array(total)
  const strand2 = new Float32Array(total)
  const bundleId = new Float32Array(total)

  // 三角形 2 枚 / 区間のリボン
  const indices = new Uint32Array(strandCount * (samples - 1) * 6)

  const pts = new Array(samples)
  for (let i = 0; i < samples; i++) pts[i] = new THREE.Vector3()

  let v = 0
  let idx = 0

  for (let b = 0; b < bundles; b++) {
    // 束ごとの回転軸。この軸まわりの大円が束の芯になる
    const u = rand() * 2 - 1
    const th = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    _axis.set(Math.cos(th) * s, u, Math.sin(th) * s).normalize()

    const bundleT = b / Math.max(bundles - 1, 1)
    const arc = Math.PI * (0.75 + rand() * 0.9)
    const phase = rand() * Math.PI * 2

    for (let k = 0; k < perBundle; k++) {
      const st1 = rand()
      const st2 = rand()

      // 束の芯からずらした開始点
      _start.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
      if (_start.lengthSq() < 1e-6) _start.set(1, 0, 0)
      _start.normalize()
      // 軸と直交させてから、束の広がりぶんだけ傾ける
      _start.addScaledVector(_axis, -_start.dot(_axis)).normalize()
      _start.addScaledVector(_axis, (rand() * 2 - 1) * spread).normalize()

      const a1 = st1 * 12.9
      const a2 = st2 * 7.3
      const a3 = bundleT * 5.1

      for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1)
        _q.setFromAxisAngle(_axis, phase + t * arc)
        _p.copy(_start).applyQuaternion(_q)

        // 半径を揺らす。全部が同じ球面に乗っていると板に見える
        const w = wobble(a1, a2, a3, t * 6.0)
        _p.multiplyScalar(radius * (1 + w * wobbleAmount))
        pts[i].copy(_p)
      }

      for (let i = 0; i < samples; i++) {
        _prev.copy(pts[Math.max(i - 1, 0)])
        _next.copy(pts[Math.min(i + 1, samples - 1)])
        _tan.subVectors(_next, _prev)
        if (_tan.lengthSq() < 1e-10) _tan.set(0, 1, 0)
        _tan.normalize()

        const t = i / (samples - 1)
        for (let e = 0; e < 2; e++) {
          const o = v * 3
          position[o] = pts[i].x
          position[o + 1] = pts[i].y
          position[o + 2] = pts[i].z
          tangent[o] = _tan.x
          tangent[o + 1] = _tan.y
          tangent[o + 2] = _tan.z
          side[v] = e === 0 ? -1 : 1
          aLen[v] = t
          strand1[v] = st1
          strand2[v] = st2
          bundleId[v] = bundleT
          v++
        }
      }

      // リボンの index
      const base = v - vertsPerStrand
      for (let i = 0; i < samples - 1; i++) {
        const a = base + i * 2
        indices[idx++] = a
        indices[idx++] = a + 1
        indices[idx++] = a + 2
        indices[idx++] = a + 1
        indices[idx++] = a + 3
        indices[idx++] = a + 2
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('aTangent', new THREE.BufferAttribute(tangent, 3))
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
  geo.setAttribute('aLen', new THREE.BufferAttribute(aLen, 1))
  geo.setAttribute('aStrand1', new THREE.BufferAttribute(strand1, 1))
  geo.setAttribute('aStrand2', new THREE.BufferAttribute(strand2, 1))
  geo.setAttribute('aBundle', new THREE.BufferAttribute(bundleId, 1))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 2)

  return { geometry: geo, strandCount }
}
