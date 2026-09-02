import { useState } from 'react'
import { UPGRADES, costOf, RARE_MULTIPLIER, flagOf, COUNTRY_HINTS } from './modes'

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

/** 最初の画面。モードを選ばせる */
export function TitleCard({ onPick }) {
  return (
    <div className="snk__over">
      <div className="snk__card snk__card--title">
        <span className="snk__over-label">GRID</span>
        <h1 className="snk__title">SNAKE</h1>
        <span className="snk__label">ONE PRESS · ONE TURN</span>
        <div className="snk__modes">
          <button type="button" className="snk__button" onClick={() => onPick('time')} autoFocus>
            TIME ATTACK
          </button>
          <button type="button" className="snk__button" onClick={() => onPick('idle')}>
            INCREMENTAL
          </button>
          <button type="button" className="snk__button snk__button--ghost" onClick={() => onPick('classic')}>
            FREE PLAY
          </button>
        </div>
      </div>
    </div>
  )
}

/** 順位表。左上に置く。触らせないので pointer-events は切る */
export function Leaderboard({ list }) {
  return (
    <div className="snk__lb">
      <span className="snk__lb-title">FEWEST TURNS</span>
      <ol className="snk__lb-list">
        {Array.from({ length: 10 }, (_, i) => {
          const e = list[i]
          return (
            <li key={i} className="snk__lb-row" data-empty={e ? 'false' : 'true'}>
              <span className="snk__lb-rank">{i + 1}</span>
              <span className="snk__lb-flag">{e ? flagOf(e.country) : ''}</span>
              <span className="snk__lb-name">{e ? e.name : '—'}</span>
              <span className="snk__lb-turns">{e ? e.turns : ''}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** 決着の板。モードごとに見せる数字が違う */
export function ResultCard({
  mode, reason, score, turns, elapsed, best, canRecord, defaults, onSubmit, onRestart, onTitle,
}) {
  const [name, setName] = useState(defaults?.name ?? '')
  const [country, setCountry] = useState(defaults?.country ?? 'JP')
  const [sent, setSent] = useState(false)

  const filled = reason === 'filled'
  const title = mode === 'time' ? (filled ? 'BOARD FILLED' : 'NO MOVES LEFT') : 'NO MOVES LEFT'

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

        {canRecord && !sent && (
          <form
            className="snk__entry"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit({ name: name.trim().slice(0, 12) || 'ANON', country: country.toUpperCase() })
              setSent(true)
            }}
          >
            <span className="snk__entry-label">TOP 10 — ENTER YOUR NAME</span>
            <div className="snk__entry-row">
              <span className="snk__entry-flag">{flagOf(country)}</span>
              <input
                className="snk__input snk__input--cc"
                value={country}
                onChange={(e) => setCountry(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2))}
                list="snk-countries"
                aria-label="country code"
              />
              <input
                className="snk__input"
                value={name}
                placeholder="NAME"
                maxLength={12}
                onChange={(e) => setName(e.target.value)}
                aria-label="name"
                autoFocus
              />
              <button type="submit" className="snk__buy">SAVE</button>
            </div>
            <datalist id="snk-countries">
              {COUNTRY_HINTS.map((c) => <option key={c} value={c} />)}
            </datalist>
          </form>
        )}

        <button type="button" className="snk__button" onClick={onRestart}>RESTART</button>
        <button type="button" className="snk__button snk__button--ghost" onClick={onTitle}>TITLE</button>
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
export function Shop({ money, levels, earned, onBuy, onStart, onTitle }) {
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
        <button type="button" className="snk__button snk__button--ghost" onClick={onTitle}>TITLE</button>
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
