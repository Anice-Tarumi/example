import * as THREE from 'three'

/**
 * 都市を結ぶ弧。
 *
 * 2 点を直線で結ぶと球にめり込む。球面を這わせると地表に貼り付いて見えない。
 * **大圏に沿わせたまま外へ持ち上げる。** 遠い相手ほど高く上げる。
 */

const DEG = Math.PI / 180

/** 緯度経度から単位球へ。経度は東を正に取る */
export function latLngToVec3(lat, lng, radius = 1, out = new THREE.Vector3()) {
  const p = lat * DEG
  const l = lng * DEG
  return out.set(
    Math.cos(p) * Math.cos(l) * radius,
    Math.sin(p) * radius,
    -Math.cos(p) * Math.sin(l) * radius,
  )
}

/** 適当に散らした都市。座標は概数で足りる */
export const CITIES = [
  [35.68, 139.69], [34.69, 135.5], [37.57, 126.98], [31.23, 121.47], [22.32, 114.17],
  [1.35, 103.82], [13.75, 100.5], [28.61, 77.21], [19.08, 72.88], [25.2, 55.27],
  [41.01, 28.98], [55.75, 37.62], [59.33, 18.07], [52.52, 13.4], [48.86, 2.35],
  [51.51, -0.13], [40.42, -3.7], [41.9, 12.5], [-33.92, 18.42], [6.52, 3.38],
  [30.04, 31.24], [-1.29, 36.82], [40.71, -74.01], [37.77, -122.42], [34.05, -118.24],
  [41.88, -87.63], [43.65, -79.38], [19.43, -99.13], [-23.55, -46.63], [-34.6, -58.38],
  [4.71, -74.07], [-12.05, -77.04], [-33.87, 151.21], [-37.81, 144.96], [-36.85, 174.76],
  [64.15, -21.94], [1.29, 103.85], [23.13, 113.26],
]

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _q = new THREE.Quaternion()

/**
 * 大圏上の点。2 点の間の角度で球面線形補間する。
 *
 * `lerp` してから正規化しても近い結果にはなるが、**遠い相手ほど中央が
 * 詰まる。** 弧の上の点が等間隔でなくなり、頭が途中で失速して見える。
 */
function slerpOnSphere(a, b, t, out) {
  _axis.crossVectors(a, b)
  const len = _axis.length()
  if (len < 1e-6) return out.copy(a)
  _axis.divideScalar(len)
  const ang = Math.atan2(len, a.dot(b))
  _q.setFromAxisAngle(_axis, ang * t)
  return out.copy(a).applyQuaternion(_q)
}

/**
 * 1 本ぶんの制御点。
 *
 * 3 次ベジェにする。2 次だと持ち上げた頂点が 1 つしかなく、
 * 両端の立ち上がりが急になって、地面から生えた棒に見える。
 */
export function buildArc(from, to, lift = 0.55) {
  const a = latLngToVec3(from[0], from[1], 1, _a)
  const b = latLngToVec3(to[0], to[1], 1, _b)
  // 2 点の間の角度。半周で π
  const dist = a.angleTo(b) / Math.PI

  const c1 = slerpOnSphere(a, b, 0.28, new THREE.Vector3())
  const c2 = slerpOnSphere(a, b, 0.72, new THREE.Vector3())
  // 遠い相手ほど高く。近距離まで高く上げると、点の真上へ跳ねて不自然
  const h = 1 + lift * dist
  c1.multiplyScalar(h)
  c2.multiplyScalar(h)

  return {
    start: a.clone(),
    c1,
    c2,
    end: b.clone(),
    dist,
  }
}

/** 都市の組を引く。同じ都市どうしは弾く */
export function pickRoute(rand) {
  const i = Math.floor(rand() * CITIES.length)
  let j = Math.floor(rand() * CITIES.length)
  if (j === i) j = (j + 1) % CITIES.length
  return [CITIES[i], CITIES[j]]
}

export function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
