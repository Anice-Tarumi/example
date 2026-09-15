/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  mode: 'screen',

  // Mitchell の放射ブラーの 4 つ。歩幅・減衰・寄与・露光
  density: 0.92,
  decay: 0.986,
  weight: 0.024,
  exposure: 1.5,
  gain: 1.6,

  shaftLength: 26,
  shaftGain: 0.5,
  shaftSpin: 0.12,

  sunAzimuth: -4,
  sunElevation: 15,
  sunDistance: 60,
  sunSize: 2.6,

  rayColor: '#ffd9a0',
  sunColor: '#fff2d2',
  pillar: '#26221f',
  ground: '#17161a',
  sky: '#0b0d14',
}

export const PRESETS = {
  forest: { label: 'Pillars', params: { ...BASE } },
  shafts: {
    label: 'Shafts only',
    // 板ポリ式だけ。遮蔽を知らないので、柱の手前でも光が乗る
    params: { ...BASE, mode: 'shafts', shaftGain: 0.8, shaftLength: 34 },
  },
  both: {
    label: 'Both',
    params: { ...BASE, mode: 'both', shaftGain: 0.35, gain: 1.2 },
  },
  dusk: {
    label: 'Dusk',
    params: {
      ...BASE, sunElevation: 9, sunAzimuth: -14, density: 0.95, exposure: 1.8, gain: 2.0,
      rayColor: '#ff9a5c', sunColor: '#ffd0a0', sky: '#140d12', pillar: '#1d1a19',
    },
  },
}

export const DEFAULT_PRESET = 'forest'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
