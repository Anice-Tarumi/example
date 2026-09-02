import * as THREE from 'three'

/**
 * ステージ。
 *
 * 通路は**すべて直線の梁**にする。曲がり角は「別の梁へ乗り換える」で表す。
 * 面の当たり判定は持たない。歩行体は梁の上を 0→1 の媒介変数で進むだけ。
 *
 * この割り切りが効く。乗り換えの条件を**画面上で端が重なっているか**に
 * 一本化できるので、物理的に繋がっている角も、離れているのに繋がって見える
 * 錯視も、まったく同じコードで扱える。
 */

/** 梁 1 本。a → b の直線。holes は媒介変数で開いた穴 */
export function beam(a, b, holes = []) {
  return { a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), holes }
}

export const LEVEL = {
  beams: [
    // 出発。ここから右へ
    beam([-4.5, 0, -3], [0, 0, -3], [[0.28, 0.40]]),
    // 角。物理的に繋がっている
    beam([0, 0, -3], [0, 0, 1]),
    /*
     * 浮いている梁。B の終点とは 1.6 離れていて**物理的には繋がっていない**。
     * ある角度から見たときだけ端が重なる。そこが乗り換えの瞬間。
     * 途中に穴があり、柱で隠さないと落ちる。
     */
    beam([0, 1.6, 1], [4.5, 1.6, 1], [[0.42, 0.58]]),
    /*
     * 落下先。A の穴から落ちたとき、角度によってはこれが画面上の真下に来る。
     * ワールドでは遠く離れているが、見えていれば着地できる。
     */
    beam([-6, -2.2, 2.5], [-1, -2.2, 2.5]),
    // ジャンプ台の行き先。A の真上には無いが、回すと重なる角度がある
    beam([-3.5, 3.2, -0.5], [1.5, 3.2, -0.5]),
  ],
  start: { beam: 0, t: 0, dir: 1 },
  goal: { beam: 2, t: 1 },
  /**
   * ジャンプ台。踏むと**画面上で真上**に見えるものへ移る。
   * Landing の逆で、判定は同じルーチンを向きだけ変えて使う。
   */
  pads: [{ beam: 0, t: 0.62 }],
  /** 穴を隠すための柱。回すと穴の手前に来る角度がある */
  pillars: [
    { pos: [2.2, 0.9, 3.4], size: [0.9, 3.6, 0.9] },
    { pos: [-2.6, 1.4, 2.6], size: [0.7, 2.4, 0.7] },
  ],
}

/** 梁の上の点 */
export function pointOn(b, t, out = new THREE.Vector3()) {
  return out.copy(b.a).lerp(b.b, t)
}

export function isInHole(b, t) {
  return b.holes.some(([t0, t1]) => t >= t0 && t <= t1)
}

/** 穴の中心。遮蔽の判定に使う */
export function holeCenter(b, hole, out = new THREE.Vector3()) {
  return pointOn(b, (hole[0] + hole[1]) / 2, out)
}

/**
 * 穴を除いた「実際に板がある区間」。描画に使う。
 * 穴を描かないのではなく、**穴以外を描く**ほうが破綻しない。
 */
export function solidSpans(b) {
  const spans = []
  let cursor = 0
  for (const [t0, t1] of [...b.holes].sort((x, y) => x[0] - y[0])) {
    if (t0 > cursor) spans.push([cursor, t0])
    cursor = Math.max(cursor, t1)
  }
  if (cursor < 1) spans.push([cursor, 1])
  return spans
}
