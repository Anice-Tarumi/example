# Toon Outline

MRT で G-Buffer を書き出し、十字 5 タップで輪郭を検出する線画ルック。
messenger.abeto.co の低ポリ惑星ワールドの手法を、同じくタイトル画面の
小惑星に寄せたシーンで再現している。

## G-Buffer の詰め方

MRT 2 枚に、輪郭検出に必要な情報を全部詰める。

| | 内容 |
| --- | --- |
| `textures[0]` | `rgb` = 陰影付きの色 / **`a` = 面 ID** |
| `textures[1]` | `r` = 深度 / `gb` = spheremap 法線 / `a` = 線を出すマスク |

**面 ID を 1 枚目のアルファに潜ませる**のが要点。専用バッファを増やさずに済むうえ、
法線を spheremap で 2 成分に潰しておけば深度とマスクと合わせて `vec4` 1 枚に収まる。

## なぜ ID が要るか

輪郭は 3 つの変化量を足して出す。

| 指標 | 拾えるもの |
| --- | --- |
| 深度差 | 手前と奥の境界 |
| 法線差 | 折れ目。同じ深度でも面が曲がっているところ |
| **ID 差** | **深度も法線も連続な、素材の切り替わり** |

この example の水辺と岩肌は惑星の球面に貼り付いていて、地面と深度も法線もほぼ連続。
深度 + 法線の Sobel だけでは線が出ないが、ID が違うので縁が描かれる。
服の継ぎ目や地形の草と岩の境も同じ理屈。

## 検出

```glsl
// 中心との差を x = 右 - 左, y = 上 - 下 の形で取る
vec2 idVar     = vec2((idR - idC) - (idL - idC), (idU - idC) - (idD - idC));
vec2 depthVar  = ...;
vec2 normalVar = vec2(distance(nR, nC) - distance(nL, nC), ...);

// 視線にほぼ平行な面は深度が急変するので、しきい値を上げて誤検出を防ぐ
float depthLimit = uDepthRange.z + (1.0 - nC.z);

float outline = clamp(idContribution + normalContribution + depthContribution, 0.0, 1.0);
outline *= centerInfo.a;   // マスクが 0 のところには引かない
```

`sketch` を上げると、書き出し側でノイズを使ってマスクを間引く。
手描きのかすれになる。

## variant

| id | 内容 |
| --- | --- |
| `ink` | 暗赤茶（`#ae2118`）の線。線を黒にしないと絵本らしくなる |
| `bold` | 太い黒線、トゥーン 2 段 |
| `sketch` | ノイズでマスクを間引いたかすれ線 |
| `buffers` | 面 ID を色相に散らして可視化 |

`mode` で深度バッファ・法線バッファも個別に見られる。

## シーン

球面へ要素を撒くのにフィボナッチ球を使い、各要素は法線方向を上にした姿勢で置く。

```js
const dir = fibonacciPoint(i, total)           // 球面上に偏りなく撒く
const q = new THREE.Quaternion()
  .setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)   // 法線を上に向ける
position = dir.clone().multiplyScalar(R + height * 0.5)
```

## 実装メモ

- **`ShaderMaterial` + GLSL3 では動かない。`RawShaderMaterial` を使う。**
  three は GLSL3 の `ShaderMaterial` に対して `layout(location = 0) out vec4 pc_fragColor`
  を prefix で挿入する。そこへ自前の `layout(location = 1)` を足すと、
  **エラーも警告も出ないまま何も描画されなくなる**。両方を自分で宣言できる
  `RawShaderMaterial` にすれば解決する（`position` などの宣言も自分で書くことになる）
- **深度は `gl_Position.zw` を varying で渡してから割る。** フラグメントで
  `gl_FragCoord.z` を使うより精度が保てる
- leva の落とし穴を 2 つ踏んだ。どちらもアプリ全体がクラッシュする:
  - folder のキーに**空白**を入れない
  - `setParams` に **leva 未登録のキー**を渡さない
    （`Cannot read properties of undefined (reading 'path')` になる）

## 出典

[messenger.abeto.co](https://messenger.abeto.co/)
（Obsidian: `MRTバッファによるトゥーン輪郭線（ID・深度・法線の十字エッジ検出）`）

## 2 つの被写体で ID の役割を見せる

`subject` で切り替えられる。

**character** — Tripo 生成の GLB。**1 メッシュ 1 マテリアルなので surfaceId は 1 つしか振れない。**
内側の線（ヘルメットの縁、腕、ブーツ）は**深度と法線のエッジ**で出ている。
ID が効いているのは、キャラと地面・小物との境界だけ。

**island** — 同一球面上に「草」「土」「水辺」を重ねてある。
**深度も法線もほぼ連続**なので、Sobel だけでは線が引けない。
ここに線が出るのは ID があるから。

つまり 2 つ並べると「ID が無くても出る線」と「ID が無いと出ない線」が分かる。
どちらか一方だけだと、MRT に ID を積む理由が伝わらない。

## モデル側の要件

- **UV は不要。** G-Buffer マテリアルは `position` と `normal` しか読まない。
- **マテリアルが分かれていると内側にも ID 線が入る。** Tripo は 1 マテリアルで出すので、
  そこまで欲しければ Blender でパーツごとに分ける。無くても深度・法線の線で成立する。
- スケールと原点は当てにせず、bbox から接地とスケールを毎回求める。
