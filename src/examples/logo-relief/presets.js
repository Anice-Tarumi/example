/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  // こする
  brushRadius: 0.075,
  brushStrength: 0.22,
  diffuse: 0.18,
  decay: 0.5,
  // ロゴ
  logoScale: 0.62,
  bevel: 0.055,
  engrave: 0.55,
  // 表面
  heightScale: 0.2,
  lightAngle: 128,
  lightHeight: 0.5,
  ambient: 0.4,
  shadow: 0.9,
  cavity: 0.65,
  micro: 0.06,
  specular: 0.14,
  baseColor: '#cfcdc8',
  background: '#c9c7c2',
}

export const PRESETS = {
  plaster: { label: 'Plaster', params: { ...BASE } },
  deep: {
    label: 'Deep Cut',
    params: {
      ...BASE,
      brushStrength: 0.32,
      decay: 0.28,
      heightScale: 0.28,
      engrave: 0.85,
      cavity: 0.85,
      baseColor: '#c8bdb0',
      background: '#c2b8ac',
    },
  },
  quick: {
    label: 'Quick Fade',
    params: {
      ...BASE,
      brushRadius: 0.05,
      brushStrength: 0.3,
      decay: 1.5,
      diffuse: 0.2,
      heightScale: 0.16,
    },
  },
  raking: {
    label: 'Raking Light',
    params: {
      ...BASE,
      lightAngle: 176,
      lightHeight: 0.2,
      ambient: 0.14,
      shadow: 1,
      cavity: 0.9,
      specular: 0.3,
      baseColor: '#9ea3ad',
      background: '#14171c',
    },
  },
}

export const DEFAULT_PRESET = 'plaster'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
