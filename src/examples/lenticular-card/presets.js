/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  // 焼き
  views: 24,
  maxAngle: 26,      // 度
  parallax: 0.42,
  hiddenAt: 0.74,

  // レンズ
  lenses: 96,        // カード横あたりの本数
  focal: 0.92,
  bleed: 0.55,
  aberration: 0.55,
  ridge: 0.35,
  sheen: 0.75,
  grain: 0.10,

  // 操作
  /*
   * ポインタでどれだけ傾くか。**大きすぎると画面から出る。**
   * 0.9（約 52 度）で試したら、端でカードが枠の外へ逃げた。
   */
  tilt: 0.52,
  gyro: true,
  background: '#0d0f14',
  tint: '#5f7fbe',
  accent: '#7fd4ff',
}

export const PRESETS = {
  card: { label: 'Card', params: { ...BASE } },
  /*
   * 粗いレンズ。**本数を減らすと 1 本が太くなり、縞と飛びが見える。**
   * 土産物のレンチキュラーはだいたいこれ。仕組みが目で分かる。
   */
  coarse: {
    label: 'Coarse lens',
    params: { ...BASE, lenses: 24, views: 12, bleed: 0.3, ridge: 0.6, aberration: 0.8, grain: 0.16 },
  },
  /*
   * 枚数を絞った切り替え。**視差ではなく「別の絵に変わる」**見え方。
   * flip タイプのレンチキュラー。
   */
  flip: {
    label: 'Flip',
    params: { ...BASE, views: 4, bleed: 0.18, parallax: 0.9, hiddenAt: 0.45, aberration: 0.7 },
  },
  /*
   * レンズを外した状態。**これが下に刷ってある絵。**
   * 短冊に切り刻まれているだけ、と分かると仕組みが腑に落ちる。
   */
  raw: {
    label: 'Print only',
    params: { ...BASE, focal: 0.0, bleed: 0.0, aberration: 0.0, sheen: 0.0, ridge: 0.0 },
  },
}

export const DEFAULT_PRESET = 'card'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([k, v]) => [v.label, k]),
)
