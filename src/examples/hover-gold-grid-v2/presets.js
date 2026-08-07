/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  gold: {
    label: 'Gold Pulse',
    params: {
      geometry: 'sphere',
      speed: 2.2,
      pulseFrequency: 15,
      pulseSharpness: 3.5,
      pixellation: 400,
      uvMixMultiplier: 3,
      pulseColor: '#ff8000',
      pulseIntensity: 1.6,
      baseColor: '#2a2a2a',
    },
  },
  ice: {
    label: 'Ice Mosaic',
    params: {
      geometry: 'sphere',
      speed: 1.4,
      pulseFrequency: 9,
      pulseSharpness: 2.2,
      pixellation: 60,
      uvMixMultiplier: 6,
      pulseColor: '#3fd0ff',
      pulseIntensity: 1.8,
      baseColor: '#101c24',
    },
  },
  scanline: {
    label: 'Dense Scanline',
    params: {
      geometry: 'plane',
      speed: 3,
      pulseFrequency: 42,
      pulseSharpness: 5,
      pixellation: 900,
      uvMixMultiplier: 1.5,
      pulseColor: '#b6ff5c',
      pulseIntensity: 1.2,
      baseColor: '#151515',
    },
  },
  magma: {
    label: 'Magma Bloom',
    params: {
      geometry: 'torus',
      speed: 1.2,
      pulseFrequency: 6,
      pulseSharpness: 1.6,
      pixellation: 24,
      uvMixMultiplier: 8,
      pulseColor: '#ff2d00',
      pulseIntensity: 2.2,
      baseColor: '#1a0a06',
    },
  },
}

export const DEFAULT_PRESET = 'gold'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
