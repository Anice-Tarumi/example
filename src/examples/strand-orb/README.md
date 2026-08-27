# Strand Orb

無数の糸が束になって球を作り、糸に沿って光の帯が流れる。
スクロールや時間で「球が描かれていく／消えていく」。

元ネタは BlueYard の engineering-orb。

## per-strand 属性に全部載せる

肝は **糸ごとの属性**。本家は GLB に焼き込んで持ってくる。
ここは外部アセットを持たないので手続きで生成するが、設計は同じ。

| 属性 | 用途 |
| --- | --- |
| `aLen` | 糸の長さ方向 0..1。帯の進行とリビール順に使う |
| `aStrand1` | 糸ごとの色・太さのばらつき |
| `aStrand2` | 糸ごとの位相のばらつき |
| `aBundle` | 束の ID。束単位で位相をずらす |

この 4 つがあれば、位相も色も出現順も **シェーダーの中だけ**で散らせる。
CPU 側で糸ごとにループを回す必要がない。全部で 1 draw call。

## ループ閾値

線に沿って流れる光の帯を作る汎用関数。`fract` と 2 段の `smoothstep` だけ。

```glsl
vec3 loopingThreshold(float progress, float fillLength, float startFade, float endFade, float repeat) {
  float m = fract(progress * repeat);
  m = smoothstep(0.0, fillLength, m);
  float s = smoothstep(0.0, startFade, m);
  float e = smoothstep(1.0 - endFade, 1.0, m);
  return vec3(s - e, s, e);   // x = 可視帯
}
```

`repeat` で帯の本数、`fillLength` で帯幅、`startFade` / `endFade` で頭と尻尾の柔らかさ。
進行に束ごと・糸ごとのオフセットを足すと、揃わずにばらけて流れる。

線・糸・ケーブル・回路のパルスなど、「線に沿って光が走る」表現に全部使える。

## リビールは discard 1 行

```glsl
if (1.0 - (vLen + vStrand1 * 0.1 + vBundle * 0.1) > revealAt) discard;
```

判定に糸長を使うと「形状の一部から生えてくる」演出になる。
糸・束のオフセットを混ぜると、生える順がばらける。

`revealAt` は 0..1 を **-0.2..1.2 に広げて**から使う。
そのまま 0..1 で判定すると、両端で全部が同時に現れて（消えて）詰まる。

## 太さは画面空間で付ける

`THREE.Line` は線幅を持てない（WebGL の制約）。細い糸を安定して出すには、
リボンにして頂点シェーダーで押し出す。

接線をクリップ空間へ落として画面上の向きを求め、その垂直方向へ ±1 ずらす。
`clip.w` を掛けるので、遠くの糸も同じピクセル幅で出る。

## 流体との結合

カーソル → 流体（画面空間の速度場）→ 糸、の二段構え。
`src/shared/useVelocityField` を `gpu-particles` と共有している。

頂点を一度投影して画面 UV を求め、そこの速度場の輝度で半径方向へ押し出す。
カーソルを離したあとも渦が残るので、糸がしばらくざわめき続ける。

## 落とし穴

- **背面フェードは座標系に注意。** 元ノートも「Z 座標の符号＝座標系依存、要確認」と
  書いてある通りで、視空間 z を使うとカメラ距離ぶん常に大きな負の値になり、
  しきい値が全画素で外れて**何も表示されなくなる**。ワールド z で測る。
- 半透明 + `discard` を多用するので `depthWrite` は切る。
  描画順で色が変わるのを避ける。
- `useFrame` の priority を上げると R3F の自動描画が止まる。
  流体パスを回すだけなら priority は上げない（自前でシーンを描かないなら不要）。

## 操作

- カーソルを動かすと糸がざわめく
- `Variant` で 標準 / 高密度 / 残り火 / 描画リビール
- `auto` を切ると `reveal` スライダーで手動制御できる
