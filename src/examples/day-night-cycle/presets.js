/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  scene: 'town',
  time: 0.28,
  autoplay: true,
  speed: 0.02,
  weather: 0,
  fogDensity: 0.055,
  fogSunPower: 6,
  sunIntensity: 1,
  shadows: true,
  exposure: 1,
}

export const PRESETS = {
  dawn: { label: 'Dawn', params: { ...BASE, time: 0.24, scene: 'town' } },
  noon: { label: 'Noon', params: { ...BASE, time: 0.5, fogDensity: 0.035, scene: 'lighthouse' } },
  dusk: { label: 'Dusk', params: { ...BASE, time: 0.77, fogDensity: 0.07, scene: 'ruins' } },
  overcast: {
    label: 'Overcast',
    params: { ...BASE, time: 0.42, weather: 0.85, fogDensity: 0.1, scene: 'forest', autoplay: false },
  },
}

export const DEFAULT_PRESET = 'dawn'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
