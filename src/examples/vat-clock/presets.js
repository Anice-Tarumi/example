/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  // 点群なので数万でも描ける。volume-particles と同じ桁
  pieces: 12000,
  dot: 1.4,
  // 止まっている桁も微かに漂わせる。完全な静止は点を打った絵に見える
  drift: 0.045,
  swapTime: 0.55,
  // 進む向きと直交する膨らみ。直線で滑ると組み直った感じが出ない
  arc: 0.7,
  lag: 0.5,
  scale: 0.9,
  pitch: 1.0,
  colonGap: 1.2,
  color: '#e8e6e1',
  background: '#0e0f12',
}

export const PRESETS = {
  dust: { label: 'Dust', params: { ...BASE } },
  dense: { label: 'Dense', params: { ...BASE, pieces: 30000, dot: 1.0, drift: 0.03, arc: 0.5 } },
  loose: { label: 'Loose', params: { ...BASE, pieces: 6000, dot: 2.2, arc: 1.4, lag: 0.7, swapTime: 0.9 } },
  ink: { label: 'Ink', params: { ...BASE, color: '#1c1d21', background: '#eceae4' } },
}

export const DEFAULT_PRESET = 'dust'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
