/**
 * 盤面のルール。描画も three も知らない。
 *
 * **1 回の入力 = 1 ターン。** 勝手には進まない。
 * 自動で進む蛇と違って、盤面を眺めて考えられるので、詰将棋に近い手触りになる。
 *
 * 描画側が補間できるよう、進む前の配置（`prev`）を残す。
 * 現在位置だけ渡すと、駒が瞬間移動して安っぽくなる。
 */

export const DIRS = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function createGame({ size = 10, fruits = 1, wrap = false, seed = 0x9e37 } = {}) {
  let rand = makeRandom(seed)

  const state = {
    size,
    wrap,
    fruitCount: fruits,
    snake: [],
    prev: [],
    fruits: [],
    dir: DIRS.right,
    score: 0,
    turns: 0,
    over: false,
    /** 直前のターンで何が起きたか。描画側の演出用 */
    lastAte: null,
  }

  const key = (c) => c.y * state.size + c.x
  const occupied = () => new Set(state.snake.map(key))

  function spawnFruit() {
    const taken = occupied()
    for (const f of state.fruits) taken.add(key(f))
    const free = []
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const c = { x, y }
        if (!taken.has(key(c))) free.push(c)
      }
    }
    if (!free.length) return null
    const c = free[Math.floor(rand() * free.length)]
    state.fruits.push(c)
    return c
  }

  function reset(opts = {}) {
    if (opts.size) state.size = opts.size
    if (opts.fruitCount) state.fruitCount = opts.fruitCount
    if (opts.wrap !== undefined) state.wrap = opts.wrap
    rand = makeRandom(seed + state.turns)

    const mid = Math.floor(state.size / 2)
    // 3 節から。1 節だと「伸びた」が分かりにくい
    state.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ]
    state.prev = state.snake.map((c) => ({ ...c }))
    state.fruits = []
    state.dir = DIRS.right
    state.score = 0
    state.turns = 0
    state.over = false
    state.lastAte = null
    while (state.fruits.length < state.fruitCount) if (!spawnFruit()) break
    return state
  }

  /**
   * その方向へ進めるか。進めないなら理由を返す。
   *
   * 食べないターンは尻尾が 1 マス進むので、**尻尾のマスへは入れる**。
   * ここを厳しくすると、ぐるぐる回っているだけで理不尽に詰む。
   */
  function probe(dir) {
    const head = state.snake[0]
    let nx = head.x + dir.x
    let ny = head.y + dir.y

    if (state.wrap) {
      nx = (nx + state.size) % state.size
      ny = (ny + state.size) % state.size
    } else if (nx < 0 || ny < 0 || nx >= state.size || ny >= state.size) {
      return { blocked: 'wall' }
    }

    const fruitIndex = state.fruits.findIndex((f) => f.x === nx && f.y === ny)
    const ate = fruitIndex >= 0
    const body = ate ? state.snake : state.snake.slice(0, -1)
    if (body.some((c) => c.x === nx && c.y === ny)) return { blocked: 'self' }

    return { blocked: null, next: { x: nx, y: ny }, fruitIndex, ate }
  }

  /** 進める方向が 1 つでもあるか。無ければ詰み */
  function anyMove() {
    return Object.values(DIRS).some((d) => !probe(d).blocked)
  }

  function step(dir) {
    if (state.over) return { moved: false }

    const want = dir ?? state.dir
    const p = probe(want)

    /*
     * **自分の体へは進ませない。死なせもしない。**
     * 入力を弾いて、描画側に「跳ねて赤く光る」を出させる。
     * 首へ戻る入力もここで弾かれるので、逆走の特別扱いは要らない。
     */
    if (p.blocked === 'self') return { moved: false, blocked: 'self', dir: want }
    if (p.blocked === 'wall') {
      state.over = true
      return { moved: false, died: 'wall', dir: want }
    }

    state.dir = want
    const { next, fruitIndex, ate } = p

    state.prev = state.snake.map((c) => ({ ...c }))
    state.snake.unshift(next)
    if (ate) {
      state.fruits.splice(fruitIndex, 1)
      state.score += 1
      // 伸びた節は前の尻尾の位置から生えるので、補間の始点をそこに置く
      state.prev.push({ ...state.prev[state.prev.length - 1] })
    } else {
      state.snake.pop()
    }

    state.turns += 1
    state.lastAte = ate ? next : null
    while (state.fruits.length < state.fruitCount) if (!spawnFruit()) break

    // 四方すべて塞がったら詰み。弾き続けても打つ手がない
    if (!anyMove()) {
      state.over = true
      return { moved: true, ate, died: 'trapped' }
    }

    return { moved: true, ate }
  }

  reset()

  return { state, step, reset, spawnFruit, probe }
}
