# example — Web Effects Showcase

Three.js / WebGL を使ったエフェクトの再現コレクション。three.js examples 風のギャラリーサイト。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173/
npm run build    # 静的サイト出力
npm run preview  # 出力結果のプレビュー
```

## 新しい example を追加する

```bash
cp -r src/examples/_template src/examples/your-effect-name
```

その後、以下 3 つを編集:

- `meta.json` — タイトル・説明・タグ・出典
- `index.jsx` — エフェクト本体（default export）
- `README.md` — 解説（funcCopy の出力 MD を流用すると楽）

HMR で自動反映され、ホーム (`/`) のギャラリーにも自動で追加されます。

## ディレクトリ構造

```
showcase/
├── src/
│   ├── main.jsx
│   ├── App.jsx                  ← ルーター + 自動 example 登録
│   ├── pages/
│   │   └── Home.jsx             ← ギャラリー
│   ├── shared/
│   │   └── ExampleLayout.jsx    ← 各 example の共通レイアウト
│   └── examples/
│       ├── _template/           ← 雛形（無視される）
│       └── <slug>/              ← 各エフェクト
│           ├── index.jsx
│           ├── meta.json
│           └── README.md
├── public/
└── ...
```

## 出典

各 example の `meta.json` 内 `source` / `sourceUrl` 参照。
