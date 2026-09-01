import * as THREE from 'three'

/**
 * 一日のライティングを**キーフレームで持ち、間を補間する**。
 *
 * 太陽の角度から色を式で導く方法もあるが、実際の絵作りでは
 * 「夕方だけ空をもっと赤く」「夜は環境光を持ち上げて潰れないように」
 * といった調整が必ず入る。式に手を入れるとどの時刻にも影響が出るので、
 * **時刻ごとに値を置いて間を補間する**ほうが、後から触りやすい。
 *
 * 補間は Catmull-Rom。線形だと日の出前後で色の変化が折れ線になり、
 * 「切り替わった」ように見える。
 *
 * 一日は 0..1 で一周する。キーフレームは端がつながるように巡回で読む。
 */

const K = (t, o) => ({ t, ...o })

/** 時刻 0 = 真夜中、0.25 = 日の出、0.5 = 正午、0.75 = 日没 */
export const KEYFRAMES = [
  K(0.0, {
    sunHeight: -0.35, sunAzimuth: 0.0,
    sun: '#20304e', sunPower: 0.12,
    skyTop: '#050a17', skyHorizon: '#0d1526',
    fog: '#0a111f', fogSun: '#16233c',
    ambient: 0.22, exposure: 0.9,
  }),
  K(0.22, {
    sunHeight: -0.05, sunAzimuth: 0.15,
    sun: '#ff9b5a', sunPower: 0.7,
    skyTop: '#1d3a63', skyHorizon: '#e2794a',
    fog: '#5a5a74', fogSun: '#f0a06a',
    ambient: 0.35, exposure: 1.0,
  }),
  K(0.3, {
    sunHeight: 0.25, sunAzimuth: 0.25,
    sun: '#ffd7a8', sunPower: 1.6,
    skyTop: '#3f7bc4', skyHorizon: '#bcd6ec',
    fog: '#b9cadd', fogSun: '#ffd9b3',
    ambient: 0.5, exposure: 1.05,
  }),
  K(0.5, {
    sunHeight: 0.95, sunAzimuth: 0.5,
    sun: '#fff6e6', sunPower: 2.4,
    skyTop: '#2e6fd0', skyHorizon: '#cfe2f2',
    fog: '#cdddea', fogSun: '#eef4fb',
    ambient: 0.6, exposure: 1.0,
  }),
  K(0.7, {
    sunHeight: 0.28, sunAzimuth: 0.75,
    sun: '#ffc07a', sunPower: 1.5,
    skyTop: '#37639f', skyHorizon: '#e7a374',
    fog: '#b6a6a2', fogSun: '#ffc590',
    ambient: 0.48, exposure: 1.05,
  }),
  K(0.78, {
    sunHeight: 0.02, sunAzimuth: 0.85,
    sun: '#ff6a3d', sunPower: 0.85,
    skyTop: '#1b2f57', skyHorizon: '#f06a3a',
    fog: '#6b5566', fogSun: '#ff8a52',
    ambient: 0.34, exposure: 1.0,
  }),
  K(0.88, {
    sunHeight: -0.2, sunAzimuth: 0.95,
    sun: '#3a3f6b', sunPower: 0.22,
    skyTop: '#0a1226', skyHorizon: '#2a2447',
    fog: '#1b1f33', fogSun: '#332c4c',
    ambient: 0.26, exposure: 0.95,
  }),
]

const COLOR_KEYS = ['sun', 'skyTop', 'skyHorizon', 'fog', 'fogSun']
const NUM_KEYS = ['sunHeight', 'sunAzimuth', 'sunPower', 'ambient', 'exposure']

/** Catmull-Rom。端は巡回させる */
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

const tmpA = new THREE.Color()
const tmpB = new THREE.Color()

export function createCycleState() {
  return {
    sunDir: new THREE.Vector3(),
    sun: new THREE.Color(),
    skyTop: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    fog: new THREE.Color(),
    fogSun: new THREE.Color(),
    sunPower: 1,
    ambient: 0.5,
    exposure: 1,
  }
}

/**
 * 時刻（0..1）と天候（0..1）から今のライティングを求める。
 *
 * 天候はキーフレームの上に**後から掛ける**。時刻ごとに晴れと曇りの
 * キーフレームを両方置くと表が倍になり、調整が破綻する。
 */
export function evalCycle(time, weather, out) {
  const n = KEYFRAMES.length
  const t = ((time % 1) + 1) % 1

  // 区間を探す。キーは巡回するので、最後の区間は先頭へ戻る
  let i = 0
  while (i < n && KEYFRAMES[i].t <= t) i++
  const i1 = (i - 1 + n) % n
  const i2 = i % n
  const i0 = (i1 - 1 + n) % n
  const i3 = (i2 + 1) % n

  const t1 = KEYFRAMES[i1].t
  let t2 = KEYFRAMES[i2].t
  if (t2 <= t1) t2 += 1
  const local = (t - t1 + (t < t1 ? 1 : 0)) / (t2 - t1)

  for (const k of NUM_KEYS) {
    out[k] = catmull(KEYFRAMES[i0][k], KEYFRAMES[i1][k], KEYFRAMES[i2][k], KEYFRAMES[i3][k], local)
  }
  for (const k of COLOR_KEYS) {
    tmpA.set(KEYFRAMES[i1][k])
    tmpB.set(KEYFRAMES[i2][k])
    // 色は Catmull-Rom だと補間で範囲外へ飛んで彩度が暴れる。線形で足りる
    out[k].copy(tmpA).lerp(tmpB, local)
  }

  // 太陽の向き。高さと方位から
  const h = out.sunHeight
  const az = out.sunAzimuth * Math.PI * 2
  out.sunDir.set(Math.cos(az) * Math.sqrt(Math.max(0, 1 - h * h)), h, Math.sin(az) * 0.35).normalize()

  /*
   * 天候。曇るほど太陽は弱く、空と霧は灰へ寄り、環境光は上がる。
   * 直射が減って全体が回り込んだ光になる、という現実の挙動に合わせる。
   */
  if (weather > 0) {
    const w = Math.min(1, weather)
    out.sunPower *= 1 - w * 0.85
    out.ambient = out.ambient * (1 - w) + (out.ambient * 1.35 + 0.1) * w
    const grey = 0.35 + 0.25 * (1 - Math.abs(t - 0.5) * 2)
    tmpA.setRGB(grey, grey, grey * 1.04)
    out.skyTop.lerp(tmpA, w * 0.8)
    out.skyHorizon.lerp(tmpA, w * 0.7)
    out.fog.lerp(tmpA, w * 0.75)
    out.fogSun.lerp(tmpA, w * 0.6)
  }

  return out
}
