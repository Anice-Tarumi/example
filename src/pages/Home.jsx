import { Link } from 'react-router-dom'
import { groupByCategory } from '../categories'

export default function Home({ examples }) {
  const groups = groupByCategory(examples)

  return (
    <div className="home">
      <header className="home__header">
        <h1 className="home__title">Experiments</h1>
        <p className="home__subtitle">
          ブラウザで「どこまでできるか」を 1 件ずつ実装して確かめた記録。
          左のリストか下のカードから開くと、その場で触れる。
          パラメータは画面のパネルで変えられる。
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
                  to={`/experiments/${ex.slug}`}
                  className="card"
                >
                  <div className="card__thumb">
                    {ex.thumbUrl
                      ? (
                        /* 画面外のぶんは読まない。34 枚を一度に取りにいかせない */
                        <img src={ex.thumbUrl} alt="" loading="lazy" decoding="async" />
                      )
                      : (ex.emoji || '✨')}
                  </div>
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
