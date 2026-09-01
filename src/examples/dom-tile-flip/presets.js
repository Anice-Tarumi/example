/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  cols: 12,
  rows: 8,
  gap: 3,
  radius: 6,
  inset: 4,
  mode: 'hover',
  axis: 'x',
  duration: 0.55,
  perspective: 1000,
  depth: -20,
  sweepOrder: 'diagonal',
  sweepSpeed: 0.55,
  title: 'IMMERSIVE',
  lead: 'DIGITAL EXPERIENCE STUDIO',
  blend: true,
}

export const PRESETS = {
  hover: { label: 'Hover', params: { ...BASE } },
  fine: { label: 'Fine Grid', params: { ...BASE, cols: 24, rows: 16, gap: 2, radius: 2, duration: 0.4 } },
  sweep: { label: 'Auto Sweep', params: { ...BASE, mode: 'auto', cols: 16, rows: 10, sweepOrder: 'radial', duration: 0.5 } },
  cards: {
    label: 'Cards',
    params: { ...BASE, cols: 4, rows: 3, gap: 18, radius: 22, perspective: 700, depth: -60, axis: 'y', duration: 0.9 },
  },
}

export const DEFAULT_PRESET = 'hover'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
