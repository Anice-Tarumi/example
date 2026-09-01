/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const CHANNELS = ['static', 'bars', 'testcard', 'logo']

const BASE = {
  channel: 'static',
  sameChannel: false,
  autoSwitch: true,
  switchSpeed: 0.0015,
  noise: 0.1,
  roll: 0.8,
  flicker: 0.12,
  scan: 0.55,
  mask: 0.5,
  barrel: 0.22,
  chroma: 1,
  tear: 1,
  invert: 0.7,
  vignette: 0.55,
  bulge: 0.06,
  bright: 1.1,
  tint: '#cfe4ff',
  glow: 4.5,
  ambient: 0.04,
  caseTint: '#262a30',
  floorRough: 0.92,
  floorBlur: 1.3,
  floorMix: 0.16,
  floorMetal: 0.0,
  floorColor: '#040508',
  background: '#04050a',
  screenY: 0,
  screenZ: 0.0,
  screenScale: 0.99,
  cableSag: 0.35,
  cableFront: 1.1,
  cableRadius: 0.012,
  cableColor: '#14161b',
}

export const PRESETS = {
  snow: { label: 'Snow', params: { ...BASE } },
  broadcast: {
    label: 'Broadcast',
    params: {
      ...BASE,
      channel: 'bars',
      sameChannel: false,
      switchSpeed: 0.0025,
      noise: 0.05,
      roll: 0.35,
      bright: 1.25,
      glow: 12,
      tint: '#ffffff',
    },
  },
  deadAir: {
    label: 'Dead Air',
    params: {
      ...BASE,
      channel: 'static',
      sameChannel: true,
      autoSwitch: false,
      noise: 1,
      roll: 1.4,
      flicker: 0.3,
      scan: 0.75,
      chroma: 1.8,
      bright: 0.9,
      glow: 7,
      tint: '#bcd0e8',
      background: '#020306',
    },
  },
  warm: {
    label: 'Warm Tube',
    params: {
      ...BASE,
      channel: 'testcard',
      sameChannel: false,
      noise: 0.12,
      mask: 0.75,
      scan: 0.7,
      barrel: 0.3,
      tint: '#ffd6ad',
      glow: 10,
      floorColor: '#100c09',
      background: '#07050a',
    },
  },
}

export const DEFAULT_PRESET = 'snow'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
