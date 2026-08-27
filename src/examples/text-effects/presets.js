/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const MODES = ['none', 'reveal', 'wave', 'glitch']

export const PRESETS = {
  outline: {
    label: 'SDF Outline',
    params: {
      text: 'SHOWCASE',
      mode: 'none',
      weight: 0,
      outlineWidth: 1.6,
      glowWidth: 0,
      glowStrength: 0,
      soft: 1,
      wave: 0.12,
      waveSpeed: 2.2,
      jitter: 0.25,
      loop: true,
      scale: 1.6,
      fill: '#0a0d14',
      outline: '#7fd4ff',
      glow: '#3aa0ff',
      background: '#080b12',
    },
  },
  reveal: {
    label: 'Reveal',
    params: {
      text: 'SHOWCASE',
      mode: 'reveal',
      weight: 0.2,
      outlineWidth: 0.5,
      glowWidth: 2.4,
      glowStrength: 0.7,
      soft: 1,
      wave: 0.12,
      waveSpeed: 2.2,
      jitter: 0.25,
      loop: true,
      scale: 1.6,
      fill: '#eef4ff',
      outline: '#6fa8ff',
      glow: '#2f6df0',
      background: '#070a12',
    },
  },
  wave: {
    label: 'Wave',
    params: {
      text: 'SHOWCASE',
      mode: 'wave',
      weight: 0.35,
      outlineWidth: 0.8,
      glowWidth: 3.2,
      glowStrength: 1.0,
      soft: 1,
      wave: 0.18,
      waveSpeed: 2.6,
      jitter: 0.25,
      loop: true,
      scale: 1.5,
      fill: '#fff2d8',
      outline: '#ffb45c',
      glow: '#ff6a3d',
      background: '#120a08',
    },
  },
  glitch: {
    label: 'Glitch',
    params: {
      text: 'SHOWCASE',
      mode: 'glitch',
      weight: 0.1,
      outlineWidth: 1.2,
      glowWidth: 2.0,
      glowStrength: 0.8,
      soft: 1,
      wave: 0.12,
      waveSpeed: 2.2,
      jitter: 0.42,
      loop: true,
      scale: 1.55,
      fill: '#f2f6ff',
      outline: '#ff4f8b',
      glow: '#4fe0ff',
      background: '#08070d',
    },
  },
}

export const DEFAULT_PRESET = 'outline'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
