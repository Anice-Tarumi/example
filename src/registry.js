import { lazy } from 'react'

// 各 example の meta.json を eager import（サイドバー一覧用）
const metas = import.meta.glob('./examples/*/meta.json', {
  eager: true,
  import: 'default',
})

// 各 example の index.jsx を lazy import（コード分割）
const modules = import.meta.glob('./examples/*/index.jsx')

/*
 * サムネイル。`scripts/bake-thumbs.mjs` が焼いたものを拾う。
 *
 * **有るものだけ**を貼る。存在チェックを走らせずに済むよう、glob の結果を
 * そのまま引き当てる。無ければ絵文字に落ちる。
 */
const thumbs = import.meta.glob('./assets/thumbs/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** src/examples/<slug>/ を走査して example 一覧を作る。`_` 始まりは除外。 */
export const examples = Object.entries(metas)
  .map(([path, meta]) => {
    const match = path.match(/examples\/([^/]+)\//)
    if (!match) return null
    const slug = match[1]
    if (slug.startsWith('_')) return null
    const modPath = `./examples/${slug}/index.jsx`
    if (!modules[modPath]) return null
    return {
      slug,
      thumb: thumbs[`./assets/thumbs/${slug}.jpg`] || null,
      category: meta.category || null,
      tags: meta.tags || [],
      variants: meta.variants || [],
      ...meta,
      Component: lazy(modules[modPath]),
    }
  })
  .filter(Boolean)
  .sort((a, b) => (a.title || '').localeCompare(b.title || ''))

/** 全 example に含まれる tag のユニーク一覧（出現数の多い順） */
export const allTags = (() => {
  const counts = new Map()
  for (const ex of examples) {
    for (const t of ex.tags) counts.set(t, (counts.get(t) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }))
})()
