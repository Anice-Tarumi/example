/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  segments: 220,
  radius: 0.052,
  lag: 0.12,
  taper: 1,
  speedWidth: 0.45,
  headRadius: 0.35,
  spin: 0.12,
  // 質感
  color: '#d8dde4',
  metalness: 1,
  roughness: 0.14,
  envIntensity: 1.1,
  // 環境
  background: '#0d1014',
  floor: true,
  floorColor: '#0a0d11',
  ambient: 0.25,
}

export const PRESETS = {
  chrome: { label: 'Chrome', params: { ...BASE } },
  ink: {
    label: 'Ink',
    params: {
      ...BASE,
      radius: 0.032,
      lag: 0.06,
      speedWidth: 1,
      metalness: 0,
      roughness: 0.85,
      color: '#14171c',
      background: '#e8e6e1',
      floorColor: '#d9d6cf',
      ambient: 0.7,
    },
  },
  ribbon: {
    label: 'Ribbon',
    params: {
      ...BASE,
      radius: 0.1,
      lag: 0.25,
      taper: 1,
      speedWidth: 0.2,
      metalness: 0.2,
      roughness: 0.35,
      color: '#ff3fa4',
      background: '#12060e',
      floorColor: '#0d0409',
    },
  },
  glass: {
    label: 'Frost',
    params: {
      ...BASE,
      radius: 0.07,
      lag: 0.18,
      metalness: 0,
      roughness: 0.25,
      color: '#9fd8ff',
      envIntensity: 1.6,
      background: '#07131b',
      floorColor: '#050d13',
      ambient: 0.4,
    },
  },
}

export const DEFAULT_PRESET = 'chrome'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
