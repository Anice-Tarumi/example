/**
 * モードと経済。盤の規則（`game.js`）は触らない。
 *
 * 混ぜると「蛇の規則」が読めなくなる。ここが持つのは
 * 目標・計測・報酬・強化だけ。
 */

export const MODE_OPTIONS = {
  Classic: 'classic',
  'Time Attack': 'time',
  Incremental: 'idle',
}

/** モードごとの盤の条件。強化の影響を受けるのは idle だけ */
export function boardFor(mode, derived) {
  if (mode === 'time') return { size: 8, fruitCount: 3, wrap: false, growth: 3, rareChance: 0 }
  if (mode === 'idle') {
    return {
      size: derived.size,
      fruitCount: derived.fruitCount,
      wrap: false,
      growth: 1,
      rareChance: derived.rareChance,
    }
  }
  return null // classic は leva の値をそのまま使う
}

/*
 * 強化。
 *
 * この手のゲームで効く配分は決まっている。
 *
 * **頻繁に買う小さな加算**（価格の伸び 1.1〜1.2）を用意して、数十秒に 1 回
 * 何かが買える状態を保つ。これが無いと手が止まる。
 * **たまに買う構造変化**（1.7〜2.0）は間隔を空け、買った瞬間に遊びが変わる。
 * そして**乗算を 1 本**入れる。加算だけだと収入が線形で、指数の価格に
 * 追いつけなくなって詰む。
 *
 * 最初の 1 個は 2〜3 ラン（1 分弱）で買えること。ここが遠いと離脱する。
 */
export const UPGRADES = [
  // 小さな加算。ほぼ毎回何か買える
  { id: 'value', label: 'FRUIT VALUE', detail: '+1', base: 6, scale: 1.18, max: 60 },
  { id: 'time', label: 'RUN TIME', detail: '+2s', base: 10, scale: 1.28, max: 30 },
  // 構造が変わるもの
  { id: 'fruits', label: 'FRUITS AT ONCE', detail: '+1', base: 25, scale: 1.75, max: 7 },
  { id: 'rare', label: 'RARE CHANCE', detail: '+4%', base: 45, scale: 1.45, max: 12 },
  { id: 'board', label: 'BOARD SIZE', detail: '+1', base: 60, scale: 1.9, max: 10 },
  // 乗算。ここが伸びの本体
  { id: 'mult', label: 'MARKET', detail: '×1.15', base: 150, scale: 1.6, max: 25 },
  // 遊び方が変わる解禁
  { id: 'auto', label: 'AUTO ADVANCE', detail: 'unlock', base: 120, scale: 1, max: 1 },
  { id: 'speed', label: 'AUTO SPEED', detail: '-12%', base: 35, scale: 1.32, max: 20, needs: 'auto' },
  { id: 'steer', label: 'AUTO STEER', detail: 'unlock', base: 500, scale: 1, max: 1, needs: 'auto' },
]

export function costOf(upgrade, level) {
  return Math.max(1, Math.round(upgrade.base * upgrade.scale ** level))
}

/** レア果物の倍率。数字を触るのはここ 1 箇所 */
export const RARE_MULTIPLIER = 5

export function derive(levels) {
  const l = (id) => levels[id] ?? 0
  return {
    runSeconds: 10 + 2 * l('time'),
    // 加算 × 乗算。乗算が無いと指数の価格に収入が追いつかない
    fruitValue: (1 + l('value')) * 1.15 ** l('mult'),
    fruitCount: 1 + l('fruits'),
    size: 8 + l('board'),
    rareChance: Math.min(0.6, 0.04 * l('rare')),
    auto: l('auto') > 0,
    // 自動で進む間隔。強化するほど詰まるが、下限は付ける
    stepDelay: Math.max(0.07, 0.42 * 0.88 ** l('speed')),
    steer: l('steer') > 0,
  }
}

const SAVE_KEY = 'showcase.grid-snake.v1'

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return { money: 0, levels: {}, best: 0 }
    const v = JSON.parse(raw)
    return { money: v.money ?? 0, levels: v.levels ?? {}, best: v.best ?? 0 }
  } catch {
    return { money: 0, levels: {}, best: 0 }
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    // 保存できない環境（プライベートモード等）でも遊べるようにする
  }
}

/**
 * 自動操縦。
 *
 * 経路探索まではしない。**進める方向のうち、一番近い果物へ寄る**だけ。
 * 完全な解法にすると詰まなくなって、盤面の強化を買う理由が消える。
 */
export function autoDirection(game, DIRS) {
  const s = game.state
  const head = s.snake[0]
  const legal = Object.values(DIRS).filter((d) => !game.probe(d).blocked)
  if (!legal.length) return null
  if (!s.fruits.length) return legal[0]

  let bestDir = legal[0]
  let bestScore = Infinity
  for (const d of legal) {
    const nx = head.x + d.x
    const ny = head.y + d.y
    for (const f of s.fruits) {
      // レアを優先する。距離を割り引く
      const w = f.rare ? 0.55 : 1
      const dist = (Math.abs(f.x - nx) + Math.abs(f.y - ny)) * w
      if (dist < bestScore) {
        bestScore = dist
        bestDir = d
      }
    }
  }
  return bestDir
}

/* ------------------------------------------------------------------ *
 * 記録
 * ------------------------------------------------------------------ */

const BOARD_KEY = 'showcase.grid-snake.board.v1'
export const BOARD_SIZE = 10

/**
 * 順位表。手数が少ないほど上。
 *
 * サーバーは無いので端末内に持つ。**cookie ではなく localStorage** を使う。
 * cookie は毎リクエストに載るうえ 4KB で、期限も切れる。
 * 端末に残しておくだけの用途なら localStorage のほうが素直で、消されない限り残る。
 */
export function loadBoard() {
  try {
    const raw = localStorage.getItem(BOARD_KEY)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.slice(0, BOARD_SIZE) : []
  } catch {
    return []
  }
}

export function writeBoard(list) {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(list.slice(0, BOARD_SIZE)))
  } catch {
    // 保存できない環境でも遊べるようにする
  }
}

/** 載るかどうか。同着は先に出したほうが上 */
export function qualifies(list, turns) {
  if (!turns) return false
  if (list.length < BOARD_SIZE) return true
  return turns < list[list.length - 1].turns
}

export function insertScore(list, entry) {
  const next = [...list, entry].sort((a, b) => a.turns - b.turns || a.at - b.at)
  return next.slice(0, BOARD_SIZE)
}

/**
 * 国コード（2 文字）から旗の絵文字。
 *
 * 画像を持たずに済む。Regional Indicator Symbol は A→🇦 の並びなので、
 * コードポイントを 2 つ足すだけ。
 * Windows の Chrome は旗を合成しないので、その環境では "JP" と出る。
 */
export function flagOf(code) {
  const c = (code || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(c)) return '🏳'
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
}

/** 既定の国。端末の言語から推測する。外していても本人が直せる */
export function guessCountry() {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language || 'en-US']
  for (const t of tags) {
    const m = /-([A-Za-z]{2})\b/.exec(t)
    if (m) return m[1].toUpperCase()
  }
  return 'JP'
}

export const COUNTRY_HINTS = [
  'JP', 'US', 'GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'SE', 'NO', 'FI', 'DK',
  'PL', 'CZ', 'TR', 'RU', 'UA', 'CN', 'KR', 'TW', 'HK', 'SG', 'TH', 'VN',
  'ID', 'IN', 'AU', 'NZ', 'CA', 'MX', 'BR', 'AR', 'CL', 'ZA',
]
