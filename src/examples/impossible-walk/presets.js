/*
 * variant プリセット。キーは meta.json の variants[].id と対応する。
 *
 * **leva に登録していないキーをここに置かない。** `set` に渡した瞬間に
 * 未登録のパスを引いて落ちる。初期の方位角のように leva で触らせないものは
 * 定数として外に出す。
 */

/** 最初の方位角。以後はドラッグが持つので leva には出さない */
export const START_AZIMUTH = 38


const BASE = {
  // 画面上の速さ。世界の速さだと梁の向きで見かけが変わる
  speedPx: 150,
  // 端が「重なって見える」とみなす画面上の距離
  snapPx: 10,
  zoom: 62,
  elevation: 32,
  face: '#f2f1ec',
  edge: '#15161a',
  walker: '#e5533d',
  background: '#e9e7e1',
}

export const PRESETS = {
  paper: { label: 'Paper', params: { ...BASE } },
  ink: {
    label: 'Ink',
    params: { ...BASE, face: '#14161b', edge: '#f2f1ec', walker: '#d3ff02', background: '#0b0c0f' },
  },
  loose: { label: 'Loose Snap', params: { ...BASE, snapPx: 26, speedPx: 110 } },
  strict: { label: 'Strict Snap', params: { ...BASE, snapPx: 4, speedPx: 210 } },
}

export const DEFAULT_PRESET = 'paper'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
