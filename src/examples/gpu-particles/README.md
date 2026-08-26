# GPU Particles

6 万個以上のパーティクルの位置を Float テクスチャに持ち、ping-pong FBO で更新する GPGPU 方式。
CPU は一切位置を触らない。

## 仕組み

```
tOriginal (DataTexture: 目標形状)
        │
        ▼
   [sim] ─ ping-pong ─▶ 位置テクスチャ (RGB = xyz, FloatType)
                              │
                              ▼
   InstancedMesh ── 頂点シェーダーで aFboUv から自分の位置を引く
```

- **位置をテクスチャに持つ**のが GPGPU の核。描画は `InstancedBufferGeometry` に
  `aFboUv`（自分のテクセル座標）を持たせ、頂点シェーダーで `texture2D(tPosition, aFboUv)` するだけ
- RT は 2 枚 ping-pong、`type: FloatType`、フィルタは `NearestFilter`（テクセルを正確に引くため）
- 描画側は `tPosition` と `tPrevPosition` の両方を受け取り、その差から速度を求めて
  進行方向への引き伸ばしと色に使う

## curl noise

4D simplex noise（Ashima / Gustavson）のポテンシャル場の回転を取る。

```glsl
curl F = (∂Fz/∂y - ∂Fy/∂z, ∂Fx/∂z - ∂Fz/∂x, ∂Fy/∂x - ∂Fx/∂y)
```

回転は定義上 divergence が 0 になるため、**湧き出しも吸い込みも起きず渦だけが残る**。
単なるノイズをそのまま速度に使うと粒子が一点に吸い込まれたり湧いたりする。

`persistence` を UV で変調しているのは、一様な curl だと全体が同じリズムで揺れて
機械的に見えるため。オクターブ数は leva で 1〜3 に変えられる（コストは線形に増える）。

## 力の合成

各粒子の目標位置は次を足し合わせて作る。慣性追従はフレームレート非依存にするため
正規化デルタを掛ける。

| 要素 | 内容 |
| --- | --- |
| 形状 | `tOriginal` を Y 回転させたもの。`shape hold` が 0 だと形を捨てて自由に漂う |
| curl | 発散ゼロの渦 |
| swirl | Y 軸まわりの旋回。中心ほど速くして差動回転にする |
| pointer | カメラ正面の平面とレイの交点を中心にしたガウス減衰。負値で斥力 |

## variant

| id | 内容 |
| --- | --- |
| `orb` | 球殻に貼り付いたまま砂粒が漂う。BlueYard の crypto orb 相当 |
| `nebula` | 形への引力をほぼ切り、curl だけで漂わせる |
| `galaxy` | 円盤 + 差動回転。中心にバルジができる |
| `helix` | 二重らせんを固く保持。カーソルで崩して戻る様子を見る |

## shape と variant の関係

`shape` は variant とは独立に切り替えられるが、**curl や follow などの運動パラメータは
そのとき選んでいる variant の値のまま**になる。細い形（helix）を、拡散寄りの variant
（nebula など）の curl で動かすと形を保てず散らばる。

形をきれいに見せたい場合は variant 側を選ぶ。逆に「形が崩れていく様子」を見たい場合は
shape だけ差し替えて `curl strength` を上げるとよい。

## 実装メモ

- **`geometry.boundingSphere` を手で与えている。** 位置は頂点シェーダーで決まるので
  three 側は正しい境界を計算できず、放っておくとフレーム外と判定されて消える
  （`frustumCulled = false` も併用）
- **初期フレームは目標位置へ即スナップさせる**（`uSetup`）。これをしないと
  全粒子が原点から飛んでくる
- **加算ブレンドは飽和しやすい。** 6 万個が重なると容易に白飛びするので、
  `intensity` は 1 前後に抑え、明るさは粒子の密度で作る
- パーティクル数は leva で 4k〜147k に変更できる。curl のコストが支配的なので、
  重い場合は octaves を下げるのが最も効く

## 出典

[BlueYard](https://blueyard.com/) — CryptoOrbParticleSpheres
（Obsidian: `GPGPU曲線ノイズ＋流体結合パーティクル（FBO位置シム）`）

元実装は画面の流体シミュレーションの速度場をパーティクルに結合しているが、
その流体ソルバ自体は別 example の題材なので、ここではカーソルの力場に置き換えている。
