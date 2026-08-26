# Depth Parallax

**1 枚の絵と深度マップだけ**で奥行きを作る。3D モデルもジオメトリも使わず、
板ポリ 1 枚のフラグメントシェーダーで完結する。

## 仕組み

### 1. 視差レイマーチ

視点から各ピクセルへレイを飛ばし、少しずつ進めながら
「その xy 位置の深度」と「レイの現在 z」を比べる。深度サーフェスをくぐった位置で止め、
**止まった uv で本画像を引く**。手前のものほど大きくずれるので視差が生まれる。

```glsl
vec3 rayPos = vec3(uv, 0.0);
vec3 rayStep = vec3(shift, 1.0) / float(STEPS);

for (int i = 0; i < STEPS; i++) {
  float d = (1.0 - sampleDepth(rayPos.xy)) * uZMultiplier;
  if (d < rayPos.z) break;
  rayPos += rayStep;
}
```

`shift` にカーソル位置を入れているので、動かすと視点が動いたように見える。

### 2. DOF

止まった点の深度と焦点面の差から錯乱円を決め、黄金角でディスク状にサンプルして平均する。
`Rack Focus` variant では焦点面を手前に置いてあり、奥がぼける。

### 3. 深度フラッシュライト

カーソルからの距離を **画面上の距離と深度差の両方**で減衰させる。

```glsl
float planar = length(d) / uLightRadius;
float depthGap = abs(depth - uLightDepth) / 0.35;
float falloff = exp(-planar * planar) * exp(-depthGap * depthGap);
```

深度差でも減衰するので、**同じ画面位置でも手前の木だけが照らされ、奥の山は暗いまま残る**。
これが 2D のスポットライトとの違い。

### 4. 角丸マスク

`sdRoundedBox` で縁を丸め、カードとして成立させる。

## variant

| id | 内容 |
| --- | --- |
| `parallax` | 視差のみ。レイヤーのずれが分かりやすい |
| `dof` | 焦点面を手前に置いたラックフォーカス |
| `flashlight` | 深度フラッシュライト。霧を濃くして光の届く範囲を強調 |
| `depth` | 深度マップそのものを表示 |

## 絵と深度マップの作り方

本来は写真 + Depth-Anything などで推定した深度マップを使う。ここでは外部アセットを
増やさないため、**同じ描画コードを色モードと深度モードで 2 回走らせて**いる
（[`scene.js`](scene.js)）。

```js
const c = (color, depth) => (mode === 'color' ? color : depthColor(depth))
ridge(ctx, rand, H * 0.6, 120, 12, c('#2a2f52', 0.16))   // 奥の山
conifer(ctx, x, H * 1.02, h, c('#07160f', 0.88))          // 手前の森
```

レイヤーごとに深度が既知なので、色と深度が必ず一致する。乱数はシード固定で、
2 回の描画が同じ形になるようにしてある。

## 実装メモ

- **レイマーチのステップ数と DOF のサンプル数はシェーダーへ定数として埋め込む**
  （GLSL のループ長を実行時に変えられない）。leva で変えるとマテリアルを作り直す
- **`zMultiplier` を上げすぎると縁が破綻する。** レイが背景を舐めて、手前のものの
  輪郭に奥の絵が引き伸ばされて貼り付く
- 視差の追従は `1 - exp(-k * 60 * dt)` でフレームレート非依存にしている
- カメラは perspective。orthographic だと R3F の単位がピクセルになり、
  板ポリのスケール計算が噛み合わない

## 出典

- [Lusion.co](https://lusion.co/) — Selected Work のサムネイル（`home.webp` + `home_depth.webp`）
- ai-quest — レイヤー分解 + 深度フラッシュライト

（Obsidian: `深度マップ視差（depthをレイマーチして2.5D化＋DOF）` /
`レイヤー分解＋深度フラッシュライトの2.5Dシーン`）
