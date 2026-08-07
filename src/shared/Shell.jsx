import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

/** サイドバー常時表示のアプリ外枠。狭い画面ではサイドバーをドロワー化する。 */
export default function Shell() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className={`shell${navOpen ? ' is-nav-open' : ''}`}>
      <button
        type="button"
        className="shell__nav-toggle"
        aria-label="Toggle navigation"
        aria-expanded={navOpen}
        onClick={() => setNavOpen((v) => !v)}
      >
        {navOpen ? '✕' : '☰'}
      </button>

      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />

      <div
        className="shell__scrim"
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  )
}
