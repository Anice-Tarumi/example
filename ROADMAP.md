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
| `analytic-lighting` | lighting | 面光源（球・管・矩形）と近接遮蔽を閉じた式だけで解く |
| `stroke-growth` | interaction | ドラッグ軌跡 → Catmull-Rom 係数 → 筒 1 本の頂点変形（makemepulse 2019） |
| `strand-orb` | materials | per-strand 属性 + ループ閾値 + discard リビール + 流体結合（BlueYard） |
| `custom-cursor` | interaction | 状態スタック + canvas 2D 手描き輪郭 + SVG パスモーフ（makemepulse 2019） |
| `debris-assembly` | geometry | 着地点を絵から逆算して順方向に落とし、積もった山が絵になる |
| `crt-noise` | materials | junni 採用サイトの砂嵐切替 + ブラウン管の物理 7 種 |
| `relief-field` | interaction | カーソルで隆起する高さ場と、そこへ落ちる金属球（2D 物理） |
| `logo-relief` | interaction | 距離変換で面取りしたロゴが中央に浮き上がる |
| `cursor-trail` | interaction | シフトレジスタ FBO（N×1 の位置履歴）で引く軌跡 |
| `day-night-cycle` | lighting | キーフレーム補間の昼夜 + 二色グラデーションフォグ |
| `tile-flip` | transitions | junni HP イントロのタイルめくり（WebGL / インスタンス） |
| `dom-tile-flip` | transitions | 同じものを CSS 3D だけで組む。DOM 版との使い分け |
| `grid-snake` | interaction | 3D のスネーク。タイムアタックとインクリメンタルの 2 モード |
| `impossible-walk` | interaction | 無限回廊。画面上の見た目で道が繋がる |
| `flip-clock` | typography | フリップドット盤 + ライフゲーム + シーケンサー |
| `vat-clock` | geometry | 宇宙空間で字から字へ直接寄る粒の時計 + 周回する流れ星 |
| `hologram-globe` | materials | 投影されたホログラムの地球儀。CRT の信号劣化を 3D へ |
| `dom-webgl-sync` | dom-webgl | DOM の矩形に板を重ね、3D の頂点に HTML の札を貼る |
| `cloth-xpbd` | physics | XPBD の拘束投影で布を解く。掴む・破れる・球に掛ける |
| `caustics-pool` | materials | 光子を水面で屈折させ、底に落ちた密度を数えて焦線を作る |
| `portal-rooms` | geometry | ステンシルで窓をくり抜き、対の窓の裏から見た部屋を描く。くぐれる |

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

---

## 検討中の大きめの案

### `sketch-to-3d` — 描いた絵を立体にする（Tripo API）

**フロー**

1. 絵を描く
2. **その場で距離変換 inflation**（`shared/edt.js` + `logo-relief` の焼き方）。0 秒で粗い立体が出る
3. 裏で Tripo の image-to-3D に**絵そのもの**を投げる
4. 10〜120 秒後、届いたメッシュに差し替える

**要点**

- **LLM でテキストに落とさない。** 落とすと「一般的な銃」が返り、自分が描いた銃ではなくなる。
  Tripo は image-to-3D があるので絵をそのまま渡す。LLM は名前付け・`prompt` の補強・
  公開サイト向けの内容フィルタに回す
- **待ち時間を演出に使う。** 何も起きない 2 分ではなく「手作りの立体が AI の立体に
  置き換わる瞬間」にする。距離変換の inflation と生成 AI を並べて見せられる

**API の実際（2026-09 時点で確認）**

- 非同期。送信 → `task_id` → ポーリング。生成 10〜120 秒
- 画像はアップロードして `file_token` を得てから `image_to_model` に渡す
- `texture: true` で貼る。`face_limit` でポリゴン数を制限
- **モデルの URL は 5 分で失効。** 成功したら即ダウンロード

**未確認・要検討**

- ブラウザから直接叩けるか（CORS）。弾かれるならプロキシが要る
- **鍵を公開サイトに置けない。** 訪問者が自分の鍵を貼る / Vercel の関数で
  プロキシ（要レート制限）/ 生成済みだけ同梱、のいずれか
- 既定は生成済みの「絵 + GLB」を同梱した Gallery。鍵がある時だけ Live 生成

### `vat-clock` — VAT で桁が組み上がる時計

**やり方**

- 数字 0〜9 それぞれについて「破片が散った状態 → その数字の形」を焼く
- 桁が変わったら、今の数字を**逆再生して散らし**、次の数字を**順再生して組む**
- 破片の位置と姿勢は `debris-assembly` の焼き方をそのまま使える

**なぜ VAT が向くか**

手続きで動かすと桁ごとに物理を回すことになる。VAT なら**焼いた変形を再生するだけ**で、
桁数を増やしても費用が変わらない。時計は同じ変形を延々と繰り返すので、
焼いて使い回す前提と噛み合う。

**規模の見積もり**

200 破片 × 30 フレーム × 10 数字 = 60,000 テクセル。Float の RGBA なら 1MB 以下。
桁ごとにインスタンスを分け、再生位置だけ uniform で渡す。

**注意**

- 散った状態は**全数字で共通**にする。桁ごとに別々の散り方を焼くと、
  逆再生から順再生へ移る瞬間に破片が飛ぶ
- コロンは点滅だけなので焼かなくてよい

## インフラ / 改善

- [x] **サムネイル** — `npm run thumbs` で全 example を実機で撮り `src/assets/thumbs/` へ。Home は有るものだけ画像に差し替え、無ければ絵文字。撮り方は `meta.json` の `thumb`（wait / hover / scroll / variant）で上書きできる
- [ ] **バンドル分割** — `react-three-fiber` チャンクが 890kB。`manualChunks` で three 本体を分離
- [ ] **モバイル確認** — サイドバーのドロワー化と leva パネルの配置が未検証
- [ ] **hover-gold-grid-v2 の扱い** — `ripple-simulation` と category が被る。Buttermax 再現として残すか、統合するか
- [ ] **variant のディープリンク** — 現状 URL は example 単位。`?variant=` を持たせると共有しやすい
- [ ] **カテゴリの過不足** — architecture / performance 系を作るなら `src/categories.js` の見直し

---

## アセットの方針

長らくアセット 0 で通していたが、板ライト（`Lightformer`）での環境代用と
システムフォントでの SDF 生成が絵の弱さになっていたため、必要なものだけ入れる。

### 置き場所

- **複数 example で使うもの** → `src/assets/<種別>/`（例: `src/assets/env/`）
  参照は `src/shared/env.js` のような共有モジュール経由にする。
- **単一 example 専用** → `src/examples/<name>/assets/`
  example フォルダだけコピーして他プロジェクトへ移植できる性質を保つため。

Vite なので `src/` 配下は import する。バイナリは `?url` を付ける。

```js
import hdrUrl from '../assets/env/studio_1k.hdr?url'
import fontUrl from './assets/Anton-Regular.ttf?url'
```

### 入っているもの

| ファイル | 出所 | ライセンス | 用途 |
| --- | --- | --- | --- |
| `assets/env/studio_1k.hdr` | Poly Haven | CC0 | glass-refraction / physics-playground |
| `assets/env/road_1k.hdr` | Poly Haven | CC0 | 同上（夜の屋外） |
| `text-effects/assets/Anton-Regular.ttf` | Google Fonts | OFL | SDF アトラス |
| `text-effects/assets/SpaceGrotesk-VariableFont_wght.ttf` | Google Fonts | OFL | 同上 |
| `text-effects/assets/ZenKakuGothicNew-Bold.ttf` | Google Fonts | OFL | 同上（日本語） |
| `flip-stage/assets/*.glb` × 6 | Tripo 生成 | 自社 | 円盤に載せる小シーン |
| `toon-outline/assets/character.glb` | Tripo 生成 | 自社 | 輪郭線の被写体 |
| `gpu-particles/assets/sculpture.glb` | Tripo 生成 | 自社 | SDF ベイク元 |
| `vertex-animation-texture/assets/monument.glb` | Tripo 生成 | 自社 | 破砕対象 |
| `depth-parallax/assets/scene-*.jpg` | Unsplash | Unsplash License | 視差の元画像 |
| `depth-parallax/assets/depth-*.png` | Depth Anything V2 で生成 | 自社 | 上記の深度マップ |
| `crt-noise/assets/tv-*.glb` × 5 | Tripo 生成 | 自社 | ブラウン管（example は未実装） |
| `public/favicon.ico` | 自社 | 自社 | サイトアイコン |

### モデルを頼むときの指定（訂正あり）

- **albedo テクスチャは要る。** 一度「トゥーンならテクスチャ不要」と伝えたが誤り。
  トゥーンが量子化するのは**ライティング**であって色ではない。
  テクスチャが無く、かつ 1 メッシュ 1 マテリアルだと、全身が単色になる。
- **避けるべきなのは「陰影が焼き込まれたテクスチャ」**。こちらの陰影と二重になって濁る。
  プロンプトに `no baked lighting` を入れる。
- 1024 の albedo 1 枚で足りる。normal / roughness は不要。

### 決めたこと

- **HDRI は 1k へ落としてから入れる。** 2k は 1 枚 6MB あって配信に向かない。
  反射に使うだけなら 1k で十分。`magick in.hdr -resize 1024x512 out.hdr`。
- **公開するショーケースなので CC0 / OFL / 自社制作に限る。**
- GLB を入れるときは `gltf-transform` で Draco + KTX2 に圧縮してから置く。
- 日本語フォントは 2.2MB あるので、**選ばれたときだけ読む**（`text-effects/fonts.js`）。

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

25. **`useFrame` の priority を上げると R3F の自動描画が止まる。**
    render target を触るパスを回すだけのつもりで priority を付けると、
    自分でシーンを描かない限り画面が真っ黒になる。

26. **画面内の位置で何かをフェードするなら、どの座標系の z かを確認する。**
    視空間 z はカメラ距離ぶん常に大きな負の値。ワールド z のつもりの
    しきい値を当てると全画素で外れて何も出なくなる。

27. **canvas は未ロードのフォントを黙って代替フォントで描く。**
    例外も警告も出ない。`ctx.font` の family が使えなければ sans-serif で塗って終わる。
    SDF を焼く前に `FontFace.load()` の完了を待つこと。

28. **読み込みで suspend するものは `Suspense` 境界の中に置く。**
    drei の `useGLTF` / `<Environment files>` は suspend する。境界の外に置くと
    Canvas の中身ごと外され、キャンバスの DOM ごと消える。

29. **セル ID をハッシュに渡す前に量子化する。**
    `id = uv - gv` のように浮動小数の引き算で得た ID は、同じセル内でも
    下位ビットが画素ごとに揺れる。ハッシュは混沌関数なのでその微小差を全域に増幅し、
    セルごとに一定であるべき値（進行度・回転量）が画素単位でばらつく。
    セルの縁が場所によって滲み、そのばらつきが格子に沿って線として見える。
    `floor(id * 64.0 + 0.5) / 64.0` のように丸めてから使う。

30. **画面空間の微分（`fwidth` / `dFdx`）は連続な量にしか使えない。**
    セルごとに姿勢が違う距離場は境界で不連続なので、`fwidth` がそこで跳ねる。
    アンチエイリアス幅がその画素だけ数十倍になり、格子状の筋が出る。
    元の連続座標の画素フットプリントから求める。

31. **黒い画面は lint も build も検出しない。**
   `node scripts/screenshot.mjs <url> <out.png> [hover] [waitMs] [dpr]` で目視確認する。
   時間差で 2 枚撮って差分がなければ、アニメーションが止まっている。

32. **手書き `ShaderMaterial` の頂点シェーダーは `instanceMatrix` を自分で掛ける。**
   組み込みマテリアルは chunk が掛けてくれるので忘れやすい。
   忘れると全インスタンスが原点に重なり、「巨大な単色の塊が 1 つ」に見える。
   `gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);`

33. **`sin` ベースの hash は座標が大きいと乱数にならない。**
   `gl_FragCoord` のような数百〜数千の値を入れると `sin` の引数が桁あふれし、
   滑らかな関数に化けて「のっぺりした画面」になる。Hoskins の hash12 を使う。

34. **固定周波数の縞（走査線・ストライプ・fbm の高オクターブ）は遠いとモアレになる。**
   `fwidth` で 1 画素あたりの周期数を出し、ナイキストに近づいた成分を中立値へ溶かす。
   逆に画素密度に追従させたいノイズ（砂嵐など）は `gl_FragCoord` を種にする。
   **フェードで消すか、画素に固定するか。周波数を距離で変えると質感が距離で変わる。**

35. **leva の値は example を跨いで残る。**
   `disposePaths` は参照カウントを減らすだけで、ボタンとフォルダ以外は `data` に残る。
   どの example も `variant` という同じパスを使うので、次の example の初期値が捨てられる。
   `ExampleLayout` のアンマウント時に `levaStore.dispose()` で丸ごと捨てている。
   ストアを分ける手は使えない。**`useControls` の多くは R3F の Canvas 内にあり、
   Canvas は別レンダラなので React のコンテキストが渡らない。**

36. **`generateBlueNoise` が返す `data` は 0〜255。** 0〜1 ではない。
   遅延や重みの係数に直接掛けると 255 倍になる。`tile-flip` では clamp で
   潰れて「青ノイズ順 = 全部いちばん最後」になり、`flip-board` では
   1 マスあたり最大 76 秒待つ盤になっていた。**使う側で 255 で割る。**

37. **頂点シェーダーで並べたインスタンスは、レイキャストが元ジオメトリしか見ない。**
   `InstancedBufferGeometry` の `position` が原点の 1×1 板なら、当たるのも
   原点の 1 ユニット四方だけ。`e.uv` も格子と対応しない。判定用の板を別に置く。

38. **3D 変形した要素の当たり判定を、変形していない要素で代用しない。**
   `translateZ` + `perspective` で描画は縮み、判定用の板とずれる。
   DOM なら要素自身にリスナーを付けてブラウザに任せる。WebGL なら
   射影後の矩形から割り出す。

39. **leva に登録していないキーをプリセットに置かない。** `set` した瞬間に
   未登録のパスを引いて落ちる。leva で触らせない値は定数として外に出す。

40. **頂点シェーダーで「まだ見えない部分」を画面外へ逃がすな。**
   帯や線を頭から伸ばすとき、可視判定を頂点で行って `gl_Position` を飛ばすと、
   境界をまたぐ三角形は片方の角だけが飛んで引き伸ばされる。先端が曲がり、
   頭は刻みの数でしか進まないのでかくつく。**判定はフラグメントへ。**
   頂点で逃がしてよいのは、判定に頂点ごとの値（`t` や `uv`）が入らないとき、
   つまりインスタンスまるごと消えるときだけ。

41. **正射影で `lookAt(0,0,0)` はカメラのオフセットを打ち消す。**
   leva に覆われるぶん像を横へ寄せようとカメラを動かしても、原点を向かせると
   その角度ぶん戻る。**注視点も同じだけずらす。**

42. **焼いたデータと実行時の座標変換は、符号まで合わせる。**
   `hologram-globe` では点群の経度を `atan2(z, x)`、海岸線を
   `-cos(lat) sin(lng)` で作っていて、東西が反転して重ならなかった。
   焼く側は**実行時の逆写像をそのまま書く**。

43. **文字列置換でシェーダーを書き換えたら、当たったか検証する。**
   `str.replace` は一致しなければ黙って何もしない。古い本体が残って未宣言の
   varying を参照し、コンパイルが落ちて**その材質だけ描かれなくなる**。
   three のシェーダーエラーは例外にならないので、画面が静かに欠ける。

44. **GLSL のテンプレートリテラルの中でバッククォートを使うな。**
   コメントに `` `uTail` `` のような強調を書くと、そこで文字列が閉じて
   構文エラーになる。日本語コメントで識別子を引用したくなるが、素で書く。

45. **`instanceColor` を自前の頂点シェーダーで宣言するな。**
   `setColorAt` を呼んだメッシュには three が `USE_INSTANCING_COLOR` を立て、
   前置きに attribute を入れる。自分でも書くと二重宣言で落ちる。逆に、
   **一度も `setColorAt` を呼んでいないと attribute 自体が無い**ので、
   参照する側は初期化を先に済ませておく。

46. **`delta` の最初の 1 フレームは 0 で来る。** 刻みで割る式（XPBD の
   α̃ = 柔らかさ/h² など）にそのまま渡すと無限大になり、`Inf × 0` が NaN を
   生む。以降すべての座標が NaN のまま固まって、画面から物が消える。
   **刻みには下限を置く。**

47. **布を「幅ぴったり」に留めるとひだが出ない。** 留め点の間隔が布幅と同じ
   なら、辺の拘束は伸びないので上端は張った直線になり、面は板のまま垂れる。
   物理としては正しい。実際の掛け布は幅より狭い所に留めるから生地が余る。
   **留め幅を数割詰める。**

48. **接触に摩擦が無いと、掛けた布は必ず滑り落ちる。** 押し出すだけでは
   球の上に留まらない。接している点について、面に沿って動いたぶんを削る。

49. **布に自己衝突が無いと、引っ張ったとき癒着して見える。** 折り返した層が
   互いをすり抜けて重なり、面の向きが打ち消し合うので 1 枚の塊に見える。
   点どうしの押し退けで足りる（三角形と点の判定は桁違いに高い）。格子の上で
   隣り合う点は除く。隣を押すと辺の拘束と綱引きになって布が震える。
   **刻みごとに掛けると計算が倍**（32×32 で 3.3ms → 7.1ms）。フレームに
   1 回、最後の刻みで押し退ければ目に見える貫通は起きない。

50. **押し退けは「通り抜けた後」には効かない。** 自己衝突を入れても、1 刻みで
   厚みを越えて動く点があると相手を跨いでしまい、以後は逆側で安定して
   絡まったまま戻らない。**動ける距離を厚みの内側に抑える**のが要点。
   掴んだ点をカーソルへ瞬間移動させるのは、この意味で最悪の入力になる。
   速さに上限を付ける。ただし遅すぎると引いても付いてこないので、
   「1 刻みの移動が厚みを越えない範囲でいちばん速い所」に置く。

51. **高さ場の法線を差分で取ると、1 画素あたり式を 6 回評価する。**
   波のように sin の和で書ける場は**微分が閉じた形で出る**。位相を使い回せば
   高さと傾きが 1 回で揃う。`caustics-pool` はこれだけでフレーム時間が
   4 割落ちた（ソフトウェア描画で 7fps → 11fps）。

52. **加算で density を溜めるときは「平らなときの平均が 1」に正規化する。**
   光子 1 発の重みを勘のまま置くと、粒の数や解像度を変えるたびに絵の明るさが
   動く。1 発が塗る面積（点の大きさ）も勘定に入れないと、点を大きくしただけで
   白飛びする。

53. **`scene.background` に色を入れると、`autoClear = false` でも `gl.render()`
   のたびに色バッファが消える。** 背景色があると three 側で forceClear が立つ
   ため。1 枚の絵を数パスに分けて描く手順（ポータル・ステンシル等）では、
   2 回目の描画で 1 回目が消えて真っ黒になる。背景は `setClearColor` で置き、
   消すのは自分で 1 回だけにする。

54. **ステンシル用の板を「隠す対象」の子に置かない。** 部屋を隠して板だけ
   描く番で、板まで一緒に消えてステンシルが書かれない。切り替える群の外に
   出しておく。

55. **`<Canvas>` に `gl={{ stencil: true }}` が要る。** 既定ではステンシル
   バッファが確保されず、ステンシルの設定は黙って無視される（エラーも
   警告も出ない）。

56. **ポータルの対は「平行に置く」と回転がゼロになる。** 変換は
   `B × rotY(180°) × A⁻¹` なので、B を A と 180° 違う向きに置けば回転が
   打ち消し合い、ただの平行移動になる。横壁に置くと 90° 回る。ポータルとして
   正しい挙動だが、初見では「勝手に向きが変わった」と受け取られる。既定は
   回さない置き方にして、回るほうは見せたいときだけ出す。

57. **ステンシル用の板を面から 2cm しか浮かせないと、浅い角度で深度が競う。**
   書かれたり書かれなかったりして、窓が点滅する。`polygonOffset` で手前へ
   寄せる。

58. **ステンシルの板は near 面で切られる。** 窓に顔を寄せると板の一部が
   near 面より手前に出て、ステンシルが 1 フレーム抜ける。くぐる瞬間に
   画面がちらつく原因。近づいたら板を面の裏へ下げ、深度判定を切る。
   そこまで近ければ、カメラと窓の間に物は入らない。

59. **React Compiler は「宣言より前で参照される `useMemo`」を最適化できない。**
   `Compilation Skipped: Existing memoization could not be preserved` が出る。
   useFrame の中で使う値は、useFrame より**前**で作る。
