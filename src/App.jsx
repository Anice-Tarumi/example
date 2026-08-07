import { Suspense } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { examples } from './registry'
import Shell from './shared/Shell'
import ExampleLayout from './shared/ExampleLayout'
import Home from './pages/Home'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
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
            <div className="notfound">
              <h1>404</h1>
              <Link to="/">← Back to Gallery</Link>
            </div>
          }
        />
      </Route>
    </Routes>
  )
}
