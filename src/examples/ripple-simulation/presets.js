/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  water: {
    label: 'Water Surface',
    params: {
      mode: 'water',
      texture: 'checker',
      damping: 0.985,
      force: 0.26,
      radius: 0.035,
      refraction: 0.16,
      dispersion: 0.4,
      specular: 0.5,
      shininess: 28,
      texScale: 1,
      autoRain: true,
      rainRate: 1.1,
    },
  },
  chrome: {
    label: 'Liquid Chrome',
    params: {
      mode: 'chrome',
      texture: 'gradient',
      damping: 0.992,
      force: 0.34,
      radius: 0.04,
      refraction: 0.3,
      dispersion: 0.4,
      specular: 1.4,
      shininess: 60,
      texScale: 1,
      autoRain: true,
      rainRate: 0.8,
    },
  },
  prism: {
    label: 'Prism Ripple',
    params: {
      mode: 'prism',
      texture: 'blocks',
      damping: 0.988,
      force: 0.3,
      radius: 0.032,
      refraction: 0.4,
      dispersion: 1.2,
      specular: 0.35,
      shininess: 20,
      texScale: 1,
      autoRain: true,
      rainRate: 1.4,
    },
  },
  field: {
    label: 'Height Field',
    params: {
      mode: 'field',
      texture: 'grid',
      damping: 0.99,
      force: 0.45,
      radius: 0.03,
      refraction: 0.3,
      dispersion: 0.4,
      specular: 0,
      shininess: 20,
      texScale: 1,
      autoRain: true,
      rainRate: 1.6,
    },
  },
}

export const MODES = ['water', 'chrome', 'prism', 'field']

export const DEFAULT_PRESET = 'water'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
