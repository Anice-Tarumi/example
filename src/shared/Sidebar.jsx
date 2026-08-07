import { useMemo, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { examples, allTags } from '../registry'
import { groupByCategory } from '../categories'

function matchesQuery(ex, q) {
  if (!q) return true
  const haystack = [ex.title, ex.description, ex.category, ...(ex.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

export default function Sidebar({ open, onNavigate }) {
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState([])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = examples.filter(
      (ex) =>
        matchesQuery(ex, q) &&
        activeTags.every((t) => (ex.tags || []).includes(t)),
    )
    return groupByCategory(filtered)
  }, [query, activeTags])

  const hitCount = groups.reduce((n, g) => n + g.items.length, 0)

  const toggleTag = (tag) =>
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )

  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`}>
      <Link to="/" className="sidebar__brand" onClick={onNavigate}>
        <span className="sidebar__brand-title">Showcase</span>
        <span className="sidebar__brand-sub">Web Effects Collection</span>
      </Link>

      <div className="sidebar__search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          aria-label="Search examples"
        />
      </div>

      {allTags.length > 0 && (
        <div className="sidebar__tags">
          {allTags.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              className={`sidebar__tag${activeTags.includes(tag) ? ' is-active' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
              <span className="sidebar__tag-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      <nav className="sidebar__list">
        {hitCount === 0 ? (
          <p className="sidebar__empty">該当なし</p>
        ) : (
          groups.map(({ category, items }) => (
            <section key={category.id} className="sidebar__group">
              <h2 className="sidebar__group-title" title={category.desc}>
                {category.label}
              </h2>
              <ul>
                {items.map((ex) => (
                  <li key={ex.slug}>
                    <NavLink
                      to={`/examples/${ex.slug}`}
                      className={({ isActive }) =>
                        `sidebar__item${isActive ? ' is-active' : ''}`
                      }
                      onClick={onNavigate}
                    >
                      <span className="sidebar__item-title">{ex.title}</span>
                      {ex.variants?.length > 1 && (
                        <span className="sidebar__item-badge">
                          {ex.variants.length}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      <footer className="sidebar__footer">
        {examples.length} examples
        {(query || activeTags.length > 0) && ` · ${hitCount} hit`}
      </footer>
    </aside>
  )
}
