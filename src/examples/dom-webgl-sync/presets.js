/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  bend: 0.6,
  radius: 14,
  reveal: true,
  // 0 なら DOM と完全に一致する。上げると同期が崩れる様子が見える
  lag: 0,

  // ホバーしたカードへ渡り歩く印。隙間を横切れるのが 1 枚キャンバスの証拠
  orbSize: 1,
  orbSpeed: 0.35,
  orbGlow: 1.2,
  orbColor: '#ffd39b',

  nodeScale: 0.9,
  nodeSpin: 0.5,
  occlude: true,
  readout: true,

  colorA: '#1b3a6b',
  colorB: '#7dd3fc',
  nodeColor: '#ffd39b',
  outline: false,
}

export const PRESETS = {
  sync: { label: 'Sync', params: { ...BASE } },
  debug: {
    label: 'Debug',
    params: { ...BASE, outline: true, bend: 0, reveal: false, colorA: '#101820', colorB: '#2b3a46' },
  },
  desync: {
    label: 'Desync',
    params: { ...BASE, lag: 0.55, bend: 0, outline: true },
  },
  soft: {
    label: 'Soft',
    params: { ...BASE, bend: 2.4, radius: 28, colorA: '#3a1b4f', colorB: '#ffb3c7', nodeColor: '#9ef0c8', orbColor: '#9ef0c8' },
  },
}

export const DEFAULT_PRESET = 'sync'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
