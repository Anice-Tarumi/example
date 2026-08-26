/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  ink: {
    label: 'Ink Bloom',
    params: {
      mode: 'dye',
      simRes: 128,
      dyeRes: 512,
      curl: 30,
      pressure: 0.8,
      pressureIterations: 20,
      velocityDissipation: 0.2,
      densityDissipation: 1.4,
      splatRadius: 0.25,
      splatForce: 6000,
      dyeAmount: 0.12,
      exposure: 1,
      shading: 0.35,
      colorSpeed: 0.12,
      saturation: 0.95,
      autoDemo: true,
      demoSpeed: 1,
    },
  },
  smoke: {
    label: 'Monochrome Smoke',
    params: {
      mode: 'dye',
      simRes: 128,
      dyeRes: 512,
      curl: 12,
      pressure: 0.86,
      pressureIterations: 20,
      velocityDissipation: 0.12,
      densityDissipation: 0.9,
      splatRadius: 0.32,
      splatForce: 4200,
      dyeAmount: 0.12,
      exposure: 1.1,
      shading: 0.55,
      colorSpeed: 0,
      saturation: 0,
      autoDemo: true,
      demoSpeed: 0.7,
    },
  },
  vortex: {
    label: 'Vortex Storm',
    params: {
      mode: 'dye',
      simRes: 128,
      dyeRes: 512,
      curl: 55,
      pressure: 0.7,
      pressureIterations: 24,
      velocityDissipation: 0.06,
      densityDissipation: 1.1,
      splatRadius: 0.18,
      splatForce: 9000,
      dyeAmount: 0.12,
      exposure: 1.15,
      shading: 0.2,
      colorSpeed: 0.35,
      saturation: 1,
      autoDemo: true,
      demoSpeed: 1.5,
    },
  },
  field: {
    label: 'Velocity Field',
    params: {
      mode: 'velocity',
      simRes: 128,
      dyeRes: 512,
      curl: 30,
      pressure: 0.8,
      pressureIterations: 20,
      velocityDissipation: 0.2,
      densityDissipation: 1.4,
      splatRadius: 0.25,
      splatForce: 6000,
      dyeAmount: 0.12,
      exposure: 1,
      shading: 0,
      colorSpeed: 0.12,
      saturation: 0.95,
      autoDemo: true,
      demoSpeed: 1,
    },
  },
}

export const MODES = ['dye', 'velocity', 'curl']
export const SIM_RESOLUTIONS = { low: 64, mid: 128, high: 192 }
export const DYE_RESOLUTIONS = { '256': 256, '512': 512, '1024': 1024 }

export const DEFAULT_PRESET = 'ink'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
