import * as THREE from 'three'

/**
 * ポータルの数学。
 *
 * 2 枚の窓を対にして、片方の前に立ったときに**もう片方の裏から覗いた景色**を
 * 描く。そのためのカメラ移動と、余計な物を写さないための near 面の傾けを
 * ここに置く。three に依存するが描画はしない。
 */

const _m = new THREE.Matrix4()
const _flip = new THREE.Matrix4().makeRotationY(Math.PI)
const _plane = new THREE.Plane()
const _v = new THREE.Vector3()
const _q = new THREE.Vector4()

/**
 * 窓 A から窓 B への変換。
 *
 *   A のローカルへ戻す → 180° 回す → B のワールドへ出す
 *
 * **180° 回すのを忘れない。** 窓は向かい合っているので、A の前に立つ人は
 * B の**裏**から出る。回さないと、覗いた景色が左右反転する。
 */
export function pairMatrix(portalA, portalB, out = new THREE.Matrix4()) {
  portalA.updateWorldMatrix(true, false)
  portalB.updateWorldMatrix(true, false)
  _m.copy(portalA.matrixWorld).invert()
  return out.copy(portalB.matrixWorld).multiply(_flip).multiply(_m)
}

/**
 * 仮想カメラを置く。
 *
 * 本体のカメラの姿勢に対の変換を掛けるだけ。**位置だけ動かして向きを
 * 変えないと、窓の中の景色が首を振らない。** 行列ごと変換する。
 */
export function placeVirtualCamera(camera, pair, out) {
  out.matrixWorld.multiplyMatrices(pair, camera.matrixWorld)
  out.matrixWorld.decompose(out.position, out.quaternion, out.scale)
  out.matrixWorldInverse.copy(out.matrixWorld).invert()
  out.projectionMatrix.copy(camera.projectionMatrix)
  out.projectionMatrixInverse.copy(camera.projectionMatrixInverse)
  out.fov = camera.fov
  out.aspect = camera.aspect
  out.near = camera.near
  out.far = camera.far
  return out
}

/**
 * near 面を窓の面へ倒す（斜め錐台クリップ）。
 *
 * これが無いと**窓の向こう側の部屋のうち、窓より手前にある物まで描かれる**。
 * 覗いた景色に、本来は背後にあるはずの壁や床が割り込む。
 *
 * Lengyel の手法。射影行列の第 3 行を、クリップ空間での平面の式に置き換える。
 * 平面はビュー空間で与える。
 */
export function obliqueNearPlane(camera, portal, sign) {
  portal.updateWorldMatrix(true, false)

  // 窓の法線と 1 点をビュー空間へ
  _v.set(0, 0, 1).transformDirection(portal.matrixWorld).multiplyScalar(sign)
  const point = new THREE.Vector3().setFromMatrixPosition(portal.matrixWorld)
  _plane.setFromNormalAndCoplanarPoint(_v, point)
  _plane.applyMatrix4(camera.matrixWorldInverse)

  // ビュー空間の平面（a, b, c, d）
  _q.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant)

  const p = camera.projectionMatrix
  const e = p.elements

  /*
   * far 面の隅（クリップ空間で平面と符号が逆の角）を射影の逆で戻し、
   * それを使って第 3 行の倍率を決める。**倍率を合わせないと、far 面が
   * 手前へ寄って遠くの物が消える。**
   */
  const corner = new THREE.Vector4(
    (Math.sign(_q.x) + e[8]) / e[0],
    (Math.sign(_q.y) + e[9]) / e[5],
    -1,
    (1 + e[10]) / e[14],
  )

  const dot = _q.x * corner.x + _q.y * corner.y + _q.z * corner.z + _q.w * corner.w
  if (Math.abs(dot) < 1e-6) return
  const s = 2 / dot

  e[2] = _q.x * s
  e[6] = _q.y * s
  e[10] = _q.z * s + 1
  e[14] = _q.w * s

  camera.projectionMatrixInverse.copy(p).invert()
}

/**
 * 窓を跨いだか。跨いでいれば、跨いだ瞬間の割合 t を返す。
 *
 * 面を跨いだだけでは足りない。**窓の枠の中で跨いだときだけ**通す。
 * 枠の外を回り込んだのに転送されると、壁を抜けたように見える。
 *
 * t を返すのは、**跨いだ地点まで戻してから転送する**ため。フレームが落ちる
 * と 1 フレームで 0.3 単位ほど進むので、越えた場所で転送すると行き先でも
 * 同じだけ深く入り、壁の中に出て画面が一瞬黒くなる。
 */
export function crossed(prev, next, portal, halfWidth, halfHeight) {
  portal.updateWorldMatrix(true, false)
  const inv = _m.copy(portal.matrixWorld).invert()
  const a = _v.copy(prev).applyMatrix4(inv)
  const az = a.z
  const b = new THREE.Vector3().copy(next).applyMatrix4(inv)

  // 前から後ろへ抜けたときだけ
  if (az <= 0 || b.z > 0) return -1
  const t = az / (az - b.z)
  const hx = a.x + (b.x - a.x) * t
  const hy = a.y + (b.y - a.y) * t
  if (Math.abs(hx) > halfWidth || Math.abs(hy) > halfHeight) return -1
  return t
}
