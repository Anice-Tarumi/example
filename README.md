# showcase — Web Effects Showcase

Three.js / WebGL による表現のコレクション。three.js examples 風の、左固定リストから
シーンを切り替えるギャラリーサイト。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173/
npm run build    # 静的サイト出力
npm run preview  # 出力結果のプレビュー
npm run lint
```

## 設計方針

- **1 example = 1 機能。** バリエーションは別 example にせず、同じキャンバス内で
  variant / パラメータを切り替えて見せる（例: 画面トランジションの演出違い）。
- **分類は機能軸。** カテゴリは `src/categories.js` に定義。Obsidian Vault の
  `Webテクニック/` の分類を「体験できる単位」で再編したもの。
- **パラメータ UI は leva。** 各 example が `useControls` でパラメータを公開すると、
  画面右上のパネルに自動で出る。

## 新しい example を追加する

```bash
cp -r src/examples/_template src/examples/your-effect-name
```

その後 `meta.json` / `presets.js` / `index.jsx` / `README.md` を編集。
HMR で即反映され、サイドバーとホームに自動登録される。詳細は
[`src/examples/_template/README.md`](src/examples/_template/README.md)。

### meta.json

| キー | 用途 |
| --- | --- |
| `title` / `description` / `emoji` | 一覧・info パネル表示 |
| `category` | `src/categories.js` の id。サイドバーのグループになる |
| `tags` | サイドバーの絞り込みに使う |
| `variants` | `[{ id, label }]`。`presets.js` のキーと揃える |
| `source` / `sourceUrl` | 出典サイト |
| `note` | 元プロンプトや Obsidian ノート名などのメモ |

## ディレクトリ構造

```
showcase/
├── src/
│   ├── main.jsx
│   ├── App.jsx                  ← ルーティングのみ
│   ├── registry.js              ← examples の自動登録（import.meta.glob）
│   ├── categories.js            ← 機能軸カテゴリ定義
│   ├── pages/
│   │   └── Home.jsx             ← ウェルカム + カード一覧
│   ├── shared/
│   │   ├── Shell.jsx            ← サイドバー常時表示の外枠
│   │   ├── Sidebar.jsx          ← 検索・タグ絞り込み・カテゴリ別リスト
│   │   ├── ExampleLayout.jsx    ← キャンバス + leva パネル + info オーバーレイ
│   │   └── levaTheme.js
│   └── examples/
│       ├── _template/           ← 雛形（`_` 始まりは登録対象外）
│       └── <slug>/
│           ├── index.jsx
│           ├── presets.js
│           ├── shaders.js       ← 必要なら
│           ├── meta.json
│           └── README.md
└── ...
```

## lint について

`src/examples/**` では `react-hooks/immutability` / `refs` / `set-state-in-effect` を
無効化している（[eslint.config.js](eslint.config.js)）。react-three-fiber では
uniform や Object3D を `useFrame` 内で直接書き換えるのが公式パターンで、
React Compiler 系のルールとは両立しないため。
