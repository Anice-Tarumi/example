/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  // 点群なので数万でも描ける。volume-particles と同じ桁
  pieces: 12000,
  dot: 1.4,
  // 止まっている桁も漂わせる。完全な静止は点を打った絵に見える
  drift: 0.13,
  // 字の中心まわりの回転
  swirl: 0.07,
  // 空間そのもののゆがみ。上げすぎると時刻が読めない
  warp: 0.22,
  swapTime: 0.55,
  // 進む向きと直交する膨らみ。直線で滑ると組み直った感じが出ない
  arc: 0.8,
  lag: 0.5,
  scale: 0.9,
  pitch: 1.0,
  colonGap: 1.2,

  // --- 宇宙 ---
  nebula: 0.42,
  stars: 0.85,
  rayGain: 0.2,
  rayWidth: 0.045,
  dust: 1400,
  dustSpeed: 0.9,

  color: '#e9edff',
  deep: '#04050c',
  nebulaA: '#26377d',
  nebulaB: '#7a2f86',
  rayColor: '#9fc2ff',
}

export const PRESETS = {
  dust: { label: 'Nebula', params: { ...BASE } },
  dense: {
    label: 'Dense',
    params: { ...BASE, pieces: 30000, dot: 1.0, drift: 0.09, arc: 0.5, nebula: 0.35, stars: 0.6 },
  },
  loose: {
    label: 'Void',
    params: {
      ...BASE,
      pieces: 6000, dot: 2.2, arc: 1.4, lag: 0.7, swapTime: 0.9, warp: 0.34, drift: 0.18,
      nebula: 0.15, stars: 1.1, rayGain: 0.08, dust: 2400,
      nebulaA: '#123044', nebulaB: '#1b2f6b', rayColor: '#8fe6ff',
    },
  },
  ink: {
    label: 'Ember',
    params: {
      ...BASE,
      color: '#ffe9cf', nebulaA: '#7a2a1e', nebulaB: '#b0562a', rayColor: '#ffb469',
      deep: '#0b0503', nebula: 0.7, stars: 0.5, rayGain: 0.22, dustSpeed: 0.5,
    },
  },
}

export const DEFAULT_PRESET = 'dust'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
