# Glass Refraction

`MeshPhysicalMaterial` の transmission を `onBeforeCompile` で拡張し、
プリズム分散と曇りガラスを足したもの。igloo.inc の氷マテリアルの移植。

## 仕組み

three は `transmission > 0` のマテリアルを解くために、**シーンをもう一度別の
RenderTarget へ描いて `transmissionSamplerMap` として渡してくる**。この背景サンプルの
引き方を差し替えるのがこの example の中身。

```
#include <transmission_pars_fragment>  → bicubic サンプラと屈折関数に差し替え
#include <transmission_fragment>       → RGB を別 IOR で多重サンプルする本体に差し替え
```

### プリズム分散

**R / G / B をそれぞれ違う IOR で屈折させる。**

```glsl
transmitted.r += refractThrough(..., material.ior, ...).r;
transmitted.g += refractThrough(..., material.ior * (1.0 + uChromaticAberration * k), ...).g;
transmitted.b += refractThrough(..., material.ior * (1.0 + 2.0 * uChromaticAberration * k), ...).b;
```

背景 UV を RGB で少しずらすだけの疑似分散と違い、**屈折そのものが波長ごとに変わる**ので、
形状の面ごとに虹が出る。`Diamond Dispersion` variant が分かりやすい。

### 曇りガラス

サンプルごとに厚みをずらし、粗さに応じて法線も散らして平均する。
`samples` を増やすほど滑らかになるが、その回数だけ背景を引き直すので重くなる。

### Mipped Bicubic

粗いガラスは高い mip を引くが、bilinear のままだと縞が出る。
N8 の bicubic フィルタ（shadertoy `Dl2SDW`）で引くことでバンディングを消す。

```glsl
float lod = log2(textureSize(transmissionSamplerMap, 0).x) * iorToRoughness(roughness, ior);
vec4 transmittedLight = textureBicubicLod(transmissionSamplerMap, coords, lod);
```

## カーソルで霜が溶ける（MouseFrost）

この example の主題は transmission そのものではなく、**それと組み合わせた表面演出**。

カーソルがメッシュ上を通った UV に波を注入し、512×512 のバッファで伝播させる。
伝播は拡散（平均）ではなく **4 近傍の最大値**を取るのが要点で、
平均だとぼやけて消えるところが、max だと輪郭を保ったまま外へ広がる。

```glsl
float nextVal = max(max(l, r), max(t, b));
nextVal += splat;          // カーソルの移動線分に沿って注入
nextVal = min(nextVal * uDamping, 1.0);
float rim = nextVal - texture2D(tBuffer, uv).r;   // 波の先端
```

出力の R が「撫でた跡」、G が「波の先端」。これをガラスに次のように効かせる。

| 効果 | 実装 |
| --- | --- |
| 撫でた跡だけ霜が溶ける | `roughnessFactor *= 1 - melt * 0.97` |
| そこだけ氷が薄くなる | `thickness *= 1 - melt * 0.92` → 屈折が浅くなり背景がそのまま見える |
| 表面の白濁が消える | frost の混合率に `(1 - melt)` を掛ける |
| 波の先端が光る | `totalEmissiveRadiance += frostColor * rim` |

**roughness の変更は `roughnessmap_fragment` の段階で行う必要がある。**
曇りの主因は specular（環境反射）で、それは three のライティング計算で決まる。
`transmission_fragment` はその後なので、そこで `material.roughness` を変えても
屈折にしか効かず、見た目がほとんど変わらない。

## variant

| id | 内容 |
| --- | --- |
| `ice` | igloo の氷。frost 色 `#83a1c5`、分散は控えめ |
| `crystal` | 透明度が高くねじれた形。分散を上げて虹を出す |
| `frosted` | 粗さを上げたすりガラス。サンプル数を増やして滑らかに |
| `diamond` | IOR 2.2、分散最大。面ごとに強い虹が出る |

## 元実装との差分

- **ブルーノイズを手続きノイズに置き換えた。** 元は `LDR_RGB1_0.png` を引いている。
  ここでは 2 種類を使い分けている: 厚みのばらつきは高周波の hash（サンプル数ぶん
  平均されるのでディザとして働く）、法線の散らしは低周波の value noise
  （高周波だとピクセル単位でざらつく）。
- **Beer-Lambert 吸収を実装した。** 元実装の `volumeAttenuation` は `vec3(1.0)` を
  返すだけで無効化されている。ここでは厚みぶん色が抜けるようにしたが、
  効かせすぎると背景の色が全部沈むので `attenuationDistance` は長めが既定。
- **環境マップは `Lightformer` で組んでいる。** 元は EXR を Worker でデコードして
  IBL にする。外部アセットを増やさないため。透過に映り込みが無いとのっぺりするので、
  環境そのものは必須。
- **splat の閾値と減衰を下げた。** 元実装は cube の面ごとの小さな UV 空間が前提で、
  `smoothstep(0.1, 1.0, velocity)` の下限も damping 0.985 もその想定。球の UV 全体だと
  カーソルの移動量が閾値に届かず、届いた場合は逆に全面へ広がりきってしまう。

## 実装メモ

- **`transmission_pars_fragment` を丸ごと置換すると、three が入れている
  `transmissionSamplerMap` の uniform 宣言まで消える。** 自分で宣言し直さないと
  コンパイルが通らず、マテリアルが何も描画されない
- **`samples` はシェーダーへ定数として埋め込む**ので、変更時はマテリアルを作り直す。
  `customProgramCacheKey` を返さないと three がプログラムを使い回してしまう
- **背景に色と構造が必要。** 屈折光線は大きく曲がるので、背後が暗いと
  透けても何も見えない。この example では全周を色面で囲っている
- transmission は不透明描画のあとにシーンをもう一度描くので重い。実用では
  画面内のガラスを 1〜2 個に絞るのが現実的
- **`scripts/screenshot.mjs`（SwiftShader）では frost テクスチャの読み出しが 0 になる。**
  実機では正常に動く。ヘッドレスで見えないことを不具合と判断しないこと

## 出典

[igloo.inc](https://www.igloo.inc/) — 氷マテリアル
（Obsidian: `カスタム透過ガラス（transmissionサンプラ＋色収差で分散）`）
