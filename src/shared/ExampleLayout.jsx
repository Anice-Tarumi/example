import { Link } from 'react-router-dom'

export default function ExampleLayout({ meta, children }) {
  return (
    <div className="example">
      <div className="example__canvas">{children}</div>

      <aside className="example__sidebar">
        <Link to="/" className="example__back">← Back to Gallery</Link>

        <h1 className="example__title">{meta.title}</h1>
        <p className="example__desc">{meta.description}</p>

        {meta.tags && (
          <div className="example__tags">
            {meta.tags.map((t) => (
              <span key={t} className="gallery__card-tag">{t}</span>
            ))}
          </div>
        )}

        {meta.source && (
          <div className="example__source">
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

        {meta.originalPrompt && (
          <div className="example__source">
            元 prompt: <code>{meta.originalPrompt}</code>
          </div>
        )}
      </aside>
    </div>
  )
}
