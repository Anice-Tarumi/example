/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  feed: 0.0545,
  kill: 0.062,
  map: false,
  steps: 14,       // 1 フレームで進める回数
  brush: 0.025,
  height: 6.0,
  low: '#0b0f16',
  high: '#d9c7a4',
  spec: 0.6,
}

/*
 * 係数は Karl Sims の解説（coral / mitosis）と Pearson の分類で知られる値を
 * 出発点に、画面で模様を確かめて決めた。f と k は数 % ずれるだけで
 * 模様が消えたり全面が埋まったりするので、雑に丸めない。
 */
export const PRESETS = {
  coral: { label: 'Coral', params: { ...BASE } },
  mitosis: {
    label: 'Mitosis',
    // 点が膨らんでは 2 つに割れる。細胞分裂に見える
    params: { ...BASE, feed: 0.0367, kill: 0.0649, high: '#9fd0c7', low: '#0a1114' },
  },
  maze: {
    label: 'Maze',
    // 線が伸びて互いを避け、指紋や迷路になる
    params: { ...BASE, feed: 0.029, kill: 0.057, high: '#e0a98a', low: '#120b0c' },
  },
  map: {
    label: 'Parameter map',
    // 横に feed、縦に kill を振る。1 枚に全部の模様が並ぶ
    params: { ...BASE, map: true, high: '#c9d3e6', low: '#0a0c12' },
  },
}

export const DEFAULT_PRESET = 'coral'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([k, v]) => [v.label, k]),
)
