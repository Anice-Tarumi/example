/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  'noise-wipe': {
    label: 'Noise Wipe',
    params: {
      mode: 'noise-wipe',
      duration: 1.6,
      direction: 0,
      edge: 0.12,
      noiseScale: 3.2,
      noiseAmount: 0.2,
      flash: 0.4,
      zoom: 0.04,
      overlayColor: '#f25a5a',
    },
  },
  curtain: {
    label: 'Theater Curtain',
    params: {
      mode: 'curtain',
      duration: 2.4,
      direction: 0,
      edge: 0.02,
      noiseScale: 3.2,
      noiseAmount: 0,
      flash: 0,
      zoom: 0,
      overlayColor: '#f25a5a',
    },
  },
  fade: {
    label: 'Overlay Fade',
    params: {
      mode: 'fade',
      duration: 1.8,
      direction: 0,
      edge: 0.1,
      noiseScale: 3.2,
      noiseAmount: 0,
      flash: 0,
      zoom: 0,
      overlayColor: '#151d47',
    },
  },
  circle: {
    label: 'Circle Wipe',
    params: {
      mode: 'circle',
      duration: 1.4,
      direction: 0,
      edge: 0.06,
      noiseScale: 6,
      noiseAmount: 0.08,
      flash: 0.5,
      zoom: 0.12,
      overlayColor: '#151d47',
    },
  },
}

export const MODES = ['noise-wipe', 'curtain', 'fade', 'circle']

export const DEFAULT_PRESET = 'noise-wipe'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
