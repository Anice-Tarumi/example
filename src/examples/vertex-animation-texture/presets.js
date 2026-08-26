/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  explode: {
    label: 'Shatter Burst',
    params: {
      mode: 'explode',
      cols: 26,
      rows: 18,
      frames: 96,
      scatter: 1,
      speed: 1,
      steps: 4,
      autoPlay: true,
      loopDelay: 1.4,
      colorLit: '#eaf2ff',
      colorShadow: '#1d2b45',
      colorHot: '#ff8a3c',
      spin: 0.22,
    },
  },
  collapse: {
    label: 'Collapse',
    params: {
      mode: 'collapse',
      cols: 30,
      rows: 20,
      frames: 110,
      scatter: 1,
      speed: 0.9,
      steps: 3,
      autoPlay: true,
      loopDelay: 1.8,
      colorLit: '#f4e7d2',
      colorShadow: '#3a2a1d',
      colorHot: '#c96a3a',
      spin: 0.12,
    },
  },
  swirl: {
    label: 'Swirl Up',
    params: {
      mode: 'swirl',
      cols: 24,
      rows: 16,
      frames: 120,
      scatter: 1,
      speed: 0.8,
      steps: 5,
      autoPlay: true,
      loopDelay: 1.2,
      colorLit: '#e6fff4',
      colorShadow: '#123a35',
      colorHot: '#3cf0c0',
      spin: 0.3,
    },
  },
  dense: {
    label: 'Dense Debris',
    params: {
      mode: 'explode',
      cols: 44,
      rows: 30,
      frames: 96,
      scatter: 1,
      speed: 1.15,
      steps: 3,
      autoPlay: true,
      loopDelay: 1,
      colorLit: '#ffe9f2',
      colorShadow: '#3a1030',
      colorHot: '#ff4d8d',
      spin: 0.26,
    },
  },
}

export const DEFAULT_PRESET = 'explode'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
