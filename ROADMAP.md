# ROADMAP

showcase に実装する example の候補リスト。ネタ元は Obsidian Vault の `Webテクニック/`（122 ノート）。
カテゴリ id は [`src/categories.js`](src/categories.js) に対応する。

粒度の原則は **1 example = 1 機能、バリエーションは同じキャンバス内で variant 切替**。
「◯◯ + ◯◯ + ◯◯」と並んでいるものは、それらを 1 example に集約するという意味。

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
| `glass-refraction` | materials | igloo.inc カスタム透過ガラス（分散つき） |

---

## 優先度 高

今日組んだ ping-pong FBO / FullScreenQuad の骨格をそのまま拡張できるもの。着手コストが低く見栄えが大きい。

### `postprocess-stack` — postprocess
ポストエフェクトを重ねがけして、各段を on/off・パラメータ調整できるパネル。ショーケースとして分かりやすい。
- ネタ元: `マルチスケール加算Bloom（4ミップ＋分離blur5）` / `色収差` / `ビネット` / `3D LUTカラーグレーディング（テトラヘドラル補間）` / `SMAA + Final color grading`
- variant: bloom 単体 / LUT 単体 / フルスタック / 独自Bloom（FFT畳み込み＋レンズハロー）

---

## 優先度 中

### `scroll-driven-scenes` — scroll
- ネタ元: `スクロール連動のシーン遷移（区間ratioで複数3Dシーンを駆動）` / `慣性つきスムーススクロール（target→lerp＋inertia減衰）`
- variant: 区間 ratio 駆動 / 慣性スクロール / 円柱パス走行
- 備考: サイドバー常時表示の中でスクロール領域をどう置くか要検討

### `text-effects` — typography
- ネタ元: `MSDFテキスト描画（median＋fwidth＋アウトライン）` / `テキスト分割アニメ`
- variant: MSDF アウトライン / 文字分割リビール / 波打ち / グリッチ

### `toon-outline` — postprocess
- ネタ元: `MRTバッファによるトゥーン輪郭線（ID・深度・法線の十字エッジ検出）`
- variant: 深度エッジ / 法線エッジ / ID エッジ / 合成
- 備考: MRT。`R3F独自ループMRT合成レンダリングパイプライン` も参照

### `depth-parallax` — dom-webgl
- ネタ元: `深度マップ視差（depthをレイマーチして2.5D化＋DOF）` / `レイヤー分解＋深度フラッシュライトの2.5Dシーン`
- variant: レイマーチ視差 / レイヤー分解 / フラッシュライト
- 備考: 深度マップ画像が要る。手続き生成できるか要検討

### `day-night-cycle` — lighting
- ネタ元: `手続き的な昼夜・天候サイクル（キーフレームプリセット＋ノイズ）` / `スクロール連動の昼夜・感情ライティング` / `二色グラデーションフォグ`
- variant: 昼夜 / 天候 / 感情ライティング / フォグ単体

### `god-rays` — lighting
- ネタ元: `極座標ノイズの神光（God Rays）板ポリ`

### `matcap-material` — materials
- ネタ元: `matcap マテリアルの多チャンネル活用（diffuse・rough spec・smooth spec）` / `ベイクテクスチャ1枚＋MeshBasicMaterialでライト不要表現`
- variant: matcap 単体 / 多チャンネル / ベイク

### `vertex-deformation` — geometry
- ネタ元: `頂点シェーダーによるトンネル空間変形（Möbius変換・捻り）` / `テクスチャベース頂点アニメ`
- variant: トンネル / Möbius / 捻り / VAT

### `physics-playground` — physics
- ネタ元: `カスタム物理（中心引力＋ペア衝突＋マウス押しのけ）` / `Rapierレイキャストビークル（物理カー）`
- 備考: Rapier は新規ライブラリ。自前物理の variant だけなら依存ゼロで作れる

---

## 優先度 低 / 要検討

見た目のインパクトが小さい、または showcase の形にしづらいもの。

- `procedural-noise` — テクスチャ: `手続きノイズのRTTベイク（voronoi・perlin・hash）` / `ブルーノイズによるバンディング除去`
- `instancing-scale` — geometry: `InstancedGroup` / `エリア単位フラスタムカリング` / `detect-gpuによる品質ティア分岐`（パフォーマンス系は「見せる」のが難しい。FPS 表示と併せる形なら成立）
- `spatial-audio` — audio: `Web空間オーディオ設計` / `操作・スクロール連動の音トリガー`（音が出る example の扱いを決める必要あり。ミュート既定必須）
- `dom-webgl-sync` — dom-webgl: `DOM と WebGL の座標同期` / `3D点に追従するHTMLラベル`
- `offscreen-worker` — architecture: `OffscreenCanvasワーカー描画＋DOMイベントshim`（カテゴリ未定義。必要なら categories.js に追加）

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

8. **黒い画面は lint も build も検出しない。**
   `node scripts/screenshot.mjs <url> <out.png> [hover] [waitMs]` で目視確認する。
   時間差で 2 枚撮って差分がなければ、アニメーションが止まっている。
