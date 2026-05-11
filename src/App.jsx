import { Suspense, lazy } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import ExampleLayout from './shared/ExampleLayout'

// 各 example の meta.json を eager import（ギャラリー一覧用）
const metas = import.meta.glob('./examples/*/meta.json', {
  eager: true,
  import: 'default',
})

// 各 example の index.jsx を lazy import（コード分割）
const modules = import.meta.glob('./examples/*/index.jsx')

export const examples = Object.entries(metas)
  .map(([path, meta]) => {
    const match = path.match(/examples\/([^/]+)\//)
    if (!match) return null
    const slug = match[1]
    if (slug.startsWith('_')) return null // _template 等は除外
    const modPath = `./examples/${slug}/index.jsx`
    if (!modules[modPath]) return null
    return {
      slug,
      ...meta,
      Component: lazy(modules[modPath]),
    }
  })
  .filter(Boolean)
  .sort((a, b) => (a.title || '').localeCompare(b.title || ''))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home examples={examples} />} />
      {examples.map((ex) => (
        <Route
          key={ex.slug}
          path={`/examples/${ex.slug}`}
          element={
            <ExampleLayout meta={ex}>
              <Suspense fallback={<div className="loading">Loading…</div>}>
                <ex.Component />
              </Suspense>
            </ExampleLayout>
          }
        />
      ))}
      <Route
        path="*"
        element={
          <div style={{ padding: '4rem', color: '#fff' }}>
            <h1>404</h1>
            <Link to="/" style={{ color: '#7af' }}>← Back to Gallery</Link>
          </div>
        }
      />
    </Routes>
  )
}
