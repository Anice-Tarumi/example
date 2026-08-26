/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  ink: {
    label: 'Ink Outline',
    params: {
      mode: 'scene',
      thickness: 1.6,
      outlineColor: '#2a2320',
      idMax: 0.35,
      idThreshold: 0.12,
      depthMax: 0.02,
      depthThreshold: 0.35,
      normalMax: 1.4,
      normalThreshold: 0.22,
      smoothMargin: 0.12,
      toonSteps: 3,
      sketch: 0,
      spin: 0.18,
      background: '#59b6b4',
    },
  },
  bold: {
    label: 'Bold Marker',
    params: {
      mode: 'scene',
      thickness: 2.6,
      outlineColor: '#141414',
      idMax: 0.3,
      idThreshold: 0.08,
      depthMax: 0.018,
      depthThreshold: 0.3,
      normalMax: 1.2,
      normalThreshold: 0.18,
      smoothMargin: 0.08,
      toonSteps: 2,
      sketch: 0,
      spin: 0.14,
      background: '#6cc3bf',
    },
  },
  sketch: {
    label: 'Sketch',
    params: {
      mode: 'scene',
      thickness: 1.8,
      outlineColor: '#3a2f26',
      idMax: 0.35,
      idThreshold: 0.1,
      depthMax: 0.02,
      depthThreshold: 0.32,
      normalMax: 1.3,
      normalThreshold: 0.2,
      smoothMargin: 0.16,
      toonSteps: 4,
      sketch: 0.9,
      spin: 0.1,
      background: '#7fcac4',
    },
  },
  buffers: {
    label: 'ID Buffer',
    params: {
      mode: 'id',
      thickness: 1,
      outlineColor: '#ae2118',
      idMax: 0.35,
      idThreshold: 0.12,
      depthMax: 0.02,
      depthThreshold: 0.35,
      normalMax: 1.4,
      normalThreshold: 0.22,
      smoothMargin: 0.12,
      toonSteps: 3,
      sketch: 0,
      spin: 0.18,
      background: '#0a0a0a',
    },
  },
}

export const MODES = ['scene', 'depth', 'normal', 'id']

export const DEFAULT_PRESET = 'ink'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
