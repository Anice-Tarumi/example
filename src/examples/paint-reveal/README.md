# Paint Reveal

脱色された絵の上をカーソルでなぞると、絵の具が流れるように色が戻る。
ai-quest（Lusion）の ScreenPaint 系を移植したもの。

## 仕組み

```
pointer ──▶ [1] paint  ──▶ 速度場 (画面 1/4, ping-pong)
                 ▲              │
                 │              ├──▶ [2] blur (画面 1/8, 横→縦)
                 └──────────────┘         │
                                          ▼
                            [3] fill ──▶ 絵の具マスク (ping-pong)
                                          │
                            [4] render ◀──┘  絵 + マスク → 画面
```

### 1. paint — 速度場の蓄積

カーソルの「前フレーム位置 → 現在位置」を**線分**として扱い、`sdSegment` で距離を取ってブラシにする。
点で描くと速く動かしたときに軌跡が飛び飛びになる。

RGBA の意味は `xy` = 速度（0.5 が静止）、`z` = ブラシ重み、`w` = 補助重み。
毎フレーム `u_dissipations` で減衰し、ぼかした自分自身の速度場で移流するので流体的に広がる。
さらに curl noise を混ぜて直線的な軌跡を渦に崩す。

### 2. blur

速度場を 1/8 解像度に落として横→縦の分離 gaussian をかけ、次フレームの移流に使う。

### 3. fill — 速度場 → 絵の具マスク

```glsl
color.r += clamp(prevTex.r - u_fadeIntensity, 0.0, 1.0);  // 塗り跡を薄めながら保持
color.r += fillMask * u_paintIntensity;                    // 速度の大きい所に加筆
color.gb += vel * u_distortAmount;                         // UV ディスプレイス用
color.a += smoothstep(0.48, 1.0, data.z * 1.2) * 0.032;    // オーバーレイ
```

前フレームを薄めながら足し込むので、**塗った跡が残り、何度も通ったところほど濃くなる**。

### 4. render — マスクで彩度を戻す

```glsl
float paintMask = clamp(mask.r, 0.0, 1.0);
float overlayMask = mask.a;
finalColor = mix(gray, color, paintMask + overlayMask);
finalColor = mix(finalColor * 0.8, finalColor, paintMask);
finalColor = mix(finalColor, finalColor * 1.44 + vec3(1.0), overlayMask);
```

マスクは画面の 1/4 解像度なので `textureBicubic` で拡大する。bilinear だと塗り跡の縁が階段状になる。
`mask.gb` で絵自体の UV もずらしており、絵の具が下の絵を押しのけているように見える。

## variant

| id | 内容 |
| --- | --- |
| `paint` | ai-quest 本番の値そのまま |
| `flow` | curl を強め、絵の具が渦を巻いて広がる |
| `linger` | 減衰を弱くして塗り跡が長く残る。塗り絵のように使える |
| `mask` | マスクそのものを可視化。r=塗り跡, g=ディスプレイス, b=オーバーレイ |

## 元実装のパラメータ

`src/original/index.js` の properties から取得した本番値。`paint` variant はこれを使っている。

| 項目 | 値 |
| --- | --- |
| minRadius / maxRadius / radiusDistanceRange | 12 / 60 / 60 |
| pushStrength | 24 |
| velocityDissipation / weight1 / weight2 | 0.98 / 0.98 / 0.92 |
| accelerationDissipation | 0.8 |
| curlScale / curlStrength | 0.048 / 4 |
| fadeIntensity / paintIntensity | 0.04 / 1 |
| blur kernel | 4 |
| 速度場の解像度 | 画面の 1/4、ぼかしは 1/8 |

## 元実装との差分

- **下地の絵は Canvas2D で生成している**（[`artwork.js`](artwork.js)）。
  元は手描き調の WebP レイヤー画像。外部アセットを増やさないため。
  脱色/彩度復元の差が出るよう、色相の離れた面を並べた構成にしてある。
- **マスク UV を揺らすノイズを手続き生成にした。** 元は `transitionNoise.webp`。
- **カットシーンのトランジション部分は落とした。** 元の cutscene シェーダーは
  prev/curr 2 枚をノイズマスクで切り替える処理を含むが、それは
  [`scene-transitions`](../scene-transitions/) 側の題材なので分離した。
- **auto demo を足した。** `fadeIntensity` が本番値だと 0.6 秒ほどで塗り跡が消えるため、
  放置状態では何も起きていないように見える。カーソルが 1.2 秒止まったら
  リサージュ曲線で自動的に塗る。実際にカーソルを動かせば即座にそちらが優先される。

## 出典

[ai-quest (Lusion)](https://ai-quest.lusion.co/) — `ScreenPaint` / `ScreenPaintFill` /
cutscene fragment shader の `getMaskColor`
