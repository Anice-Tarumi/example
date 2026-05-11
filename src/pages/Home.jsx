import { Link } from 'react-router-dom'

export default function Home({ examples }) {
  return (
    <main className="gallery">
      <header className="gallery__header">
        <h1 className="gallery__title">Examples</h1>
        <p className="gallery__subtitle">
          Web で見かけた印象的なエフェクトの再現コレクション
        </p>
      </header>

      {examples.length === 0 ? (
        <div className="gallery__empty">
          <p>まだ example がありません。</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <code>src/examples/&lt;slug&gt;/</code> にフォルダを追加すると自動的にここに表示されます。
          </p>
        </div>
      ) : (
        <div className="gallery__grid">
          {examples.map((ex) => (
            <Link key={ex.slug} to={`/examples/${ex.slug}`} className="gallery__card">
              <div className="gallery__card-thumb">
                {ex.emoji || '✨'}
              </div>
              <div className="gallery__card-meta">
                <div className="gallery__card-title">{ex.title}</div>
                <div className="gallery__card-desc">{ex.description}</div>
                {ex.tags && (
                  <div className="gallery__card-tags">
                    {ex.tags.map((t) => (
                      <span key={t} className="gallery__card-tag">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
