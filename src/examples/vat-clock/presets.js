/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  // 点群なので数万でも描ける。volume-particles と同じ桁
  pieces: 12000,
  dot: 1.4,
  // 止まっている桁も微かに漂わせる。完全な静止は点を打った絵に見える
  drift: 0.075,
  // 字の中心まわりの微かな回転
  swirl: 0.045,
  // 空間そのもののゆがみ。上げすぎると時刻が読めない
  warp: 0.16,
  // 光の筋。速さに比例して伸びる
  streak: 5.0,
  streakGain: 0.42,
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
  dense: { label: 'Dense', params: { ...BASE, pieces: 30000, dot: 1.0, drift: 0.05, arc: 0.5, streakGain: 0.28 } },
  loose: { label: 'Loose', params: { ...BASE, pieces: 6000, dot: 2.2, arc: 1.4, lag: 0.7, swapTime: 0.9, warp: 0.3, streak: 8 } },
  ink: { label: 'Ink', params: { ...BASE, color: '#1c1d21', background: '#eceae4', streakGain: 0.14, warp: 0.1 } },
}

export const DEFAULT_PRESET = 'dust'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
