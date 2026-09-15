/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  mode: 'multi',

  baseAmt: 0.85,
  roughAmt: 0.55,
  sharpAmt: 0.7,

  roughPower: 12,
  sharpPower: 120,
  fresnel: 3.2,
  lightX: 0.4,
  lightY: 0.75,

  baseColor: '#2f6ad0',
  roughColor: '#8fb6ff',
  sharpColor: '#ffffff',
  background: '#12141a',
  spin: 0.25,
  showMatcap: true,
}

export const PRESETS = {
  metal: { label: 'Metal', params: { ...BASE } },
  clay: {
    label: 'Clay',
    // 鏡面をほぼ切る。拡散だけだと粘土に見える
    params: {
      ...BASE, roughAmt: 0.25, sharpAmt: 0.05, fresnel: 1.6,
      baseColor: '#c96a4a', roughColor: '#ffd0b8', sharpColor: '#ffe6d8',
    },
  },
  wax: {
    label: 'Wax',
    // 広い鏡面を強く、鋭い鏡面を弱く。縁を明るくして透けた感じを出す
    params: {
      ...BASE, baseAmt: 0.7, roughAmt: 1.15, sharpAmt: 0.3, roughPower: 5, fresnel: 5.5,
      baseColor: '#7a5fd0', roughColor: '#e3d2ff', sharpColor: '#fff2ff',
    },
  },
  compare: {
    label: 'PBR compare',
    params: { ...BASE, mode: 'pbr', showMatcap: false },
  },
}

export const DEFAULT_PRESET = 'metal'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
