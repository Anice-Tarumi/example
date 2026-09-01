/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  // 隆起
  brushRadius: 0.055,
  brushStrength: 0.32,
  diffuse: 0.18,
  decay: 0.55,
  cap: 1,
  // 表面
  heightScale: 0.16,
  lightAngle: 128,
  lightHeight: 0.55,
  ambient: 0.42,
  shadow: 0.85,
  cavity: 0.6,
  micro: 0.06,
  specular: 0.12,
  baseColor: '#cfcdc8',
  background: '#c9c7c2',
  // 球
  spawnInterval: 0.6,
  radius: 0.062,
  gravity: 1.6,
  // この高さより上を「固い」とみなす。低いほど薄い隆起でも玉を止める
  solid: 0.3,
  drag: 0.06,
  surfaceFriction: 0.06,
  restitution: 0.35,
  maxSpeed: 3.0,
  carve: 0.18,
  ballRough: 0.16,
  ballColor: '#dfe3e8',
  lift: 1,
}

export const PRESETS = {
  plaster: { label: 'Plaster', params: { ...BASE } },
  clay: {
    label: 'Deep Clay',
    params: {
      ...BASE,
      brushStrength: 0.9,
      decay: 0.22,
      diffuse: 0.1,
      heightScale: 0.22,
      cavity: 0.8,
      carve: 0.3,
      solid: 0.7,
      baseColor: '#c8bdb0',
      background: '#c2b8ac',
    },
  },
  sand: {
    label: 'Quick Sand',
    params: {
      ...BASE,
      brushRadius: 0.04,
      brushStrength: 0.35,
      decay: 1.4,
      diffuse: 0.24,
      heightScale: 0.12,
      spawnInterval: 0.4,
      carve: 0.15,
      baseColor: '#d8d2c4',
      background: '#d2ccbe',
    },
  },
  night: {
    label: 'Raking Light',
    params: {
      ...BASE,
      lightAngle: 178,
      lightHeight: 0.22,
      ambient: 0.16,
      shadow: 1,
      cavity: 0.85,
      specular: 0.3,
      baseColor: '#9ea3ad',
      background: '#14171c',
      ballColor: '#eef2f6',
      ballRough: 0.1,
    },
  },
}

export const DEFAULT_PRESET = 'plaster'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
