/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  // 散らして組み直すのに片道いくらか。往復でこの倍かかる
  swapTime: 0.26,
  scale: 0.9,
  pitch: 1.0,
  colonGap: 1.2,
  color: '#e8e6e1',
  metalness: 0.15,
  roughness: 0.42,
  background: '#0e0f12',
}

export const PRESETS = {
  stone: { label: 'Stone', params: { ...BASE } },
  chrome: {
    label: 'Chrome',
    params: { ...BASE, color: '#dfe4ea', metalness: 1, roughness: 0.16, background: '#0a0c10' },
  },
  ink: {
    label: 'Ink',
    params: { ...BASE, color: '#1c1d21', metalness: 0, roughness: 0.85, background: '#eceae4' },
  },
  slow: { label: 'Slow Motion', params: { ...BASE, swapTime: 0.8, scale: 1.05 } },
}

export const DEFAULT_PRESET = 'stone'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
