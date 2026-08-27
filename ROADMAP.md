# ROADMAP

showcase に実装する example の候補リスト。ネタ元は Obsidian Vault の `Webテクニック/`（122 ノート）。
カテゴリ id は [`src/categories.js`](src/categories.js) に対応する。

粒度の原則は **1 example = 1 機能、バリエーションは同じキャンバス内で variant 切替**。
「◯◯ + ◯◯ + ◯◯」と並んでいるものは、それらを 1 example に集約するという意味。

## 選定基準

**他のショーケースに頻出する機能を単体で載せても意味がない。**
bloom・色収差・ビネット・matcap のような基礎は、それ単体なら drei や three の公式
example で足りる。載せるなら次のどちらかを満たすこと。

1. **他でまず見ない技術であること**（MRT トゥーン輪郭線、VAT、解析的近接ライティング、
   OffscreenCanvas ワーカー描画、UV 空間の波伝播 など）
2. **基礎技術どうしを組み合わせて、単体より明らかに上質な体験になっていること**
   （例: `glass-refraction` は transmission 単体では drei の 1 行と変わらないが、
   分散 + 氷の質感 + カーソルで霜が溶ける演出まで揃うと別物になる）

---

## 実装済み

| example | category | 元ネタ |
| --- | --- | --- |
| `scene-transitions` | transitions | ノイズマスク画面トランジション / 劇場カーテン / オーバーレイフェード |
| `ripple-simulation` | interaction | 波動方程式 + ping-pong FBO（Obsidian 外・新規） |
| `hover-gold-grid-v2` | interaction | Buttermax |
| `paint-reveal` | interaction | ai-quest ScreenPaint + cutscene getMaskColor |
| `gpu-particles` | particles | igloo.inc ContainerParticles（SDF 表面吸着 GPGPU） |
| `fluid-solver` | particles | igloo.inc Navier-Stokes GPU ソルバ |
| `glass-refraction` | materials | igloo.inc カスタム透過ガラス + MouseFrost |
| `depth-parallax` | dom-webgl | Lusion 深度マップ視差 + ai-quest 深度フラッシュライト |
| `toon-outline` | postprocess | messenger.abeto.co MRT トゥーン輪郭線 |
| `vertex-animation-texture` | geometry | Lusion VAT（破砕を Float テクスチャに焼く） |
| `flip-stage` | transitions | 忍者屋敷のどんでん返し（表裏 2 面で無限シーン送り・新規） |
| `postprocess-stack` | postprocess | 自前ミップ Bloom + レンズゴースト + テトラヘドラル 3D LUT |
| `physics-playground` | physics | 自前剛体球ソルバ + 一様グリッドのブロードフェーズ |
| `vertex-deformation` | geometry | 頂点シェーダーのトンネル空間変形（メビウス変換） |
| `text-effects` | typography | SDF アトラスを実行時に焼く（自前の距離変換）+ 文字単位の変形 |
| `offscreen-worker` | performance | Worker + OffscreenCanvas 描画。メインを固めて左右比較 |

---

## 優先度 高

### `day-night-cycle` — lighting
- ネタ元: `手続き的な昼夜・天候サイクル（キーフレームプリセット＋ノイズ）` / `スクロール連動の昼夜・感情ライティング` / `二色グラデーションフォグ`
- variant: 昼夜 / 天候 / 感情ライティング / フォグ単体

### `god-rays` — lighting
- ネタ元: `極座標ノイズの神光（God Rays）板ポリ`

### `matcap-material` — materials
- ネタ元: `matcap マテリアルの多チャンネル活用（diffuse・rough spec・smooth spec）` / `ベイクテクスチャ1枚＋MeshBasicMaterialでライト不要表現`
- variant: matcap 単体 / 多チャンネル / ベイク

---

## 優先度 低 / 要検討

見た目のインパクトが小さい、または showcase の形にしづらいもの。

- `procedural-noise` — テクスチャ: `手続きノイズのRTTベイク（voronoi・perlin・hash）` / `ブルーノイズによるバンディング除去`
- `instancing-scale` — geometry: `InstancedGroup` / `エリア単位フラスタムカリング` / `detect-gpuによる品質ティア分岐`（パフォーマンス系は「見せる」のが難しい。FPS 表示と併せる形なら成立）
- `spatial-audio` — audio: `Web空間オーディオ設計` / `操作・スクロール連動の音トリガー`（音が出る example の扱いを決める必要あり。ミュート既定必須）
- `dom-webgl-sync` — dom-webgl: `DOM と WebGL の座標同期` / `3D点に追従するHTMLラベル`

---

## インフラ / 改善

- [ ] **サムネイル** — Home のカードが emoji のみ。`scripts/screenshot.mjs` で各 example の静止画を自動生成して `public/thumbs/` に置く仕組みを作る
- [ ] **バンドル分割** — `react-three-fiber` チャンクが 890kB。`manualChunks` で three 本体を分離
- [ ] **モバイル確認** — サイドバーのドロワー化と leva パネルの配置が未検証
- [ ] **hover-gold-grid-v2 の扱い** — `ripple-simulation` と category が被る。Buttermax 再現として残すか、統合するか
- [ ] **variant のディープリンク** — 現状 URL は example 単位。`?variant=` を持たせると共有しやすい
- [ ] **カテゴリの過不足** — architecture / performance 系を作るなら `src/categories.js` の見直し

---

## 実装時の落とし穴（実際に踏んだもの）

新しい example を書く前に読むこと。今日これで数時間溶かした。

1. **`<shaderMaterial uniforms={...}>` に prop で渡すな。**
   オブジェクトの参照が保たれず、`useFrame` からの uniform 更新がすべて無視される。
   `useMemo` で `new THREE.ShaderMaterial()` を作り `<primitive object={material} attach="material" />` で挿す。

2. **`setRenderTarget` を使うなら合成も自前で描け。**
   `useFrame` 内で render target を触ると、R3F の自動レンダリングで全画面クアッドが描かれない。
   `useFrame(fn, 1)` で priority を上げ、three の `FullScreenQuad` で明示的に `render(gl)` する。

3. **手動ガンマを書くな。**
   `THREE.Color` は color management によって既にリニア値で uniform に入る。
   シェーダー内で `pow(color, 2.2)` すると二重変換で真っ黒になる。出力は `#include <colorspace_fragment>` に任せる。

4. **`half` は GLSL の予約語。** 変数名に使うとコンパイルが通らない。

5. **drei の `useFBO` は既定が `HalfFloatType`。**
   `readRenderTargetPixels` は `Uint16Array` を要求する。高さフィールドのように負値を扱うなら HalfFloat のまま、
   単に色を焼くだけなら `UnsignedByteType` を明示した方が扱いやすい。

6. **Float の MRT（`WebGLRenderTarget` の `count: 2`）は環境によって通らない。**
   SwiftShader では描画呼び出しから戻ってこなくなり、例外もエラーも出ないまま
   ループだけが止まる。位置と速度を分けた 2 パスにすれば同じ計算ができる。

7. **点のサイズはカメラ距離とセットで決めること。**
   `gl_PointSize = uSize / length(viewPos)` 形式の式を、元実装と違うカメラ距離で
   使うと桁が変わる。65k 点 × 150px で 1.4G ピクセルに達し、1 フレームが返らなくなる。
   これも例外は出ないので「描画されない」ようにしか見えない。

8. **GLSL3 で MRT を使うなら `RawShaderMaterial`。**
   `ShaderMaterial` + GLSL3 だと three が `layout(location = 0) out vec4 pc_fragColor`
   を prefix で入れるため、自前の `layout(location = 1)` と衝突する。
   エラーも警告も出ないまま描画だけが消える。

9. **leva の folder キーに空白を入れない。`setParams` に未登録のキーを渡さない。**
   どちらも `Cannot read properties of undefined (reading 'path')` でアプリ全体が落ちる。
   preset に leva へ出していない値を混ぜたときに踏みやすい。

10. **useFrame でマテリアルの `uniforms` を触るならガードする。**
    切り分けのために標準マテリアルへ差し替えた瞬間に例外でループが止まり、
    「差し替えても直らない」という誤った結論に繋がる。

11. **表裏を入れ替える演出で「片面を隠す」で解決しようとするな。**
    一度返ると裏だった面が表に来るので、初期の裏面を非表示にする実装は破綻する。
    覗き込みは形で塞ぐ（`flip-stage` は外周に `ringGeometry` の地面板 + `fogExp2`）。
    差し替えるのは常に「これから隠れる側」だけ。上がってくる面に触ると即バレる。

12. **overshoot するイージングでは「90 度通過」は隠れた判定にならない。**
    行き過ぎて戻る間に裏面がまた見える。状態の差し替えは回転が完全に終わってから。

13. **裏返る板は y=0 対称に組むこと。**
    円柱を `position=[0,-thickness/2,0]` のように片寄せすると、返ったとき蓋が
    地面より上に来て地面を隠す。同一平面に置いた面は z-fighting で縞になる。

14. **GLSL3 の `ShaderMaterial` に `gl_FragColor` は無い。**
    `layout(location = 0) out vec4` を自分で宣言する。GLSL1 では three が
    用意してくれるので、後から GLSL3 へ切り替えたときに気付きにくい。
    エラーは `VALIDATE_STATUS false` として出るので、console.error を必ず拾うこと。

15. **RT は `ClampToEdge`。UV が 0..1 を出るサンプルは端の 1 列が引き伸ばされる。**
    レンズゴーストのように画面外を参照する処理では、巨大な色面として現れる。
    範囲外は重み 0 で捨てる。

16. **中心基準のスケールサンプルで倍率 1 を跨ぐな。**
    `(uv - 0.5) * k + 0.5` は k→0 で中心の数テクセルが全画面に拡大される。
    ゴーストの段は 1 を跨がないよう離す。

17. **段を足し込むブルームは重みの総和で正規化する。**
    しないと段数や falloff を変えるたびに全体の明るさが跳ねる。

18. **DOF と視差は同時に掛けると潰し合う。**
    焦点面から外れた層は全部滲むので、動いていても目で追えない。
    視差を見せる variant では DOF を 0 にし、ぼけは別 variant の担当にする。
    掛けるときも焦点面はディテールのある層に置く。中景に置くと全部ぼける。

19. **視差は「層ごとに動く量が違う」ことでしか読めない。**
    動きを目で追える硬い輪郭が層ごとに要る。グラデーションだけの空や山は、
    正しく動いていても変化が見えず「ぼやけた絵」にしか見えない。
    視差でレイが画像の外へ出る分は、表示範囲を内側へ寄せて（pad）逃がす。
    ClampToEdge のままだと縁に縦線や色のくさびが出る。

20. **同じ描画コードを mode 違いで 2 回走らせるなら、`rand()` の消費数を揃える。**
    片方の分岐だけで乱数を引くと以降の配置が全部ずれる。
    色と深度を同時に焼く手法では「絵と深度マップが一致しない」形で出る。

21. **等倍のスクリーンショットだけ見ていると解像度不足を見落とす。**
    Retina のフルスクリーンでは元画が 2〜3 倍に拡大される。
    `screenshot.mjs` の第 6 引数に 2 を渡して確認する。

22. **`meshStandardMaterial` に `vertexColors` を付けるなら geometry に `color` 属性が要る。**
    `instancedMesh` の `instanceColor` だけを使いたいときに付けると、
    存在しない属性の既定値 (0,0,0) が乗って真っ黒になる。`instanceColor` は単独で効く。

23. **距離変換の「無限遠」に `Infinity` を使わない。**
    未確定の行で `Infinity - Infinity = NaN` になり、以降が全部 NaN になる。
    テクスチャは真っ黒、画面には何も出ない。`1e20` のような大きい有限値を使う。

24. **早期 return の条件は依存配列にも入れる。**
    `if (size.w < 2) return` としつつ size を依存に入れないと、初回で弾かれたきり
    二度と実行されない。エラーは出ず「何も起きない」だけになる。

25. **黒い画面は lint も build も検出しない。**
   `node scripts/screenshot.mjs <url> <out.png> [hover] [waitMs] [dpr]` で目視確認する。
   時間差で 2 枚撮って差分がなければ、アニメーションが止まっている。
