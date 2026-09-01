import * as THREE from 'three'

/**
 * 配線。
 *
 * 手で置かない。**モニターの座標から自動生成する**。
 * 配置を変えてもケーブルが勝手に追従するので、位置がずれる問題が起きない。
 *
 * 垂れ下がる形はカテナリー。厳密な双曲線余弦でなくても、
 * 2 点の中間を距離に比例して下げれば十分それらしくなる。
 */

/** 2 点とたるみ量から、垂れ下がる曲線を作る */
function sagCurve(a, b, sag, wobble = 0) {
  const mid = a.clone().lerp(b, 0.5)
  const span = a.distanceTo(b)
  mid.y -= span * sag
  mid.x += wobble
  // 4 点にすると片側だけ持ち上がった不均等な垂れ方になる
  const q1 = a.clone().lerp(mid, 0.55)
  q1.y -= span * sag * 0.25
  const q2 = mid.clone().lerp(b, 0.45)
  q2.y -= span * sag * 0.25
  return new THREE.CatmullRomCurve3([a, q1, mid, q2, b])
}

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * モニターの配置からケーブルを組む。
 *
 * 3 系統に分ける。
 *   背面   … 隣り合うモニターの裏をつなぐ
 *   天井   … 上から垂れて各モニターへ降りる
 *   手前   … カメラとモニターの間を横切る。光る画面の前に影として乗る
 */
export function buildCables({ layout, sag = 0.35, front = 1.1, radius = 0.012, seed = 0x3c11 }) {
  const rand = makeRandom(seed)
  const curves = []

  const anchor = (place, dz, dy) =>
    new THREE.Vector3(
      place.pos[0] + Math.sin(place.rot) * dz,
      dy,
      place.pos[2] + Math.cos(place.rot) * dz,
    )

  // 背面をつなぐ
  for (let i = 0; i < layout.length - 1; i++) {
    const a = anchor(layout[i], -0.22 * layout[i].scale, 0.16 * layout[i].scale)
    const b = anchor(layout[i + 1], -0.22 * layout[i + 1].scale, 0.16 * layout[i + 1].scale)
    curves.push(sagCurve(a, b, sag * (0.7 + rand() * 0.6)))
  }

  // 天井から降ろす
  const ceiling = 3.4
  for (let i = 0; i < layout.length; i += 2) {
    const p = layout[i]
    const top = new THREE.Vector3(p.pos[0] * 0.35 + (rand() - 0.5) * 0.6, ceiling, p.pos[2] * 0.35)
    const down = anchor(p, -0.2 * p.scale, 0.5 * p.scale)
    curves.push(sagCurve(top, down, 0.12 + rand() * 0.1))
  }

  /*
   * 手前を横切る。
   * 光っている画面の前に来るので、シルエットとして乗る。
   * 奥だけに配線があると「後ろで繋がっている」だけの絵になる。
   */
  const spans = 3
  for (let i = 0; i < spans; i++) {
    const y = 0.35 + i * 0.55 + rand() * 0.2
    const z = front + rand() * 0.5
    const a = new THREE.Vector3(-3.4, y + rand() * 0.3, z)
    const b = new THREE.Vector3(3.4, y + rand() * 0.3, z - rand() * 0.4)
    curves.push(sagCurve(a, b, 0.06 + rand() * 0.05, (rand() - 0.5) * 0.8))
  }

  // まとめて 1 つのジオメトリにする。本数ぶん draw call を増やさない
  const geos = curves.map((c) => new THREE.TubeGeometry(c, 48, radius * (0.7 + rand() * 0.8), 6, false))
  const merged = mergeGeometries(geos)
  geos.forEach((g) => g.dispose())
  return merged
}

/** three の BufferGeometryUtils を使わずに位置・法線・index だけ結合する */
function mergeGeometries(list) {
  let vertexCount = 0
  let indexCount = 0
  for (const g of list) {
    vertexCount += g.attributes.position.count
    indexCount += g.index.count
  }

  const position = new Float32Array(vertexCount * 3)
  const normal = new Float32Array(vertexCount * 3)
  const index = new Uint32Array(indexCount)

  let vo = 0
  let io = 0
  for (const g of list) {
    const p = g.attributes.position.array
    const n = g.attributes.normal.array
    position.set(p, vo * 3)
    normal.set(n, vo * 3)
    const idx = g.index.array
    for (let i = 0; i < idx.length; i++) index[io + i] = idx[i] + vo
    vo += g.attributes.position.count
    io += idx.length
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.computeBoundingSphere()
  return geo
}
