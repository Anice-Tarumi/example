# Fluid Solver

Navier-Stokes を GPU で解く流体シミュレーション。Stam の半ラグランジュ法を
ping-pong FBO で実装したもので、PavelDoGreat の WebGL-Fluid 系の構成に従う。

## 1 フレームのパス順

**この順序を崩すと解けない。**

```
splat ─▶ curl ─▶ vorticity ─▶ divergence ─▶ clear ─▶ pressure × N
                                                          │
                     advect(dye) ◀─ advect(velocity) ◀─ gradientSubtract
```

| パス | 内容 |
| --- | --- |
| **splat** | カーソルの前フレーム位置→現在位置を線分とし、ガウスで速度と色を注入 |
| **curl** | 渦度 `rot(velocity)` を求める |
| **vorticity** | 渦度の勾配方向に力を加え、数値拡散で失われた渦を復元する |
| **divergence** | 発散を求める。壁面では速度を反転して流出を防ぐ |
| **clear** | 前フレームの圧力を減衰させ、次の反復の初期値にする |
| **pressure** | ポアソン方程式の Jacobi 反復。`p = (L+R+B+T - div) * 0.25` |
| **gradientSubtract** | 圧力勾配を引いて非圧縮にする |
| **advect** | 速度場を逆に辿って値を拾う。速度自身と dye の 2 回 |

## RenderTarget の構成

速度・圧力・渦度は低解像度、**染料だけ高解像度**にすると軽くて綺麗になる。

| RT | 解像度 | フォーマット |
| --- | --- | --- |
| velocity (×2) | sim | RG HalfFloat |
| dye (×2) | dye | RGBA HalfFloat |
| curl / divergence | sim | R HalfFloat |
| pressure (×2) | sim | R HalfFloat |

解像度は短辺を基準に長辺をアスペクト比で伸ばす（[`useFluidTargets.js`](useFluidTargets.js)）。
正方形の RT で解くと画面比によって渦が歪む。

## variant

| id | 内容 |
| --- | --- |
| `ink` | 色相が回るインク。既定値は元実装の値 |
| `smoke` | 彩度 0、渦度を弱めて煙のように |
| `vortex` | vorticity を上げて渦を強調。減衰も弱く |
| `field` | 速度場を可視化。方向を色相、大きさを明度に割り当てる |

`mode` を `curl` にすると渦度そのものを見られる（正負を暖色 / 寒色で表示）。

## 実装メモ

- **`texelSize` の取り違えが最も多いバグ。** 速度系と dye 系で解像度が違うため、
  移流時に渡す `dyeTexelSize` を間違えると、移流距離がずれて絵が破綻する
- **速度は半精度 Float（RG HalfFloat）が必須。** 8bit では速度が量子化されて渦が消える
- **圧力の反復回数は精度と速度のトレードオフ。** 20 回が既定だが、3 回程度でも
  それらしく見える。leva で下げると圧縮性が残って流れが乱れるのが分かる
- **注入する色は薄く。** 濃いまま入れると数フレームで飽和して白い塊になる
  （元実装も `* 0.15` 程度に落としている）
- **減衰は `dt` に対して指数で効かせる**（`result / (1 + dissipation * dt)`）。
  固定値で掛けると重い端末ほど速く消える
- **auto demo** — カーソルが 1 秒止まったらリサージュ曲線で自動的に splat する。
  実際にカーソルを動かせば即座にそちらが優先される

## 出典

[igloo.inc](https://www.igloo.inc/) 背景の流体
（Obsidian: `GPU流体ソルバ（Navier-Stokes splat→pressure→advection）`）

この example の速度場は、そのまま [`gpu-particles`](../gpu-particles/) に結合できる。
元の BlueYard 実装はパーティクルをカメラ投影してこの速度場をサンプルしている。
