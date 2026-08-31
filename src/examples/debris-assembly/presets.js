/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
const BASE = {
  count: 1800,
  frames: 130,
  dropHeight: 3.2,
  stagger: 0.55,
  spread: 0.06,
  spanX: 3.6,
  spanZ: 3.6,
  pieceSize: 0.075,
  sizeVariation: 0.45,
  alphaThreshold: 0.4,
  speed: 1,
  loop: true,
  loopDelay: 2.2,
  steps: 4,
  shadowTint: '#4a4550',
  airFade: 0.06,
  background: '#0b0d12',
  ground: '#171a21',
}

export const PRESETS = {
  drop: { label: 'Drop', params: { ...BASE } },
  fine: {
    label: 'Fine Grain',
    params: {
      ...BASE,
      count: 3200,
      pieceSize: 0.055,
      sizeVariation: 0.3,
      spread: 0.08,
      frames: 150,
      stagger: 0.7,
    },
  },
  chunky: {
    label: 'Chunky',
    params: {
      ...BASE,
      count: 900,
      pieceSize: 0.13,
      sizeVariation: 0.6,
      spread: 0.16,
      frames: 140,
      steps: 3,
    },
  },
  rain: {
    label: 'Slow Rain',
    params: {
      ...BASE,
      count: 2400,
      dropHeight: 6,
      stagger: 1.6,
      frames: 200,
      speed: 0.8,
      loopDelay: 3,
      airFade: 0.09,
    },
  },
}

export const DEFAULT_PRESET = 'drop'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
