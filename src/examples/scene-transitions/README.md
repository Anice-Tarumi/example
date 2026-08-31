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

## Hex Shatter

六角形グリッドで割れて入れ替わる。Ice Cut と同じ思想を、**セル構造**に持ち込んだもの。

### 距離場から 3 つ取り出す

```glsl
vec4 hc = hexCoords(p * uHexScale);   // セル内の位置 + セル ID
float d = hexDist(cell);              // 中心 0、辺で 0.5

float fill = smoothstep(0.5*local + aa, 0.5*local - aa, d);        // 塗り
float edge = smoothstep(band, 0.0, abs(d - 0.5*local));            // 縁（等高線）
vec2  refr = normalize(cell) * nearEdge * uHexRefract;             // 屈折（勾配方向）
```

塗り・縁・屈折が**同じ距離場から出ている**ので、形が必ず一致する。
別々にマスクを作ると、拡大したときにズレが見える。

### 上から順に閉じる

**1 セルが閉じる時間（`cell time`）を短くし、開始時刻を掃引でずらす。**

```glsl
float sweep = (1.0 - vUv.y) * 0.85 + vUv.x * 0.15;   // 上から、わずかに斜め
float order = mix(sweep, rnd, uHexJitter);
float start = order * (1.0 - window);
float local = clamp((uProgress - start) / window, 0.0, 1.0);
```

窓を長く取ると全セルの開閉が重なって、**画面全体が一斉に変わって見える**。
短くするほど「閉じている帯」が細くなり、波として読める。

### 切り替わった後に格子を残さない

`fill` のしきい値を `0.5 * local` にすると、閉じきったとき（`local = 1`）に
**しきい値がちょうどセルの辺と一致する**。辺の上では `smoothstep` が 0.5 を返すので、
全部の格子線が半分ブレンドされた線として残る。辺より外側まで振り切らせる。

```glsl
float thr  = local * (0.5 + aa * 3.0 + 0.01);   // 辺（0.5）を越える
float fill = smoothstep(thr + aa, thr - aa, d);
```

### グリッドは境界の周りだけ

```glsl
float bump    = 4.0 * local * (1.0 - local);      // 開閉中で最大、閉じると 0
float pending = start - uProgress;                 // > 0 ならまだ来ていない
float ahead   = smoothstep(uHexReach, 0.0, pending) * step(0.0001, pending);
```

**`pending` を符号で切ること。** 切らないと通過し終えたセル（`start < progress`）でも
`smoothstep` が 1 を返し、切り替わった後の画面に格子が残る。

縁は 2 種類を足す。

```glsl
float edgeActive  = smoothstep(edgeBand, 0.0, abs(d - thr)) * bump;             // 閉じていく輪
float edgePreview = smoothstep(edgeBand * 0.7, 0.0, abs(d - 0.5)) * ahead * 0.5; // 予告の外形
```

**立ち上がりと終わりでは輪を出さない。**
セルは中心から外へ塗り広がるので、`local` がごく小さい間は等高線が点に潰れる。
掃引の始まり側は往復の戻りで最後にこの段階を通るため、
**他が終わったあとに画面の端だけ光点が残る**。

```glsl
float grow = smoothstep(0.0, 0.14, local) * smoothstep(1.0, 0.92, local);
```

**進行中の等高線をそのまま通過前にも使ってはいけない。**
`local = 0` ではしきい値が 0 なので、等高線がセルの中心に潰れて**光点が並ぶ**。
予告はセルの外形（`d = 0.5`）を薄く描く。

屈折と色収差は `bump` だけに掛ける。通過後も通過前も素の画になる。
屈折は「しきい値より内側すべて」ではなく**等高線の帯だけ**。
内側全部に掛けるとセルの中身が丸ごと歪んで、ガラス玉が敷き詰まった絵になる。

### セルごとに散らす

- `hash(セル ID)` で**遅延**を散らす。掃引の順番と混ぜる比率が `jitter`
- 同じハッシュで**回転**も散らす。閉じながら回るので機械的に見えない
- `spin` は `(1 - local)` を掛けてあるので、閉じきると回転が止まる

### 六角形を崩す

グリッドを作る**前に** uv をノイズで歪める。

```glsl
p += vec2(noise(p*2.3+11.0), noise(p*2.3-7.0)) * uHexWarp;
vec4 hc = hexCoords(p * uHexScale);
```

歪めてから格子に落とすので、六角形が不定形の多角形になる。
`warp` を上げるほど崩れる。あとから頂点を動かすのではなく**座標系を歪める**のが要点で、
セルの繋がりが壊れない。

### 縁だけに効かせる

色収差も屈折も `nearEdge`（縁からの距離）を掛けてある。
全面に掛けると単なるぼやけた画面になる。**変化している場所だけ**に処理を集めると、
そこに視線が集まって「割れている」と読める。
