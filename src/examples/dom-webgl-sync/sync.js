/**
 * DOM と WebGL の座標合わせ。
 *
 * 要は 2 つだけ。
 *
 *   1. **1 world = 1 px にする。** 正射影のカメラを画面と同じ寸法で切れば、
 *      矩形の中心へ置いて実寸へ拡大するだけで重なる。倍率を挟むと、拡大縮小の
 *      たびに合わせ直す羽目になる。
 *
 *   2. **読みと書きを分ける。** `getBoundingClientRect` はレイアウトを確定
 *      させる。1 要素ずつ「測る→動かす」を繰り返すと、そのたびに再計算が
 *      走る。全部測ってから、全部動かす。
 *
 * 位置は毎フレーム測り直す。CSS の遷移中や画像の遅延読み込みでレイアウトは
 * 動くので、一度測って使い回すとその間ずれる。数十要素なら測り直しても安い。
 */

/** DOM の矩形を、キャンバス中心を原点とする座標へ。y は上が正 */
export function rectToWorld(rect, host) {
  return {
    x: rect.left - host.left + rect.width / 2 - host.width / 2,
    y: host.height / 2 - (rect.top - host.top + rect.height / 2),
    w: rect.width,
    h: rect.height,
  }
}

/**
 * 登録された要素をまとめて測る。
 *
 * 返すのは使い回しの配列。毎フレーム新しい配列を作ると、動かしていない
 * ときでも GC が走る。
 */
export function measureAll(host, items, out) {
  const hostRect = host.getBoundingClientRect()
  for (let i = 0; i < items.length; i++) {
    const el = items[i].el
    if (!el) continue
    const r = el.getBoundingClientRect()
    const o = out[i] || (out[i] = {})
    o.x = r.left - hostRect.left + r.width / 2 - hostRect.width / 2
    o.y = hostRect.height / 2 - (r.top - hostRect.top + r.height / 2)
    o.w = r.width
    o.h = r.height
    // 画面の外に出ているか。出ていれば描かない
    o.visible = r.bottom > hostRect.top && r.top < hostRect.bottom
    // 下から入ってきた量。出現の演出に使う
    o.enter = 1 - Math.min(1, Math.max(0, (r.top - hostRect.top) / hostRect.height))
  }
  out.host = hostRect
  return out
}

/**
 * 3D の点を画面座標へ。
 *
 * `camera.project` は -1〜1 を返す。**そのまま px として使わない。**
 * 画面の寸法を掛けて、左上原点へ直す。
 */
export function projectToScreen(v, camera, width, height, out) {
  out.copy(v).project(camera)
  return {
    x: (out.x * 0.5 + 0.5) * width,
    y: (0.5 - out.y * 0.5) * height,
    // 手前が小さい。ラベルの前後判定に使う
    z: out.z,
  }
}
