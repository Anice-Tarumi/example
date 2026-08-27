/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  tunnel: {
    label: 'Tunnel',
    params: {
      speed: 5.5,
      radius: 1.35,
      twist: 0.22,
      mobius: 0.0,
      mobiusSpin: 0.35,
      bend: 0.85,
      pulse: 0.06,
      stripes: 16,
      stripeSharp: 0.24,
      rim: 0.5,
      fogDensity: 0.055,
      colorA: '#131a2e',
      colorB: '#5ad2ff',
      fogColor: '#070a12',
      wireframe: false,
    },
  },
  mobius: {
    label: 'Mobius',
    params: {
      speed: 2.2,
      radius: 1.5,
      twist: 0.0,
      mobius: 0.62,
      mobiusSpin: 0.5,
      bend: 0.2,
      pulse: 0.0,
      stripes: 24,
      stripeSharp: 0.3,
      rim: 0.7,
      fogDensity: 0.05,
      colorA: '#1a1230',
      colorB: '#ff8ad0',
      fogColor: '#0a0714',
      wireframe: false,
    },
  },
  twist: {
    label: 'Twist',
    params: {
      speed: 3.4,
      radius: 1.4,
      twist: 0.85,
      mobius: 0.18,
      mobiusSpin: 0.2,
      bend: 0.45,
      pulse: 0.16,
      stripes: 12,
      stripeSharp: 0.2,
      rim: 0.6,
      fogDensity: 0.05,
      colorA: '#0f2420',
      colorB: '#8dffbe',
      fogColor: '#050d0b',
      wireframe: false,
    },
  },
  wire: {
    label: 'Wireframe',
    params: {
      speed: 4.0,
      radius: 1.45,
      twist: 0.4,
      mobius: 0.45,
      mobiusSpin: 0.4,
      bend: 0.7,
      pulse: 0.1,
      stripes: 8,
      stripeSharp: 0.4,
      rim: 0.9,
      fogDensity: 0.06,
      colorA: '#0b1020',
      colorB: '#9fd0ff',
      fogColor: '#05070f',
      wireframe: true,
    },
  },
}

export const DEFAULT_PRESET = 'tunnel'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
