# Vertex Animation Texture

破砕アニメを**全フレームぶん事前計算して Float テクスチャに焼き**、
頂点シェーダーが読んで再生する。実行時の CPU は uniform を 3 つ書き換えるだけ。

## なぜ焼くのか

数百の破片を毎フレーム CPU で積分して行列を更新すると、その計算量と
`Object3D` の更新コストがそのままフレーム時間に乗る。焼いてしまえば

- 実行時の計算は「テクスチャを 2 回引いて補間する」だけ
- 全破片が **1 ドロー**で描ける
- 何個並べても、再生位置をずらすだけで別々に動かせる

元実装（Lusion）はこれでスケルタルアニメ 53 ボーンと破砕 946 破片を動かしている。

## 焼き方（[`bake.js`](bake.js)）

破片ごとに初速・角速度・重力を決めて、フレーム数ぶん積分する。
結果を 2 枚の `DataTexture` に詰める。

| テクスチャ | 内容 | サイズ |
| --- | --- | --- |
| position | `rgb` = 変位 | 幅 = 破片数, 高さ = フレーム数 |
| orient | `rgba` = クォータニオン | 同上 |

```js
const idx = (frame * count + piece) * 4
posData[idx + 0] = pos.x
...
oriData[idx + 3] = quat.w
```

最初の数フレームは動かさずに焼く。いきなり散らすと「何が砕けたのか」が分からない。

## 再生（[`glsl/vat.js`](glsl/vat.js)）

```glsl
vec2 uvFrom = texelUv(aPiece, uFrameFrom);
vec2 uvTo   = texelUv(aPiece, uFrameTo);

vec3 offset = mix(texture2D(tPosition, uvFrom).xyz,
                  texture2D(tPosition, uvTo).xyz, uFrameRatio);
vec4 orient = normalize(mix(texture2D(tOrient, uvFrom),
                            texture2D(tOrient, uvTo), uFrameRatio));

vec3 world = qrotate(orient, position * aSize) + aOrigin + offset;
```

クォータニオンは厳密には slerp だが、隣接フレームなら線形 `mix` + 正規化で十分なめらか。

## variant

| id | 内容 |
| --- | --- |
| `explode` | 中心から放射状に吹き飛ぶ |
| `collapse` | その場で崩れ落ちる |
| `swirl` | Y 軸まわりに巻き上がる |
| `dense` | 1320 破片。数を増やしても 1 ドローのまま |

`cols` / `rows` / `frames` を変えると焼き直しが走る。実行時のコストではなく
**ロード時のコスト**がそこに乗るのが VAT の性質。

## 実装メモ

- **Float テクスチャのフィルタは `NearestFilter`。** Linear にするとフレーム境界が
  勝手に混ざる。補間はシェーダー側の `mix` で明示的にやる
- **`boundingSphere` を手で与える。** 位置が頂点シェーダー由来なので three は
  正しい境界を計算できず、放っておくとカリングで消える
- 焼くフレーム数と実行時のフレームレートは無関係。再生ヘッドは秒で持ち、
  `playhead * fps` からフレーム番号を出す

## 出典

[Lusion.co](https://lusion.co/) — astronaut_animations.buf / broken_glass_animation.buf
（Obsidian: `テクスチャベース頂点アニメ（スケルタル・破砕をFloatテクスチャに焼く）`）
