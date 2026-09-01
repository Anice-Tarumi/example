/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  cols: 16,
  rows: 10,
  gap: 2,
  radius: 4,
  inset: 0,
  mode: 'hover',
  axis: 'x',
  // 22% で 180deg まで回りきるので、体感の反応は duration の 1/5
  duration: 0.7,
  perspective: 1000,
  depth: -20,
  sweepOrder: 'diagonal',
  sweepSpeed: 0.55,
  look: 'plate',
  bg: '#0e0f12',
  plateFront: '#1c1d21',
  plateBack: '#d3ff02',
  ink: '#f4f4f2',
  title: 'JUNCTION',
  lead: 'INTERACTIVE STUDIO',
}

export const PRESETS = {
  plate: { label: 'Plate', params: { ...BASE } },
  coarse: { label: 'Big Plates', params: { ...BASE, cols: 6, rows: 6, gap: 3, radius: 8, duration: 1 } },
  photo: {
    label: 'Photo',
    params: { ...BASE, look: 'photo', cols: 14, rows: 9, gap: 2, radius: 3, duration: 0.7, bg: '#08090b' },
  },
  sweep: {
    label: 'Auto Sweep',
    params: { ...BASE, mode: 'auto', cols: 16, rows: 10, gap: 2, radius: 3, duration: 0.7, sweepOrder: 'radial' },
  },
}

export const DEFAULT_PRESET = 'plate'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
