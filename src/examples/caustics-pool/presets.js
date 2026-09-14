/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  depth: 2.2,
  swell: 0.075,
  ripple: 0.022,
  swellScale: 0.9,
  rippleScale: 4.6,
  speed: 1,
  ior: 1.333,

  photons: 256,
  photonSize: 2.5,
  brightness: 1.0,
  causticGain: 1.0,
  // 空からの散乱。0 だと網の外が真っ黒になる
  skylight: 0.4,

  dropSpeed: 2.2,
  dropDecay: 0.9,
  rain: 0,

  sunAzimuth: 40,
  sunElevation: 62,
  specular: 1.2,
  shine: 180,
  absorb: 0.32,

  waterColor: '#3fb6c8',
  floorA: '#dfe3e0',
  floorB: '#9aa6a4',
  skyColor: '#8fc7e8',
  sunColor: '#fff3d8',
  tile: 1.2,
}

export const PRESETS = {
  pool: { label: 'Pool', params: { ...BASE } },
  calm: {
    label: 'Calm',
    params: { ...BASE, swell: 0.035, ripple: 0.008, speed: 0.5, causticGain: 1.2, skylight: 0.34, depth: 3 },
  },
  rain: {
    label: 'Rain',
    params: {
      ...BASE, rain: 4.5, swell: 0.03, ripple: 0.012, dropSpeed: 2.8, dropDecay: 1.4,
      skyColor: '#5d7183', sunColor: '#dbe6f2', specular: 0.7, waterColor: '#4f8b96',
    },
  },
  lagoon: {
    label: 'Lagoon',
    params: {
      ...BASE, depth: 4.2, absorb: 0.5, waterColor: '#2fd0b6', floorA: '#e8dcc0',
      floorB: '#b8a888', tile: 0.6, swell: 0.11, causticGain: 1.0, skylight: 0.45,
    },
  },
}

export const DEFAULT_PRESET = 'pool'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
