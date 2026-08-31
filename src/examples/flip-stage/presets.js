/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  trapdoor: {
    label: 'Trapdoor',
    params: {
      axis: 'x',
      duration: 1.1,
      overshoot: 1.7,
      autoFlip: true,
      interval: 2.6,
      radius: 1.55,
      thickness: 0.1,
      tilt: 0.34,
      spin: 0.12,
      lift: 0.35,
      rimColor: '#3c434d',
      groundColor: '#1b2029',
      fog: 0.55,
      background: '#10141c',
    },
  },
  swing: {
    label: 'Slow Swing',
    params: {
      axis: 'z',
      duration: 2.2,
      overshoot: 1.05,
      autoFlip: true,
      interval: 3.4,
      radius: 1.7,
      thickness: 0.12,
      tilt: 0.24,
      spin: 0.06,
      lift: 0.15,
      rimColor: '#3c434d',
      groundColor: '#231d2b',
      fog: 0.45,
      background: '#141019',
    },
  },
  snap: {
    label: 'Snap Flip',
    params: {
      axis: 'x',
      duration: 0.55,
      overshoot: 2.6,
      autoFlip: true,
      interval: 1.6,
      radius: 1.5,
      thickness: 0.09,
      tilt: 0.4,
      spin: 0.2,
      lift: 0.5,
      rimColor: '#3c434d',
      groundColor: '#161d24',
      fog: 0.7,
      background: '#0c1116',
    },
  },
  manual: {
    label: 'Manual',
    params: {
      axis: 'x',
      duration: 1.3,
      overshoot: 1.6,
      autoFlip: false,
      interval: 2.6,
      radius: 1.6,
      thickness: 0.1,
      tilt: 0.32,
      spin: 0.1,
      lift: 0.32,
      rimColor: '#3c434d',
      groundColor: '#1c242e',
      fog: 0.5,
      background: '#111820',
    },
  },
}

export const AXES = ['x', 'z']

export const DEFAULT_PRESET = 'trapdoor'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
