/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  grid: 32,
  pin: 'corners2',
  // 留め幅を布幅より狭める。0 だと張り切ってひだが出ない
  slack: 0.18,
  // 寝かせて置くか。掛け布は縦のままでは球を外す
  flat: false,
  dropHeight: 1.6,
  /*
   * 刻みと制限の既定は実測で決めた（32×32）。
   *   6 刻み + 制限 1 回 … 2.1ms / 伸び 9.8%
   *   6 刻み + 制限 3 回 … 2.8ms / 伸び 5.8%
   *   10 刻み + 制限 6 回 … 6.5ms / 伸び 2.5%
   * 描画のぶんを残して 3ms 前後に収める。
   */
  substeps: 6,
  strainPasses: 3,
  maxStrain: 0.02,

  shear: 1e-6,
  bend: 5e-5,
  damping: 0.6,
  // 接触の摩擦。0 だと掛けた布が必ず滑り落ちる
  friction: 0.35,

  gravity: -9.8,
  windX: 0,
  windZ: 1.2,
  floor: -3,

  tear: false,
  tearStrain: 0.35,

  sphereOn: false,
  sphereR: 0.9,
  sphereY: -0.9,
  sphereZ: 0,
  sphereSwing: 0,
  sphereSpeed: 0.8,

  color: '#c8443c',
  roughness: 0.82,
  metalness: 0.02,
  weave: 1.1,
  sheen: 0.35,
  floorColor: '#23242b',
  sphereColor: '#c9ccd4',
  background: '#14151a',
}

export const PRESETS = {
  drape: { label: 'Drape', params: { ...BASE } },
  flag: {
    label: 'Flag',
    params: {
      ...BASE, pin: 'top', slack: 0, windZ: 14, windX: 4, damping: 0.5, bend: 2e-4,
      floor: -6, color: '#2f6fd0',
    },
  },
  ball: {
    label: 'Over a ball',
    params: {
      ...BASE, pin: 'free', slack: 0, flat: true, dropHeight: 1.9, sphereOn: true,
      sphereR: 1.1, sphereY: -0.6, sphereSwing: 0.25, sphereSpeed: 0.5,
      floor: -1.85, color: '#e6e2d6', damping: 1.2, windZ: 0, friction: 0.7,
    },
  },
  tear: {
    label: 'Tear',
    params: {
      ...BASE, pin: 'corners2', slack: 0.05, tear: true, tearStrain: 0.22, windZ: 5.5, windX: 1.5,
      damping: 0.3, color: '#d9d3c4', floor: -6,
    },
  },
}

export const DEFAULT_PRESET = 'drape'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
