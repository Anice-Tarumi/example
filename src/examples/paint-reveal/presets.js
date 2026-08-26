/**
 * variant プリセット。
 * `paint` の各値は ai-quest 本番の properties（screenPaint*）をそのまま使っている。
 */
export const PRESETS = {
  paint: {
    label: 'Paint Reveal',
    params: {
      mode: 'paint',
      autoDemo: true,
      demoSpeed: 1,
      desaturation: 1,
      displace: 1,
      overlayBoost: 1,
      minRadius: 12,
      maxRadius: 60,
      radiusRange: 60,
      pushStrength: 24,
      velocityDissipation: 0.98,
      weight1Dissipation: 0.98,
      weight2Dissipation: 0.92,
      accelerationDissipation: 0.8,
      curlScale: 0.048,
      curlStrength: 4,
      fadeIntensity: 0.04,
      paintIntensity: 1,
      distortAmount: 0.024,
    },
  },
  flow: {
    label: 'Curl Flow',
    params: {
      mode: 'paint',
      autoDemo: true,
      demoSpeed: 1,
      desaturation: 1,
      displace: 2.2,
      overlayBoost: 1.4,
      minRadius: 18,
      maxRadius: 90,
      radiusRange: 70,
      pushStrength: 34,
      velocityDissipation: 0.99,
      weight1Dissipation: 0.985,
      weight2Dissipation: 0.94,
      accelerationDissipation: 0.86,
      curlScale: 0.03,
      curlStrength: 11,
      fadeIntensity: 0.02,
      paintIntensity: 1,
      distortAmount: 0.05,
    },
  },
  linger: {
    label: 'Lingering Ink',
    params: {
      mode: 'paint',
      autoDemo: true,
      demoSpeed: 1,
      desaturation: 1,
      displace: 0.8,
      overlayBoost: 0.6,
      minRadius: 10,
      maxRadius: 55,
      radiusRange: 60,
      pushStrength: 20,
      velocityDissipation: 0.994,
      weight1Dissipation: 0.994,
      weight2Dissipation: 0.96,
      accelerationDissipation: 0.85,
      curlScale: 0.06,
      curlStrength: 3,
      fadeIntensity: 0.004,
      paintIntensity: 1,
      distortAmount: 0.016,
    },
  },
  mask: {
    label: 'Mask Debug',
    params: {
      mode: 'mask',
      autoDemo: true,
      demoSpeed: 1,
      desaturation: 1,
      displace: 1,
      overlayBoost: 1,
      minRadius: 12,
      maxRadius: 60,
      radiusRange: 60,
      pushStrength: 24,
      velocityDissipation: 0.98,
      weight1Dissipation: 0.98,
      weight2Dissipation: 0.92,
      accelerationDissipation: 0.8,
      curlScale: 0.048,
      curlStrength: 4,
      fadeIntensity: 0.04,
      paintIntensity: 1,
      distortAmount: 0.024,
    },
  },
}

export const MODES = ['paint', 'mask']

export const DEFAULT_PRESET = 'paint'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
