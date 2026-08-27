/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  compare: {
    label: 'Side by Side',
    params: {
      count: 900,
      spin: 0.6,
      metalness: 0.35,
      roughness: 0.35,
      blockMs: 900,
      autoBlock: false,
      autoInterval: 3,
      background: '#080b12',
    },
  },
  heavy: {
    label: 'Heavy Scene',
    params: {
      count: 2600,
      spin: 0.5,
      metalness: 0.5,
      roughness: 0.28,
      blockMs: 1400,
      autoBlock: false,
      autoInterval: 3,
      background: '#0a0710',
    },
  },
  stutter: {
    label: 'Auto Stutter',
    params: {
      count: 1200,
      spin: 0.8,
      metalness: 0.3,
      roughness: 0.4,
      blockMs: 700,
      autoBlock: true,
      autoInterval: 2.2,
      background: '#070d0c',
    },
  },
}

export const DEFAULT_PRESET = 'compare'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
