import { Link } from 'react-router-dom'
import { groupByCategory } from '../categories'

export default function Home({ examples }) {
  const groups = groupByCategory(examples)

  return (
    <div className="home">
      <header className="home__header">
        <h1 className="home__title">Web Effects Showcase</h1>
        <p className="home__subtitle">
          Three.js / WebGL による表現のコレクション。左のリストから選ぶか、
          下のカードから飛んでください。各シーンは右上のパネルでパラメータを変えて試せます。
        </p>
      </header>

      {examples.length === 0 ? (
        <div className="home__empty">
          <p>まだ example がありません。</p>
          <p>
            <code>src/examples/&lt;slug&gt;/</code> にフォルダを追加すると自動で登録されます。
          </p>
        </div>
      ) : (
        groups.map(({ category, items }) => (
          <section key={category.id} className="home__section">
            <h2 className="home__section-title">
              {category.label}
              {category.desc && <span>{category.desc}</span>}
            </h2>
            <div className="home__grid">
              {items.map((ex) => (
                <Link
                  key={ex.slug}
                  to={`/examples/${ex.slug}`}
                  className="card"
                >
                  <div className="card__thumb">{ex.emoji || '✨'}</div>
                  <div className="card__meta">
                    <div className="card__title">
                      {ex.title}
                      {ex.variants?.length > 1 && (
                        <span className="card__badge">
                          {ex.variants.length} variants
                        </span>
                      )}
                    </div>
                    <div className="card__desc">{ex.description}</div>
                    {ex.tags?.length > 0 && (
                      <div className="card__tags">
                        {ex.tags.map((t) => (
                          <span key={t} className="tag">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
