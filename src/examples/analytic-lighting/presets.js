/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const LIGHT_TYPES = ['sphere', 'tube', 'rect']

export const PRESETS = {
  sphere: {
    label: 'Sphere Light',
    params: {
      lightType: 'sphere',
      radius: 0.45,
      tubeLength: 1.2,
      rectWidth: 1.0,
      rectHeight: 0.6,
      power: 22,
      lightColor: '#ffd9b0',
      orbit: 2.6,
      orbitSpeed: 0.28,
      height: 2.1,
      roughScale: 1,
      metalness: 0,
      occlusion: 0.8,
      ambient: '#141b28',
      floorColor: '#20242c',
    },
  },
  tube: {
    label: 'Tube Light',
    params: {
      lightType: 'tube',
      radius: 0.12,
      tubeLength: 1.9,
      rectWidth: 1.0,
      rectHeight: 0.6,
      power: 26,
      lightColor: '#bcd9ff',
      orbit: 2.4,
      orbitSpeed: 0.22,
      height: 2.0,
      roughScale: 0.6,
      metalness: 0.2,
      occlusion: 0.8,
      ambient: '#101724',
      floorColor: '#1c2029',
    },
  },
  rect: {
    label: 'Rect Light',
    params: {
      lightType: 'rect',
      radius: 0.06,
      tubeLength: 1.2,
      rectWidth: 1.3,
      rectHeight: 0.85,
      power: 30,
      lightColor: '#ffeccf',
      orbit: 2.8,
      orbitSpeed: 0.2,
      height: 2.3,
      roughScale: 0.8,
      metalness: 0.1,
      occlusion: 0.85,
      ambient: '#151a22',
      floorColor: '#232833',
    },
  },
  contact: {
    label: 'Proximity AO',
    params: {
      lightType: 'sphere',
      radius: 0.9,
      tubeLength: 1.2,
      rectWidth: 1.0,
      rectHeight: 0.6,
      power: 16,
      lightColor: '#ffffff',
      orbit: 1.4,
      orbitSpeed: 0.12,
      height: 3.4,
      roughScale: 2.2,
      metalness: 0,
      occlusion: 1,
      ambient: '#3a4452',
      floorColor: '#6c7684',
    },
  },
}

export const DEFAULT_PRESET = 'sphere'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
