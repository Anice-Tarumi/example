// 機能軸カテゴリ。Obsidian Vault「Webテクニック/」の分類を
// 「体験できる単位」で再編したもの。meta.json の category がこの id を指す。
export const CATEGORIES = [
  { id: 'transitions', label: 'Transitions', desc: 'シーン・画面遷移' },
  { id: 'interaction', label: 'Interaction', desc: 'カーソル・ホバー・入力' },
  { id: 'scroll', label: 'Scroll', desc: 'スクロール表現' },
  { id: 'particles', label: 'Particles & VFX', desc: 'パーティクル・流体' },
  { id: 'materials', label: 'Materials & Shaders', desc: 'マテリアル・シェーダー' },
  { id: 'postprocess', label: 'Post Processing', desc: 'ポストエフェクト' },
  { id: 'geometry', label: 'Geometry', desc: 'ジオメトリ・3Dモデル' },
  { id: 'lighting', label: 'Lighting & Env', desc: 'ライティング・環境' },
  { id: 'typography', label: 'Typography', desc: 'テキスト演出' },
  { id: 'physics', label: 'Physics', desc: '物理' },
  { id: 'audio', label: 'Audio', desc: '音・空間オーディオ' },
  { id: 'dom-webgl', label: 'DOM × WebGL', desc: 'DOM 連携・2.5D' },
  { id: 'performance', label: 'Performance', desc: '最適化・圧縮' },
]

export const UNCATEGORIZED = { id: '_uncategorized', label: 'Uncategorized', desc: '' }

const byId = new Map(CATEGORIES.map((c) => [c.id, c]))

export function getCategory(id) {
  return byId.get(id) || UNCATEGORIZED
}

/** examples を CATEGORIES の順に [{ category, items }] へグループ化する（空カテゴリは除外） */
export function groupByCategory(examples) {
  const buckets = new Map()
  for (const ex of examples) {
    const cat = getCategory(ex.category)
    if (!buckets.has(cat.id)) buckets.set(cat.id, [])
    buckets.get(cat.id).push(ex)
  }
  const ordered = [...CATEGORIES, UNCATEGORIZED]
    .filter((c) => buckets.has(c.id))
    .map((c) => ({ category: c, items: buckets.get(c.id) }))
  return ordered
}
