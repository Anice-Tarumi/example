/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  mode: 'hover',
  flipTime: 0.55,
  cols: 16,
  rows: 10,
  order: 'diagonal',
  stagger: 0.55,
  gap: 0.06,
  lift: 0.22,
  axis: 'x',
  autoplay: true,
  speed: 0.28,
  hold: 1.2,
  progress: 0,
  ambient: 0.55,
  edge: 0.5,
  lightAngle: 40,
}

export const PRESETS = {
  hover: { label: 'Hover', params: { ...BASE, cols: 8, rows: 6, gap: 0.03, lift: 0.12 } },
  radial: { label: 'Radial', params: { ...BASE, mode: 'auto', order: 'radial', cols: 20, rows: 12, stagger: 0.65, lift: 0.3 } },
  scatter: {
    label: 'Scatter',
    params: { ...BASE, mode: 'auto', order: 'blue', cols: 24, rows: 15, stagger: 0.8, gap: 0.1, lift: 0.4, axis: 'y' },
  },
  curtain: {
    label: 'Curtain',
    params: { ...BASE, mode: 'auto', order: 'column', cols: 28, rows: 6, stagger: 0.7, gap: 0.02, lift: 0.08, axis: 'y', speed: 0.4 },
  },
}

export const DEFAULT_PRESET = 'hover'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
