/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
const BASE = {
  radius: 26,
  damping: 0.12,
  followDamping: 0.22,
  wobble: 1,
  subdiv: 50,
  lineWidth: 2,
  holdTime: 1.2,
  stroke: '#141414',
  paper: '#f4f1e8',
  grain: 12,
  fill: true,
  background: '#e9e5da',
  ink: '#141414',
}

export const PRESETS = {
  ink: { label: 'Paper Ink', params: { ...BASE } },
  neon: {
    label: 'Neon',
    params: {
      ...BASE,
      wobble: 0.4,
      lineWidth: 1.6,
      stroke: '#6ff0ff',
      paper: '#0b1622',
      grain: 6,
      fill: false,
      background: '#050a12',
      ink: '#cfe6ff',
      followDamping: 0.3,
    },
  },
  mono: {
    label: 'Mono',
    params: {
      ...BASE,
      radius: 20,
      wobble: 0,
      lineWidth: 1.2,
      stroke: '#f2f2f2',
      paper: '#1a1a1a',
      grain: 0,
      fill: true,
      background: '#101010',
      ink: '#f2f2f2',
      damping: 0.2,
      followDamping: 0.45,
    },
  },
  sketch: {
    label: 'Sketch',
    params: {
      ...BASE,
      radius: 32,
      wobble: 3.2,
      lineWidth: 2.6,
      subdiv: 34,
      stroke: '#2b3a55',
      paper: '#fbf7ec',
      grain: 22,
      background: '#eef0e6',
      ink: '#2b3a55',
      damping: 0.09,
      followDamping: 0.16,
    },
  },
}

export const DEFAULT_PRESET = 'ink'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
