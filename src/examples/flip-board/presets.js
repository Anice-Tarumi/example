/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  mode: 'dots',
  cols: 44,
  rows: 26,
  pitch: 1.06,
  flipTime: 0.14,
  stagger: 0.3,
  order: 'blue',
  source: 'photo',
  gain: 1.35,
  // 乱した所を 1 秒あたり何割戻すか
  heal: 6,
  lifeRate: 0.18,
  density: 0.28,
  bpm: 112,
  base: 220,
  decay: 0.45,
  onColor: '#f2e9c9',
  offColor: '#1b1c20',
  background: '#0d0e11',
}

export const PRESETS = {
  photo: { label: 'Photo', params: { ...BASE } },
  life: {
    label: 'Life',
    params: { ...BASE, mode: 'life', cols: 56, rows: 34, order: 'instant', flipTime: 0.1, stagger: 0 },
  },
  seq: {
    label: 'Sequencer',
    params: { ...BASE, mode: 'seq', cols: 16, rows: 12, pitch: 1.15, order: 'sweep', flipTime: 0.12, stagger: 0.1 },
  },
  amber: {
    label: 'Amber',
    params: { ...BASE, source: 'logo', gain: 2.2, onColor: '#ffb020', offColor: '#221a10', background: '#120d07' },
  },
}

export const DEFAULT_PRESET = 'photo'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
