# Scene Transitions

2つの3DシーンをそれぞれFBOに焼き、全画面クアッド1枚で合成して切り替えるトランジション集。
4種類の演出を同じキャンバス内で切り替えられる。

## 仕組み

```
SceneA ──render──▶ targetA ─┐
                            ├─▶ 全画面クアッド（合成シェーダー）─▶ 画面
SceneB ──render──▶ targetB ─┘
```

- `createPortal(<SceneA />, sceneA)` で R3F のツリー外に2つの `THREE.Scene` を持つ
- `useFrame(fn, 1)` で priority を上げ、R3F の自動レンダリングを止めて描画順を自前で制御
- 合成クアッドは `gl_Position = vec4(position, 1.0)`（射影変換なし）でカメラ非依存の全画面
- `uProgress`（0→1）が遷移の進行度。`auto` ONで往復し、端で `HOLD` 秒止まる

## variant

| id | 元ネタ | 内容 |
| --- | --- | --- |
| `noise-wipe` | ai-quest (Lusion) | fbmノイズで揺らした境界が横に走って拭き取る。境界を `sin(mix*PI)` でフラッシュ |
| `curtain` | bilal.show | 左右2枚の幕が閉じ、閉じきった裏でシーンを差し替えて開く |
| `fade` | gameboy-tawny | 単色オーバーレイでフェードアウト → 差し替え → フェードイン |
| `circle` | — | 円形ワイプ。ノイズで縁を崩せる |

## パラメータ

- `mode` — variant と独立して演出だけ差し替えられる（プリセット値 × 別演出の組み合わせ検証用）
- `edge` — 境界のぼかし幅（`smoothstep` の幅）
- `noiseScale` / `noiseAmount` — 境界を歪ませるfbmのスケールと振幅
- `flash` — 境界の発光量
- `zoom` — 遷移中に次シーンを拡大する量（奥行き感）
- `overlayColor` — カーテン / フェードの色

## 実装メモ

- 進行度は境界位置に `-edge-noiseAmount 〜 1+edge+noiseAmount` の範囲でマップする。
  ノイズのはみ出し分だけ広げないと端が拭き切れずに残る。
- ノイズを `.x` と `.y` で別方向にずらした2枚の境界を mix すると、単一マスクより自然になる。
- 元実装（ai-quest）はノイズを webp テクスチャで持つが、ここでは依存を増やさず
  GLSL 内の value noise + fbm で代替している。

## 出典

- [ai-quest (Lusion)](https://ai-quest.lusion.co/) — ノイズマスクによる画面トランジション
- [bilal.show](https://bilal.show/) — 劇場カーテンのDOMトランジション
- [gameboy-tawny](https://gameboy-tawny.vercel.app/) — 全画面オーバーレイクアッドによるフェード
