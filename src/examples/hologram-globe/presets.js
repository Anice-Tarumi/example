/** variant プリセット。キーは meta.json の variants[].id と対応する。 */

const BASE = {
  dots: 16000,
  dot: 1.8,
  lineGain: 0.55,
  spin: 0.09,

  // --- 信号 ---
  // 走査帯は物体空間の高さで数える。細かすぎると縞、粗すぎると帯に見えない
  scanFreq: 7,
  scanSpeed: 0.28,
  scanGain: 0.7,
  glitch: 0.06,
  flicker: 0.1,

  // --- 体積 ---
  shellGain: 0.5,
  shellPower: 2.6,
  coneGain: 0.22,

  // --- 弧 ---
  arcs: 34,
  arcDuration: 2.8,
  arcGap: 3.5,
  arcTail: 0.55,
  arcWidth: 0.013,
  arcLift: 0.95,
  arcGain: 1.8,

  tint: '#69e0ff',
  arcTint: '#dff6ff',
  background: '#04070c',
}

export const PRESETS = {
  scan: { label: 'Scan', params: { ...BASE } },
  dense: {
    label: 'Dense',
    params: { ...BASE, dots: 26000, dot: 1.3, lineGain: 0.3, arcs: 60, arcWidth: 0.009 },
  },
  unstable: {
    label: 'Unstable',
    params: {
      ...BASE, glitch: 0.28, flicker: 0.34, scanFreq: 14, scanGain: 1.2,
      shellGain: 0.75, arcs: 22, tint: '#7fd4ff',
    },
  },
  amber: {
    label: 'Amber',
    params: {
      ...BASE, tint: '#ffb463', arcTint: '#fff2d6', background: '#0a0603',
      scanFreq: 4.5, scanGain: 0.5, coneGain: 0.3,
    },
  },
}

export const DEFAULT_PRESET = 'scan'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
