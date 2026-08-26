/**
 * variant プリセット。
 * ice の値は igloo の氷マテリアル（uChromaticAberration 0.1 / uThickness 2 /
 * colorFrost #83a1c5）を出発点にしている。
 */
export const PRESETS = {
  ice: {
    label: 'Frosted Ice',
    params: {
      shape: 'sphere',
      samples: 4,
      chromaticAberration: 0.12,
      thickness: 2,
      roughness: 0.55,
      ior: 1.42,
      attenuationDistance: 7,
      attenuationColor: '#bcd9ff',
      frostColor: '#83a1c5',
      frostAmount: 0.8,
      meltAmount: 1,
      rimIntensity: 1.2,
      frostStrength: 1,
      frostDamping: 0.972,
      frostSpeed: 1,
      frostAdvect: 1,
      color: '#ffffff',
      envIntensity: 0.9,
      spin: 0.06,
      autoRotate: 0.18,
    },
  },
  crystal: {
    label: 'Clear Crystal',
    params: {
      shape: 'torusKnot',
      samples: 4,
      chromaticAberration: 0.22,
      thickness: 1.4,
      roughness: 0.02,
      ior: 1.55,
      attenuationDistance: 6,
      attenuationColor: '#ffffff',
      frostColor: '#cfe6ff',
      frostAmount: 0.08,
      meltAmount: 1,
      rimIntensity: 1.2,
      frostStrength: 1,
      frostDamping: 0.972,
      frostSpeed: 1,
      frostAdvect: 1,
      color: '#ffffff',
      envIntensity: 1.1,
      spin: 0.06,
      autoRotate: 0.3,
    },
  },
  frosted: {
    label: 'Ground Glass',
    params: {
      shape: 'box',
      samples: 6,
      chromaticAberration: 0.05,
      thickness: 2.6,
      roughness: 0.42,
      ior: 1.35,
      attenuationDistance: 5,
      attenuationColor: '#dbe8f2',
      frostColor: '#eef4fb',
      frostAmount: 0.5,
      meltAmount: 1,
      rimIntensity: 1.2,
      frostStrength: 1,
      frostDamping: 0.972,
      frostSpeed: 1,
      frostAdvect: 1,
      color: '#ffffff',
      envIntensity: 0.8,
      spin: 0.05,
      autoRotate: 0.12,
    },
  },
  diamond: {
    label: 'Diamond Dispersion',
    params: {
      shape: 'octahedron',
      samples: 6,
      chromaticAberration: 0.45,
      thickness: 1.1,
      roughness: 0.0,
      ior: 2.2,
      attenuationDistance: 8,
      attenuationColor: '#ffffff',
      frostColor: '#ffffff',
      frostAmount: 0.04,
      meltAmount: 1,
      rimIntensity: 1.2,
      frostStrength: 1,
      frostDamping: 0.972,
      frostSpeed: 1,
      frostAdvect: 1,
      color: '#ffffff',
      envIntensity: 1.3,
      spin: 0.08,
      autoRotate: 0.42,
    },
  },
}

export const SHAPES = ['icosahedron', 'torusKnot', 'box', 'octahedron', 'sphere']

export const DEFAULT_PRESET = 'ice'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
