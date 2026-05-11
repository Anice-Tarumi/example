# Example Template

新しい example を追加するときは、このフォルダを `slug-name` でコピーして以下を編集してください:

```bash
cp -r src/examples/_template src/examples/your-effect-name
```

## 編集する 3 つ

1. **meta.json** — タイトル・説明・タグ・出典
2. **index.jsx** — エフェクト本体（default export してください）
3. **README.md** — このファイル（funcCopy の出力 MD を流用すると楽）

## 反映

`npm run dev` 中なら HMR で即反映。ホーム (/) に自動で表示されます。

## 命名規則

- フォルダ名 = URL slug（小文字＋ハイフン）
- `_template` のようにアンダースコア始まりは無視されるので、雛形保管用に使えます
