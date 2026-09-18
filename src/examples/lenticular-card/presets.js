/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  // 焼き
  views: 20,
  maxAngle: 26,      // 度
  /*
   * 視差。**小さいとコマ同士が似すぎて「切り替わらない」と感じる。**
   * 0.42 で試したら、端の隠し絵以外はほぼ同じ絵に見えた。
   */
  parallax: 0.95,
  hiddenAt: 0.66,

  // レンズ
  lenses: 96,        // カード横あたりの本数
  focal: 0.92,
  bleed: 0.32,
  /*
   * 色収差。**虹にしない。** 0.55 だと帯が完全な虹になって玩具に見えた。
   * 切り替わり際に赤と青の縁が薄く出るくらいが実物。
   */
  aberration: 0.30,
  ridge: 0.35,
  sheen: 0.75,
  grain: 0.10,

  // 操作
  /*
   * ポインタでどれだけ傾くか。**大きすぎると画面から出る。**
   * 0.9（約 52 度）で試したら、端でカードが枠の外へ逃げた。
   */
  tilt: 0.60,
  showPrint: false,
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
    params: { ...BASE, views: 4, bleed: 0.16, parallax: 1.1, hiddenAt: 0.45, aberration: 0.7 },
  },
  /*
   * レンズを外した状態。**これが下に刷ってある絵。**
   * レンズ 1 本ぶんの幅に N 枚の短冊が並んでいるのが見える。
   * 以前は焦点距離を 0 にして代用していたが、それだと常に中央の 1 コマが
   * 出るだけで、印刷の姿になっていなかった。
   */
  raw: {
    label: 'Print only',
    params: { ...BASE, showPrint: true, lenses: 16, views: 8, sheen: 0.0, ridge: 0.0, grain: 0.05 },
  },
}

export const DEFAULT_PRESET = 'card'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([k, v]) => [v.label, k]),
)
