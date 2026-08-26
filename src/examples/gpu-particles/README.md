# Volume Particles

GPGPU パーティクルを SDF ボリュームの表面へ吸着させる。igloo.inc の
`ContainerParticles`（150k パーティクルが VDB のボリューム形状を作る）の移植。

## 仕組み

```
tOriginal (初期位置) ─┐
tVolume (3D SDF) ─────┤
                      ▼
        [1] velocity パス ─ ping-pong ─▶ 速度テクスチャ (xyz + 速度の大きさ)
                      │
                      ▼
        [2] position パス ─ ping-pong ─▶ 位置テクスチャ (xyz + 陰影)
                      │
                      ▼
        THREE.Points ── 頂点シェーダーが texuv から自分の位置を引く
```

### ボリュームへの吸着

3D テクスチャに **RGB = 表面への勾配、A = 符号付き距離**を持たせ、

```glsl
float signForce = mix(0.0, -0.3, sign(dist) + 1.0);
vel += grad * force * signForce;
```

で符号によって内外を判定し、どちら側からでも表面へ引き寄せる。
元実装は VDB を焼いた 3D テクスチャを使うが、ここでは同じ形式を
手続き SDF から生成している（[`volume.js`](volume.js)）。中身の形式が同じなので
仕組みはそのまま動く。

### 力の合成

| 要素 | 内容 |
| --- | --- |
| bitangent noise | 2 つの勾配場の外積。divergence が 0 なので湧き出しが起きない |
| 表面吸着 | SDF 勾配。符号で内外を判定 |
| 元位置への復帰 | 形が崩れきらないように引き戻す |
| pointer | ガウス減衰の力場。元実装ではここに流体場の速度が入る |
| 摩擦 | `exp2(log2(t) * dt)` でフレームレート非依存 |

### 陰影

位置テクスチャの `w` に **wrap diffuse**（GPU Gems の subsurface 近似）を焼いておき、
描画側はそれを読むだけにしている。速度の大きさは速度テクスチャの `w` に均して入れ、
速い粒子を発光させる。点は `gl_PointCoord` から法線を近似して球に見せる。

## variant

| id | 内容 |
| --- | --- |
| `volume` | 球の表面へ吸着。元実装の力の値をそのまま使う |
| `twist` | ねじれたトーラス。吸着を強めて表面を保つ |
| `lattice` | 3 軸の十字。細い形なので吸着をさらに強く |
| `drift` | 吸着を切って漂わせる |

`volume`（形状）は variant と独立に切り替えられる。運動パラメータは
選択中の variant のままなので、細い形を弱い吸着で動かすと形を保てない。

## 元実装との差分

- **MRT をやめて 2 パスに分けた。** 元実装は `layout(location = 1)` で位置と速度を
  1 パスで書き出すが、Float の MRT は環境によって通らない（実際、検証に使っている
  SwiftShader では描画が返ってこなくなった）。速度 → 位置の 2 パスに分けても
  計算内容は同じ。
- **VDB の代わりに手続き SDF を焼いている。** 元は `peachesbody_64` などの
  キャラクター形状。ここでは球・トーラス・箱・十字・ねじれトーラス。
- **流体結合をカーソルの力場に置き換えた。** 元実装はパーティクルをカメラ投影して
  画面空間の流体場をサンプルする。その流体ソルバ自体は
  [`fluid-solver`](../fluid-solver/) が持っているので、繋げば元の構成になる。
- **円柱クランプの範囲を広げた。** 元の `±0.35 / 0.275` は VDB が円柱容器に
  収まる前提の値で、任意の SDF を入れると形が切れる。

## 実装メモ

- **点のサイズは `uSize / length(viewPos)` で決まる。** 元実装の `uSize = 260` は
  カメラが 10 以上離れている前提の値で、そのまま近距離のカメラで使うと
  1 点が 150px になり、65k 点で 1.4G ピクセルに達して 1 フレームが返らなくなる
- **`geometry.boundingSphere` を手で与える。** 位置が頂点シェーダー由来だと
  three は境界を計算できない（`frustumCulled = false` も併用）
- パーティクル数は leva で 16k〜260k に変更できる

## 出典

[igloo.inc](https://www.igloo.inc/) — `ContainerParticles`
（Obsidian: `GPU流体ソルバ（Navier-Stokes splat→pressure→advection）` と同じサイト）
