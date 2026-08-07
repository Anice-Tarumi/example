/** variant プリセット。キーは meta.json の variants[].id と対応させる。 */
export const PRESETS = {
  a: {
    label: 'Variant A',
    params: { color: '#7aaaff', speed: 1 },
  },
  b: {
    label: 'Variant B',
    params: { color: '#ff8000', speed: 3 },
  },
}

export const DEFAULT_PRESET = 'a'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
