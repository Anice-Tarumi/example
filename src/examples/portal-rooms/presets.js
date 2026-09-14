/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  portalOn: true,
  // near 面を窓へ倒す。切ると、窓より手前の物まで写り込むのが見える
  oblique: true,
  walkSpeed: 3.2,

  warmWall: '#c07a4e',
  warmFloor: '#6b4630',
  warmProp: '#e0b184',
  warmLight: '#ffd8a8',
  frameWarm: '#ffe0b0',

  coldWall: '#1d2635',
  coldFloor: '#131a26',
  coldProp: '#5f7a94',
  coldLight: '#8fd8ff',
  frameCold: '#9fe6ff',
}

export const PRESETS = {
  rooms: { label: 'Rooms', params: { ...BASE } },
  noOblique: {
    label: 'No clip',
    params: { ...BASE, oblique: false },
  },
  off: {
    label: 'Portal off',
    params: { ...BASE, portalOn: false },
  },
  mono: {
    label: 'Mono',
    params: {
      ...BASE,
      warmWall: '#8a8a8a', warmFloor: '#4a4a4a', warmProp: '#b5b5b5', warmLight: '#ffffff',
      coldWall: '#232323', coldFloor: '#151515', coldProp: '#6e6e6e', coldLight: '#dfefff',
      frameWarm: '#ffffff', frameCold: '#cfe8ff',
    },
  },
}

export const DEFAULT_PRESET = 'rooms'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
