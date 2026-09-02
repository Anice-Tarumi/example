/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  size: 10,
  fruitCount: 1,
  wrap: false,
  // 1 手の見た目の長さ。短すぎると何が起きたか読めない
  stepDuration: 0.13,
  // 押しっぱなしのとき、1 手目までの待ちと 2 手目以降の間隔
  repeatDelay: 0.26,
  repeatInterval: 0.1,
  squash: 0.22,
  shake: 0.22,
  blockColor: '#ff2d3f',
  tilt: 52,
  snakeColor: '#eef2f6',
  headColor: '#d3ff02',
  fruitColor: '#ff4d6d',
  boardColor: '#171a20',
  cellColor: '#1f242c',
  background: '#0b0d11',
  shadows: true,
}

export const PRESETS = {
  studio: { label: 'Studio', params: { ...BASE } },
  neon: {
    label: 'Neon',
    params: {
      ...BASE,
      snakeColor: '#5ef2ff',
      headColor: '#ffffff',
      fruitColor: '#ff2ea6',
      boardColor: '#0a0f1c',
      cellColor: '#121a2c',
      background: '#04060c',
    },
  },
  paper: {
    label: 'Paper',
    params: {
      ...BASE,
      snakeColor: '#2b2b2b',
      headColor: '#e5533d',
      fruitColor: '#e5533d',
      boardColor: '#e8e5dd',
      cellColor: '#dedbd2',
      background: '#f2efe8',
      tilt: 62,
    },
  },
  wide: {
    label: 'Wide Board',
    params: { ...BASE, size: 16, fruitCount: 3, wrap: true, stepDuration: 0.1, tilt: 58 },
  },
}

export const DEFAULT_PRESET = 'studio'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
