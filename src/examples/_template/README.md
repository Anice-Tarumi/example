# Example Template

新しい example を追加するときは、このフォルダを `slug-name` でコピーして編集してください:

```bash
cp -r src/examples/_template src/examples/your-effect-name
```

## 粒度の考え方

1 example = **1 機能**。同じ機能のバリエーション（例: シーン遷移の演出違い）は
別 example にせず、**同じキャンバス内で variant / パラメータを切り替えて**見せます。

## 編集するファイル

| ファイル | 役割 |
| --- | --- |
| `meta.json` | タイトル・`category`・`tags`・`variants`・出典 |
| `presets.js` | variant ごとのパラメータ束 |
| `index.jsx` | エフェクト本体（default export） |
| `README.md` | 解説（funcCopy の出力 MD を流用すると楽） |

### meta.json

- `category` — `src/categories.js` の id から選ぶ（サイドバーのグループになる）
- `variants` — `presets.js` のキーと揃える。2 件以上でリストにバッジが出る
- `tags` — サイドバーの絞り込みに使われる
- `note` — 元プロンプトや Obsidian ノート名などのメモ

### index.jsx

`leva` の `useControls` でパラメータを公開すると、画面右上のパネルに出ます。
variant セレクトの値が変わったら `setParams(PRESETS[variant])` でパネルに反映します。

## 反映

`npm run dev` 中なら HMR で即反映。サイドバーとホームに自動で登録されます。

## 命名規則

- フォルダ名 = URL slug（小文字＋ハイフン）
- `_` 始まりのフォルダは登録対象外（雛形保管用）
