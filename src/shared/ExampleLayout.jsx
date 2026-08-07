import { useState } from 'react'
import { Leva } from 'leva'
import { getCategory } from '../categories'
import { levaTheme } from './levaTheme'

/** キャンバス全面 + 右上コントロールパネル + 左下 info オーバーレイ */
export default function ExampleLayout({ meta, children }) {
  const [infoOpen, setInfoOpen] = useState(true)
  const category = getCategory(meta.category)

  return (
    <div className="stage">
      <div className="stage__canvas">{children}</div>

      <div className="stage__controls">
        <Leva fill flat titleBar={false} theme={levaTheme} />
      </div>

      <div className={`stage__info${infoOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="stage__info-toggle"
          onClick={() => setInfoOpen((v) => !v)}
          aria-expanded={infoOpen}
        >
          <span className="stage__info-cat">{category.label}</span>
          <span className="stage__info-title">{meta.title}</span>
          <span className="stage__info-chevron">{infoOpen ? '▾' : '▸'}</span>
        </button>

        {infoOpen && (
          <div className="stage__info-body">
            <p className="stage__info-desc">{meta.description}</p>

            {meta.tags?.length > 0 && (
              <div className="stage__info-tags">
                {meta.tags.map((t) => (
                  <span key={t} className="tag">{t}</span>
                ))}
              </div>
            )}

            {meta.source && (
              <div className="stage__info-meta">
                Inspired by{' '}
                {meta.sourceUrl ? (
                  <a href={meta.sourceUrl} target="_blank" rel="noreferrer">
                    {meta.source}
                  </a>
                ) : (
                  meta.source
                )}
              </div>
            )}

            {meta.note && (
              <div className="stage__info-meta">
                Note: <code>{meta.note}</code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
