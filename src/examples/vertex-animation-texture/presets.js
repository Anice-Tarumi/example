/** variant プリセット。キーは meta.json の variants[].id と対応する。 */
export const PRESETS = {
  explode: {
    label: 'Shatter Burst',
    params: {
      mode: 'explode',
      cols: 26,
      rows: 18,
      frames: 140,
      scatter: 1,
      speed: 1,
      reveal: 0,
      revealMode: 'locked',
      revealScale: 1.5,
      steps: 4,
      autoPlay: true,
      loopDelay: 1.4,
      colorLit: '#eaf2ff',
      colorShadow: '#1d2b45',
      colorHot: '#ff8a3c',
      spin: 0.22,
    },
  },
  collapse: {
    label: 'Collapse',
    params: {
      mode: 'collapse',
      cols: 30,
      rows: 20,
      frames: 150,
      scatter: 1,
      speed: 0.9,
      reveal: 0,
      revealMode: 'locked',
      revealScale: 1.5,
      steps: 3,
      autoPlay: true,
      loopDelay: 1.8,
      colorLit: '#f4e7d2',
      colorShadow: '#3a2a1d',
      colorHot: '#c96a3a',
      spin: 0.12,
    },
  },
  reveal: {
    label: 'Icon Reveal',
    params: {
      /*
       * 像は破片の**画面上の位置**から作るので、静止した破片が画面を覆っていないと
       * 絵の一部しか映らない。落ちて床に積もると帯になる。
       * 重力ゼロ + 減衰で、空中に広がったまま止める。
       */
      mode: 'float',
      cols: 40,
      rows: 26,
      frames: 90,
      scatter: 1,
      speed: 0.9,
      reveal: 1,
      // 回さない。locked は着地時のカメラで像が結ぶので、回すと崩れる
      revealMode: 'locked',
      revealScale: 1.5,
      steps: 4,
      autoPlay: true,
      loopDelay: 2.6,
      colorLit: '#2a2f3a',
      colorShadow: '#12151c',
      colorHot: '#3a4152',
      spin: 0,
    },
  },
  swirl: {
    label: 'Swirl Up',
    params: {
      mode: 'swirl',
      cols: 24,
      rows: 16,
      frames: 150,
      scatter: 1,
      speed: 0.8,
      reveal: 0.9,
      revealMode: 'locked',
      revealScale: 1.5,
      steps: 5,
      autoPlay: true,
      loopDelay: 1.2,
      colorLit: '#e6fff4',
      colorShadow: '#123a35',
      colorHot: '#3cf0c0',
      spin: 0.3,
    },
  },
  dense: {
    label: 'Dense Debris',
    params: {
      mode: 'explode',
      cols: 44,
      rows: 30,
      frames: 140,
      scatter: 1,
      speed: 1.15,
      reveal: 0.9,
      revealMode: 'locked',
      revealScale: 1.5,
      steps: 3,
      autoPlay: true,
      loopDelay: 1,
      colorLit: '#ffe9f2',
      colorShadow: '#3a1030',
      colorHot: '#ff4d8d',
      spin: 0.26,
    },
  },
}

export const DEFAULT_PRESET = 'explode'
export const DEFAULTS = PRESETS[DEFAULT_PRESET].params

/** leva の options 用 { ラベル: id } テーブル */
export const PRESET_OPTIONS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [p.label, id]),
)
