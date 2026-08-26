/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  gold: {
    label: 'Gold Pulse',
    params: {
      geometry: 'sphere',
      pattern: 'noise',
      patternScale: 13,
      speed: 2.2,
      pulseFrequency: 24,
      pulseSharpness: 2.4,
      pulseGamma: 3.2,
      pixellation: 55,
      uvMixMultiplier: 3,
      pulseColor: '#ff8000',
      pulseIntensity: 3,
      hueShift: 1,
      baseColor: '#1a1a1a',
      accentColor: '#b4b4b4',
    },
  },
  ice: {
    label: 'Ice Mosaic',
    params: {
      geometry: 'sphere',
      pattern: 'grid',
      patternScale: 30,
      speed: 1.4,
      pulseFrequency: 16,
      pulseSharpness: 2,
      pulseGamma: 2.6,
      pixellation: 40,
      uvMixMultiplier: 3.5,
      pulseColor: '#3fd0ff',
      pulseIntensity: 2.4,
      hueShift: 0,
      baseColor: '#0b141c',
      accentColor: '#4d86ab',
    },
  },
  scanline: {
    label: 'Dense Scanline',
    params: {
      geometry: 'plane',
      pattern: 'stripes',
      patternScale: 22,
      speed: 3,
      pulseFrequency: 42,
      pulseSharpness: 2.6,
      pulseGamma: 2.8,
      pixellation: 120,
      uvMixMultiplier: 2.5,
      pulseColor: '#b6ff5c',
      pulseIntensity: 1.4,
      hueShift: 0,
      baseColor: '#101010',
      accentColor: '#5c6b55',
    },
  },
  magma: {
    label: 'Magma Bloom',
    params: {
      geometry: 'torus',
      pattern: 'voronoi',
      patternScale: 11,
      speed: 1.2,
      pulseFrequency: 11,
      pulseSharpness: 1.8,
      pulseGamma: 2.6,
      pixellation: 28,
      uvMixMultiplier: 4,
      pulseColor: '#ff2d00',
      pulseIntensity: 2.4,
      hueShift: 1,
      baseColor: '#170805',
      accentColor: '#9c4520',
    },
  },
}

export const PATTERNS = ['noise', 'grid', 'voronoi', 'stripes']

export const DEFAULT_PRESET = 'gold'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
