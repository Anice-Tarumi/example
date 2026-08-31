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

## Ice Cut（igloo 方式）

`igloo.inc` のシーン遷移を再現したもの。既定の variant。

キャッシュした実コードから起こしている。単純なワイプと決定的に違うのは、
**同じ切り取り線から margin 違いで 3 本の縁を取り出している**こと。

```glsl
float axis = vUv.y + inclination * abs(slope);

float cutBlur  = falloff(axis, 0.0, 1.0, 2.0, incProgress);  // 柔らかい縁 → 色収差の量
float cutDispA = falloff(axis, 0.0, 1.0, 0.9, incProgress);  // 中くらい  → 押しのけ量
float cutDiag  = falloff(axis, 0.0, 1.0, 0.2, incProgress);  // 硬い縁    → 実際のマスク
```

`falloff(x, start, end, margin, progress)` は「しきい値の帯を進行度で動かす」関数で、
margin を変えると同じ線から**違う速さで走る縁**が取り出せる。

結果、切り口の手前が先にざわつき（色収差）、次に画が押しのけられ、最後に割れる。
**1 本のマスクだけで切ると、どれだけ凝った形でも「切り替わっただけ」に見える。**
ここが安っぽさとの分かれ目。

### 他に効いている要素

- **切り口の形はノイズテクスチャで決める。** Worley の `F2 - F1` が割れ目状になる。
  マスクは `falloff(scrollTex.r, ...)` で、線ではなく**面の割れ**として進む。
- **切り取り線の傾きを低周波ノイズで揺らす。** 直線だと定規で切ったように見える。
- **前後のシーンを逆方向へ流す。** 出ていく側は下へ、入ってくる側は上から。
  `power2In` を掛けているので、動き出しが遅く、終わりで加速する。
- **色収差は 5 サンプルの樽型歪み。** 画面端では弱める（四隅で破綻するため）。
- **交互勾配ノイズで色収差のサンプル位置をずらす。** 継ぎ目のバンディングが消える。
  igloo はブルーノイズのテクスチャを読んでいるが、ここは in-shader で代用している。

### 3 チャンネルを使い分ける

切り口テクスチャは 1 枚だが、役割ごとにチャンネルを分けてある。

| ch | 内容 | 用途 |
| --- | --- | --- |
| R | Worley の割れ目 | 切り口の形 |
| G | 中周波ノイズ | 押しのけ量 |
| B | 低周波ノイズ | 切り取り線の傾きの揺らぎ |

1 枚のノイズを使い回すと、割れ目・押しのけ・傾きが全部同じ形になって平坦に見える。
**周波数を分けるのが肝。**
