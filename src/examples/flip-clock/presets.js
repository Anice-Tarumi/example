/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  mode: 'clock',
  text: 'HELLO',
  cols: 52,
  rows: 13,
  pitch: 1.06,
  spacing: 1,
  // 22% で裏返りきる本物の機械式に寄せると速すぎるので、少し粘らせる
  flipTime: 0.16,
  stagger: 0.32,
  order: 'sweep',
  onColor: '#f2e9c9',
  offColor: '#1b1c20',
  background: '#0d0e11',
}

export const PRESETS = {
  station: { label: 'Station', params: { ...BASE } },
  amber: {
    label: 'Amber',
    params: { ...BASE, onColor: '#ffb020', offColor: '#221a10', background: '#120d07', order: 'radial' },
  },
  paper: {
    label: 'Paper',
    params: { ...BASE, onColor: '#1c1d21', offColor: '#e7e4dc', background: '#efece5', order: 'blue', stagger: 0.5 },
  },
  snap: { label: 'Snap', params: { ...BASE, flipTime: 0.07, stagger: 0, order: 'instant' } },
}

export const DEFAULT_PRESET = 'station'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
