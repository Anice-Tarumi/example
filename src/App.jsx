import { Suspense } from 'react'
import { Routes, Route, Link, Navigate, useParams } from 'react-router-dom'
import { examples } from './registry'
import Shell from './shared/Shell'
import ExampleLayout from './shared/ExampleLayout'
import Lab from './pages/Lab'
import Works from './pages/Works'
import Experiments from './pages/Home'

/**
 * 入口はラボのトップ。一覧はその下の 1 ページ。
 *
 * ラボのトップだけ `Shell`（サイドバー付き）の外に置く。サイドバーは 39 件を
 * 絞り込むための道具で、入口に出すと倉庫の入口に見える。
 */

/** 旧 URL の保護。`/examples/:slug` で配ったリンクを生かす */
function LegacyExample() {
  const { slug } = useParams()
  return <Navigate to={`/experiments/${slug}`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Lab />} />

      <Route element={<Shell />}>
        <Route path="/experiments" element={<Experiments examples={examples} />} />
        <Route path="/works" element={<Works />} />
        {examples.map((ex) => (
          <Route
            key={ex.slug}
            path={`/experiments/${ex.slug}`}
            element={
              <ExampleLayout key={ex.slug} meta={ex}>
                <Suspense fallback={<div className="loading">Loading…</div>}>
                  <ex.Component />
                </Suspense>
              </ExampleLayout>
            }
          />
        ))}
        <Route path="/examples" element={<Navigate to="/experiments" replace />} />
        <Route path="/examples/:slug" element={<LegacyExample />} />
        <Route
          path="*"
          element={
            <div className="notfound">
              <h1>404</h1>
              <Link to="/">← Back to Lab</Link>
            </div>
          }
        />
      </Route>
    </Routes>
  )
}
