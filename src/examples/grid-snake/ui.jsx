import { UPGRADES, costOf, RARE_MULTIPLIER } from './modes'

/**
 * 盤の上に重ねる表示。
 *
 * 触れるのは店だけ。HUD ごと `pointer-events` を有効にすると盤が触れなくなる。
 */

export function Hud({ mode, score, money, turns, remaining, best }) {
  if (mode === 'time') {
    return (
      <div className="snk__hud">
        <span className="snk__score">{turns}</span>
        <span className="snk__label">TURNS · FILL THE BOARD</span>
      </div>
    )
  }
  if (mode === 'idle') {
    return (
      <div className="snk__hud">
        <span className="snk__score">{remaining.toFixed(1)}</span>
        <span className="snk__label">SECONDS · ¤{money}</span>
      </div>
    )
  }
  return (
    <div className="snk__hud">
      <span className="snk__score">{score}</span>
      <span className="snk__label">{best ? `FRUITS · BEST ${best}` : 'FRUITS'}</span>
    </div>
  )
}

/** 決着の板。モードごとに見せる数字が違う */
export function ResultCard({ mode, reason, score, turns, elapsed, best, onRestart }) {
  const filled = reason === 'filled'
  const title = mode === 'time'
    ? (filled ? 'BOARD FILLED' : 'NO MOVES LEFT')
    : 'NO MOVES LEFT'

  return (
    <div className="snk__over">
      <div className="snk__card">
        <span className="snk__over-label">{title}</span>
        <span className="snk__over-score">{mode === 'time' ? turns : score}</span>
        <span className="snk__label">{mode === 'time' ? 'TURNS' : 'FRUITS EATEN'}</span>
        {mode === 'time' && (
          <span className="snk__over-sub">
            {elapsed.toFixed(1)}s{best ? ` · BEST ${best} TURNS` : ''}
          </span>
        )}
        <button type="button" className="snk__button" onClick={onRestart} autoFocus>
          RESTART
        </button>
        <span className="snk__over-hint">OR PRESS R</span>
      </div>
    </div>
  )
}

/**
 * 店。
 *
 * 買えないものも並べる。**次に何を目指すかが見えていないと、
 * 貯める動機が生まれない。**
 */
export function Shop({ money, levels, earned, onBuy, onStart }) {
  return (
    <div className="snk__over">
      <div className="snk__card snk__card--shop">
        <span className="snk__over-label">RUN OVER · EARNED ¤{earned}</span>
        <span className="snk__over-score">¤{money}</span>

        <ul className="snk__shop">
          {UPGRADES.map((u) => {
            const level = levels[u.id] ?? 0
            const locked = u.needs && !(levels[u.needs] > 0)
            const maxed = level >= u.max
            const cost = costOf(u, level)
            const afford = money >= cost && !locked && !maxed
            return (
              <li key={u.id} className="snk__shop-row" data-locked={locked || maxed ? 'true' : 'false'}>
                <span className="snk__shop-name">
                  {u.label}
                  <em>{maxed ? 'MAX' : u.detail}</em>
                </span>
                <span className="snk__shop-level">{u.max > 1 ? `${level}/${u.max}` : level ? 'ON' : '—'}</span>
                <button
                  type="button"
                  className="snk__buy"
                  disabled={!afford}
                  onClick={() => onBuy(u.id)}
                >
                  {maxed ? '—' : locked ? 'LOCKED' : `¤${cost}`}
                </button>
              </li>
            )
          })}
        </ul>

        <p className="snk__shop-note">RARE FRUIT PAYS ×{RARE_MULTIPLIER}</p>

        <button type="button" className="snk__button" onClick={onStart} autoFocus>
          NEXT RUN
        </button>
        <span className="snk__over-hint">OR PRESS R</span>
      </div>
    </div>
  )
}

/** 開始待ち。自動で走り出すと、盤を見る前に時間が減る */
export function StartCard({ mode, seconds, onStart }) {
  return (
    <div className="snk__over">
      <div className="snk__card">
        <span className="snk__over-label">{mode === 'idle' ? 'READY' : 'TIME ATTACK'}</span>
        <span className="snk__over-score">{mode === 'idle' ? `${seconds}s` : '8×8'}</span>
        <span className="snk__label">
          {mode === 'idle' ? 'COLLECT FRUIT FOR MONEY' : 'FILL THE BOARD IN FEWEST TURNS'}
        </span>
        <button type="button" className="snk__button" onClick={onStart} autoFocus>
          START
        </button>
        <span className="snk__over-hint">ARROWS OR WASD</span>
      </div>
    </div>
  )
}
