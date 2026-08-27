import * as THREE from 'three'

/**
 * ドラッグの軌跡を溜めて、Catmull-Rom スプラインの係数に展開する。
 *
 * シェーダーに制御点そのものを渡すと、頂点ごとに基底行列を掛け直すことになる。
 * **JS 側で 3 次多項式の係数まで展開しておけば**、シェーダーは
 * ホーナー法の評価だけで済む（分岐も行列積も無い）。
 *
 *   p(t) = sp1 + t(sp2 + t(sp3 + t·sp4))
 *
 * vec4 の w にはロール角を載せる。位置とねじれを 1 本の配列で運ぶ。
 */

/** シェーダー側の配列長。WebGL1 の uniform 上限を考えるとこの辺が現実的 */
export const SEGS = 16

/** 一定距離ごとにアンカーを打つ。生の入力をそのまま点列にしない */
export class Stroke {
  constructor(segLength = 0.12) {
    this.segLength = segLength
    this.points = []
    this.length = 0
  }

  /** 最後のアンカーから segLength 以上離れたら 1 点足す */
  step(p) {
    if (this.points.length === 0) {
      this.points.push(p.clone())
      return true
    }
    const last = this.points[this.points.length - 1]
    const d = last.distanceTo(p)
    if (d < this.segLength) return false

    // 飛んだぶんは埋める。速く動かしても点が粗くならない
    const n = Math.min(Math.floor(d / this.segLength), 8)
    for (let i = 1; i <= n; i++) {
      const q = last.clone().lerp(p, (i * this.segLength) / d)
      this.points.push(q)
      this.length += this.segLength
    }
    return true
  }
}

const _p0 = new THREE.Vector3()
const _p1 = new THREE.Vector3()
const _p2 = new THREE.Vector3()
const _p3 = new THREE.Vector3()
const _tan = new THREE.Vector3()
const _up = new THREE.Vector3()
const _side = new THREE.Vector3()

/** 端は折り返して外挿する。両端で曲率が跳ねないように */
function nodeAt(nodes, i) {
  const n = nodes.length
  if (i < 0) return nodes[0]
  if (i >= n) return nodes[n - 1]
  return nodes[i]
}

/**
 * 制御点列 → 係数配列。
 *
 * @param nodes  SEGS+1 個の THREE.Vector3
 * @param iv     長さ SEGS*4 の THREE.Vector4 配列（破壊的に書き換える）
 * @param nrm    長さ SEGS+1 の THREE.Vector3 配列（同上）
 * @param roll   節点ごとのねじれ角（省略可）
 */
export function buildSplineUniforms(nodes, iv, nrm, roll) {
  const count = SEGS

  for (let i = 0; i < count; i++) {
    _p0.copy(nodeAt(nodes, i - 1))
    _p1.copy(nodeAt(nodes, i))
    _p2.copy(nodeAt(nodes, i + 1))
    _p3.copy(nodeAt(nodes, i + 2))

    const o = i * 4
    // Catmull-Rom（張力 0.5）の基底を展開した形
    iv[o + 0].set(_p1.x, _p1.y, _p1.z, roll ? roll[i] : 0)
    iv[o + 1].set(
      0.5 * (_p2.x - _p0.x),
      0.5 * (_p2.y - _p0.y),
      0.5 * (_p2.z - _p0.z),
      roll ? 0.5 * ((roll[i + 1] ?? 0) - (roll[i - 1] ?? 0)) : 0,
    )
    iv[o + 2].set(
      0.5 * (2 * _p0.x - 5 * _p1.x + 4 * _p2.x - _p3.x),
      0.5 * (2 * _p0.y - 5 * _p1.y + 4 * _p2.y - _p3.y),
      0.5 * (2 * _p0.z - 5 * _p1.z + 4 * _p2.z - _p3.z),
      0,
    )
    iv[o + 3].set(
      0.5 * (-_p0.x + 3 * _p1.x - 3 * _p2.x + _p3.x),
      0.5 * (-_p0.y + 3 * _p1.y - 3 * _p2.y + _p3.y),
      0.5 * (-_p0.z + 3 * _p1.z - 3 * _p2.z + _p3.z),
      0,
    )
  }

  /*
   * 節点ごとの up。
   * 接線と平行になるとフレネ枠が壊れるので、直前の up を接線に直交化して運ぶ
   * （平行移動フレーム）。曲率 0 の点で法線が飛ぶのを防ぐ。
   */
  _up.set(0, 0, 1)
  for (let i = 0; i <= count; i++) {
    const a = nodeAt(nodes, i)
    const b = nodeAt(nodes, i + 1)
    _tan.subVectors(b, a)
    if (_tan.lengthSq() < 1e-10) _tan.set(0, 1, 0)
    _tan.normalize()

    _side.crossVectors(_up, _tan)
    if (_side.lengthSq() < 1e-8) {
      // up が接線と平行。別の軸から作り直す
      _side.set(1, 0, 0).cross(_tan)
      if (_side.lengthSq() < 1e-8) _side.set(0, 0, 1).cross(_tan)
    }
    _side.normalize()
    _up.crossVectors(_tan, _side).normalize()
    nrm[i].copy(_up)
  }
}

/**
 * 溜めた点列を SEGS+1 点へ等間隔に取り直す。
 *
 * 元実装は 47 セグメントのスプラインを 16 セグメント × 4 メッシュに分けて
 * uniform 上限に収めていた。ここは 1 本のまま、毎フレーム取り直す。
 * ドラッグで点が増え続けても uniform の長さは変わらない。
 */
export function resample(points, out) {
  const n = points.length
  if (n === 0) return false

  if (n === 1) {
    for (let i = 0; i <= SEGS; i++) out[i].copy(points[0])
    return true
  }

  // 累積長
  let total = 0
  const acc = [0]
  for (let i = 1; i < n; i++) {
    total += points[i].distanceTo(points[i - 1])
    acc.push(total)
  }
  if (total < 1e-6) {
    for (let i = 0; i <= SEGS; i++) out[i].copy(points[0])
    return true
  }

  let seek = 1
  for (let i = 0; i <= SEGS; i++) {
    const target = (i / SEGS) * total
    while (seek < n - 1 && acc[seek] < target) seek++
    const a = points[seek - 1]
    const b = points[seek]
    const span = acc[seek] - acc[seek - 1]
    const t = span > 1e-6 ? (target - acc[seek - 1]) / span : 0
    out[i].copy(a).lerp(b, t)
  }
  return true
}
