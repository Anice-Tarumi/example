> このファイルは [`~/web-asset-scraper/functions/buttermax/hover_gold_grid_v2_PROMPT.md`](../../../../../web-asset-scraper/functions/buttermax/hover_gold_grid_v2_PROMPT.md) から自動生成されました。

---

# Hover Gold Grid Pulse — 機能再現プロンプト

> このファイルは `/funcCopy` により buttermax.net の解析から自動生成されました。
> 出典プロジェクト: `~/web-asset-scraper/projects/buttermax/`

---

## 1. 概要

カーソルがホバーした位置を中心に **3D 曲面に沿って金色のリング波が広がり、波の山の部分がモザイク状にグリッド化される**インタラクティブエフェクト。

- **元サイト**: https://buttermax.net/ ホームページ中央のデバイス（コントローラ等）
- **主要技術**: Position Map による 3D 空間距離計算 + UV 量子化（pixelation）+ sin 波 + 色加算
- **見た目**: ホバーすると曲面に同心円状の波紋がジワッと広がり、波の山だけがピクセル化され、オレンジ〜金色に光る

---

## 2. 仕組みの解説

### パイプライン

```
[入力]
  カーソル位置 (uClickUv) ─┐
  ピクセルの3D位置 (tPosition) ─┐
  経過時間 (uTime) ────────┐
                          ↓
① ホバー判定 (uInside > 0)
                          ↓
② カーソル位置の 3D 座標を取得 → 現在ピクセルと 3D 距離 (gradient)
                          ↓
③ gradient で sin 波 (pulse) を生成 → pow() で山を鋭くする
                          ↓
④ pulse の強さで UV を量子化（floor(uv * 400)/400）→ モザイク化
                          ↓
⑤ pulse の強さでオレンジ色を加算
                          ↓
[出力] 色付き・グリッド化されたピクセル
```

### 各ステップの本質

1. **ホバー判定**: `uInside` をホバーで 0→1 に lerp 補間 (0.08 速度)
2. **3D 距離計算**: 元コードでは `tPosition`（各ピクセルの 3D 位置を RGB エンコードした特殊テクスチャ）を使って、カーソル位置と現在ピクセルの**真の 3D 空間距離**を計算。これにより波が曲面に沿って広がる（screen 距離ではない）
3. **リング波**: `sin(distance * 15.0 - time)` で同心円状の波。`pow(pulse, 10.0)` で山を鋭くしてシャープなリングに
4. **UV 量子化**: 連続 UV と `floor(uv * 400) / 400` の量子化 UV を pulse で補間。波の山だけがブロック状になる（解像度は変わらず、サンプリング位置が階段状になる）
5. **色加算**: `vec3(1.0, 0.5, 0.0)` (オレンジ) を pulse の山に加算。背景の黄色と合わさって金色に見える

### 既知のアルゴリズム

- **Position Map / Geometry Buffer**: 3D エンジンの G-Buffer の一種を 2D 画像にベイクする手法。Active Theory 独自の「Motion Vector Layout」の一部
- **UV Quantization**: WebGL/Shadertoy 等で広く使われる pixelation 手法。`floor(uv * N) / N` で N×N グリッドにスナップ

---

## 3. 実装の前提条件 / 適用範囲

### 3-1. 必須インプット

| 要素 | 必要性 | 説明 |
|---|---|---|
| **ピクセル単位の 3D 位置情報** | ★ 必須 | 元: `tPosition` テクスチャ。代替: Three.js mesh の vertex position を varying で渡す |
| カーソル UV 座標 | ★ 必須 | ホバー位置 (0.0〜1.0) |
| ホバー状態フラグ | ★ 必須 | `uInside` (0 or 1、lerp 補間) |
| 経過時間 | ★ 必須 | 波の進行に使う |
| 元テクスチャ (diffuse) | 任意 | 何かしらの色を持つ画像。単色でもグラデでも OK |

シーン構成: 単一シーン、単一マテリアル。ポストプロセス不要。

ランタイム要件: WebGL1 でも動く（特殊な拡張不要）。

### 3-2. 適用可能なオブジェクト

| 対象 | 適用 | 理由 |
|---|---|---|
| **Three.js の 3D メッシュ** (sphere / plane / glb) | ✅ OK | vertex shader で `position` を varying として渡せば即対応 |
| Motion Vector Layout 風スプライト (元コード) | ✅ OK | 元の `tPosition` JPG をそのまま使える |
| 実写写真 1 枚 | 🟡 OK だが劣化 | depth 推定で擬似 position map を作る必要あり |
| 2D イラスト・SVG | 🟡 OK だが劣化 | 3D 位置が無いので波が 2D 平面で広がるだけ |
| 動画フレーム | ⚠️ 困難 | 動的に 3D 位置が変わるので毎フレ position map 生成が必要 |
| HTML 要素 (DOM) | ❌ 不可 | WebGL レンダリングが前提 |

### 3-3. 適用不可・苦手なケース

- **高解像度大画面 + モバイル**: `pixellation = 400` は細かい量子化で、画面全体に効くと GPU 負荷が高い
- **真の 3D 物理シミュ**: あくまで見た目だけ、当たり判定や物理計算には使えない
- **アクセシビリティ重視**: 全画面が点滅するように見える可能性、reduced motion 設定の考慮が必要
- **ホバーが無いデバイス (タッチ)**: タップで `uInside` を切り替えるか、常時 on にする工夫が必要

### 3-4. 代替手段 / 劣化版で動かす方法

| 制約 | 解決策 |
|---|---|
| position map が無い | `length(vUv - uClickUv)` で 2D 画面距離に切り替え（曲面に沿わなくなるが平面なら違和感なし） |
| 3D メッシュが用意できない | `<planeGeometry>` で平面 mesh + 2D 距離計算 |
| パフォーマンスが厳しい | `pixellation` を 100〜200 程度に下げる、`uPulseSharpness` を下げてエッジを甘くする |
| マウス無し | `onClick` / `onTap` で `uClickUv` を更新、`uInside` を一定時間 1 にする |

---

## 4. 必要なアセット（実装サンプル用）

### 元サイト
- `tDiffuse` (8x8 スプライトシート JPG, 約 1〜2MB)
- `tMotion` (オプティカルフロー JPG, RG channel)
- `tPosition` (3D 位置エンコード JPG, **このエフェクトのキー**)
- `tAlpha` (透明マスク JPG)
- `tData` / `tGlass` (本機能には不要、Buttermax の他エフェクト用)

ファイル名規則: `/assets/images/maps/{name}_{type}-{quality}.jpg`

### このサンプル実装で使うもの

**Three.js のメッシュ（sphere）を 3D オブジェクトとして使うので、追加のテクスチャは不要**。vertex shader で position を varying として渡す方式。

- 必要: なし（メッシュのみで完結）
- 任意: 表面のテクスチャ（無くても色がのる）

サンプルを Motion Vector Layout 方式で動かしたい場合は、Blender で:
1. 3D モデルを Y 軸回転で 64 フレームレンダリング
2. 各フレームのワールド座標 XYZ を RGB に encode してアトラス化
3. OpenCV `calcOpticalFlowFarneback` で motion vector を計算
4. アルファマスクを書き出し

---

## 5. コア実装の抜粋

### 5-1. ホバー判定とクリック位置の取得

出典: `src/original/compiled.vs` (ButtermaxVFX.fs 内 / 2826〜2831 行目)

```glsl
#test !Device.mobile
    if (uInside > 0.0) {
        // クリック位置をスプライトシート内の UV に変換
        vec2 clickUv = getSubUV(dimensions, uClickUv, index);
        vec2 clickUvNext = getSubUV(dimensions, uClickUv, index + 1.0);
        // ↑ MV Layout 用。3D メッシュで使う場合は vertex position をそのまま使えば不要
```

uniform:
- `uInside`: ホバー中なら 1.0、外れたら 0.0（JS 側で 0.08 lerp 補間）
- `uClickUv`: マウス UV 座標 (0.0〜1.0)

### 5-2. 3D 距離計算とリング波の生成

出典: `src/original/compiled.vs` (ButtermaxVFX.fs 内 / 2840〜2847 行目)

```glsl
// tPosition には各ピクセルの 3D 位置が RGB エンコードされている
clickPos = getMap(tPosition, blend, clickUv, clickUvNext, displacement, displacementNext);

// 3D 空間距離（screen 距離ではない、これが曲面に沿う波の正体）
gradient = length(position - clickPos.xyz) * mix(.35, 0.31, uSmall);
//                                              ↑ 0.35: 距離スケール。下げると波がゆっくり広がる

// sin 波を距離と時間から生成
pulse = sin(gradient * 15.0 - t + 3.8) * 0.5 + 0.5;
//                  ↑ 15.0: 波の密度（リングの間隔）
//                              ↑ 3.8: 初期位相オフセット
pulse = pow(pulse, 10.0);
//                ↑ 10.0: 山の鋭さ。下げるとブヨブヨ、上げるとエッジが薄く鋭く
```

### 5-3. 波の山で UV を量子化（モザイク化）

出典: `src/original/compiled.vs` (ButtermaxVFX.fs 内 / 2859〜2866 行目)

```glsl
float pixellation = 400.;
// ↑ 400: 量子化密度。低くするとモザイクが粗くなる
float maskAlpha = getMap(tAlpha, blend, subUv, subUvNext, displacement, displacementNext).r;
float uvMix = pulse * 3. + (1.0-v) * 50.0;
//                  ↑ 3.0: 波の山がどれだけ強くモザイク化に効くか
uvMix = mix(0.0, uvMix, maskAlpha);  // アルファマスク内だけ適用
uvMix *= step(0.02, uClickTime);     // ホバーしてから僅かに経過してから効果開始
uvMix *= 1.1;

// 連続 UV と量子化 UV を pulse の強さで補間
subUv = mix(subUv, floor(subUv * pixellation) / pixellation, uvMix);
//         ↑ 連続     ↑ 400×400 グリッドにスナップした量子化 UV
```

### 5-4. オレンジ色を pulse の山に加算

出典: `src/original/compiled.vs` (ButtermaxVFX.fs 内 / 2895〜2906 行目)

```glsl
vec3 pulseColor = vec3(0.);
#test !Device.mobile
    if (uInside > 0.) {
        pulse *= dot(color.rgb, vec3(1.)) * 0.5 + 0.5;  // 明るい部分でより強く
        pulseColor = rgb2hsv(vec3(1.0, 0.5, 0.0));      // ← オレンジ。黄色背景と合わさり金色に
        pulseColor.x += (-0.5 + smoothstep(0.4, 1.0, pulse)) * 0.1 - 0.08;  // 微妙な色相シフト
        pulseColor = hsv2rgb(pulseColor);
        pulseColor = pow(pulse, 3.0) * pulseColor;
        // sRGB → linear → 加算 → sRGB
        color.rgb = pow(color.rgb, vec3(2.2));
        color.rgb += pulseColor;
        color.rgb *= mix(1.0, 2.0, pow(pulse, 4.0));    // 山だけ明るくブースト
        color.rgb = pow(color.rgb, vec3(0.45));
    }
#endtest
```

---

## 6. 最小動作サンプル

React + Vite + Three.js + @react-three/fiber + @react-three/drei で完結する最小実装。3D メッシュ (sphere) を使って position map 不要で動かす版。

### `index.jsx`

```jsx
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const vertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;  // ローカル座標。元コード相当の役割
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */`
  uniform vec3 uClickPos;
  uniform float uInside;
  uniform float uTime;
  uniform float uPulseFrequency;
  uniform float uPulseSharpness;
  uniform float uPixellation;
  uniform float uUvMixMultiplier;
  uniform vec3 uPulseColor;
  uniform float uPulseIntensity;
  uniform vec3 uBaseColor;

  varying vec2 vUv;
  varying vec3 vPos;

  void main() {
    vec2 uv = vUv;

    // (5-2) 3D距離 → リング波
    float pulse = 0.0;
    if (uInside > 0.001) {
      float gradient = length(vPos - uClickPos) * 0.35;
      pulse = sin(gradient * uPulseFrequency - uTime + 3.8) * 0.5 + 0.5;
      pulse = pow(pulse, uPulseSharpness);
    }
    pulse *= uInside;

    // (5-3) UV量子化
    float uvMix = clamp(pulse * uUvMixMultiplier, 0.0, 1.0);
    uv = mix(uv, floor(uv * uPixellation) / uPixellation, uvMix);

    // ベース色（テクスチャの代わりに UV ベースのグラデーション）
    vec3 color = mix(uBaseColor, uBaseColor * 0.5, uv.y);

    // (5-4) オレンジ加算
    color = pow(color, vec3(2.2));
    color += uPulseColor * pulse * uPulseIntensity;
    color *= mix(1.0, 2.0, pow(pulse, 4.0));
    color = pow(color, vec3(0.45));

    gl_FragColor = vec4(color, 1.0);
  }
`

function HoverSphere() {
  const matRef = useRef()
  const targetInside = useRef(0)

  const uniforms = useMemo(() => ({
    uClickPos:        { value: new THREE.Vector3() },
    uInside:          { value: 0 },
    uTime:            { value: 0 },
    uPulseFrequency:  { value: 15.0 },   // 5-2: 波の密度
    uPulseSharpness:  { value: 10.0 },   // 5-2: 山の鋭さ
    uPixellation:     { value: 400.0 },  // 5-3: モザイク粒度
    uUvMixMultiplier: { value: 3.0 },    // 5-3: モザイク広がり強度
    uPulseColor:      { value: new THREE.Color('#ff8000') }, // 5-4: オレンジ
    uPulseIntensity:  { value: 0.8 },    // 5-4: 加算強度
    uBaseColor:       { value: new THREE.Color('#2a2a2a') },
  }), [])

  useFrame((state) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms
    u.uTime.value = state.clock.elapsedTime
    // (5-1) ホバー lerp: 0.08 で滑らかに 0↔1
    u.uInside.value += (targetInside.current - u.uInside.value) * 0.08
  })

  return (
    <mesh
      onPointerOver={() => { targetInside.current = 1 }}
      onPointerOut={() => { targetInside.current = 0 }}
      onPointerMove={(e) => {
        if (matRef.current) {
          // 交点のローカル座標を渡す（Three.js が world→local 変換は別途必要だが、
          // この sphere は world 原点なので localPoint == point でほぼ等価）
          matRef.current.uniforms.uClickPos.value.copy(e.point)
        }
      }}
    >
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}

export default function HoverGoldGrid() {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
      <ambientLight intensity={0.4} />
      <HoverSphere />
      <OrbitControls enableZoom={false} />
    </Canvas>
  )
}
```

これを `src/examples/hover-gold-grid/index.jsx` として配置すれば、showcase の `import.meta.glob` が拾ってホームに自動表示される。

---

## 7. パラメータ調整ガイド

| Uniform | 元の値 | 意味 | 弄ったらどうなるか |
|---|---|---|---|
| `uPulseFrequency` | 15.0 | リング波の密度 | 高い → 細かいリング、低い → 太い 1 本の波 |
| `uPulseSharpness` | 10.0 | sin 山の鋭さ (pow 値) | 高い → 薄く鋭いリング、低い → ブヨブヨ |
| `uPixellation` | 400.0 | UV 量子化グリッド数 | 低い → 粗いモザイク、高い → 細かい |
| `uUvMixMultiplier` | 3.0 | モザイク範囲の広がり | 高い → 波の山以外もモザイク化 |
| `uPulseColor` | #ff8000 | 加算色 | 黄色背景と合わさるなら金色、別背景なら別の色味で |
| `uPulseIntensity` | 0.8 | 色加算の強さ | 高い → 真っ赤に近づく、低い → 微妙な光沢のみ |
| ホバー lerp 速度 | 0.08 | uInside の追従速度 | 高い → スパッと切り替わる、低い → ゆっくりフェード |

---

## 8. 元コードからの逸脱 / 簡略化

このサンプルは元コードの **「Motion Vector Layout」全体を再現していない**。具体的に削った要素:

| 元コード | サンプル | 理由 |
|---|---|---|
| `tPosition` JPG から 3D 座標を取得 | vertex shader で `position` を varying で渡す | 3D メッシュを直接使えば map 不要、シンプル |
| `tDiffuse` のスプライトシート (8×8 フレーム) を `uProgress` で補間サンプリング | 単色グラデーション | 視差回転は別エフェクトなので分離 |
| `tMotion` (optical flow) によるフレーム間ブレンド | 無し | 上に同じく |
| `tGlass` / `tData` レイヤー合成 | 無し | 本機能には無関係 |
| `getMap()` ヘルパー (アトラスサンプル) | `texture2D` 直接 | 同上 |
| 色相シフト (`rgb2hsv` / `hsv2rgb` で 微妙にずらす) | コメントアウト | コア理解には不要 |
| `uClickTime` で「ホバー後の経過時間」管理 | `uInside` のみ | 簡略化 |
| `step(0.02, uClickTime)` で短い遅延を入れる | 無し | 同上 |
| Pulse の二重重ね合わせ (`pulse += pow(pulse, ...)`) | 単一 `pow` | 視覚的に十分近い |

### 完全再現したい場合の追加実装ヒント

1. **視差回転を足す**: `motion_vector_hover_PROMPT.md` を参照、サンプルに統合
2. **`tDiffuse` を入れる**: Blender で 64 フレームレンダリング → スプライトシート化
3. **二重 pulse**: `pulse = pow(p, 10) + pow(p, 30) * 0.5` のように山を多層化
4. **色相シフト**: HSV 空間で `+= 0.08 * smoothstep(0.4, 1.0, pulse)` を加える

---

## 9. 参考リンク

- **元サイト**: https://buttermax.net/
- **Active Theory**: https://activetheory.net/ （Hydra エンジン製作者）
- **元コード内の該当箇所**:
  - `src/original/compiled.vs` の `{@}ButtermaxVFX.fs{@}` セクション (2187〜3000 行目あたり)
  - `src/original/app.1717605496628.js` の `MotionVectorLayout` クラス (28642 行目〜)
- **関連手法**:
  - [Three.js Position Buffer / G-Buffer](https://threejs.org/examples/?q=mrt)
  - [WebGL Pixelation Tutorial (UV quantization)](https://thebookofshaders.com/) — 一般論
  - [PavelDoGreat / WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) — Buttermax の流体ロゴ歪みに関連

---

## 10. この showcase 実装での差分（§6 の最小サンプルからの変更）

### 常時発生する定常波 → イベントとしての波紋

元実装（および §6 のサンプル）は `sin(distance * freq - time)` を毎フレーム評価する
**定常波**で、ホバーしている間ずっと波が出続ける。ここでは波紋を個別の
イベントとして持ち、クリックした一点から 1 回だけ立ち上がるようにした。

```glsl
uniform vec3  uOrigins[MAX_RIPPLES];
uniform float uAges[MAX_RIPPLES];   // 経過秒。負なら空きスロット
```

JS 側で寿命を管理し、切れたら詰める。複数の波紋は加算ではなく `max` で合成するので、
重なっても飽和しない。

### 単発のリングではなく波列にする

イベント化したとき、最初は「1 本のリングが広がる」実装にしたが単調だった。
元実装のリッチさは**同心円が連続して広がる**ところにあるので、
波面の内側に波の列を並べる形に戻した。

```glsl
float behind = radius - d;                       // 波面からの距離
float wave = pow(sin(behind * uFrequency) * 0.5 + 0.5, uSharpness);
float front = smoothstep(0.0, uRingWidth, behind);      // 波面の外へは出さない
float tail  = exp(-max(behind, 0.0) * uTailFalloff);    // 内側の余韻
```

定常波の質感を保ちつつ、「1 回の衝撃から広がって消える」挙動になる。

### 緩急

等速で広がると機械的なので、飛び出しを速く、遠ざかるほど失速させる。

```glsl
float easeOutRipple(float t, float k) { return 1.0 - pow(1.0 - t, k); }
```

### モザイクを帯の芯だけに

`pulse` をそのまま UV 補間に使うと裾まで潰れる。`pow(pulse, uMosaicFocus)` で
芯に寄せてから掛けることで、光っている帯の中だけがブロックになる。

**モザイクは「ブロックの粗さ」ではなく「下地の細かさとの差」で見える。**
`pixellation` を上げる（＝ブロックを小さくする）だけでは、下地の模様が粗いと
量子化しても色が変わらず何も起きない。下地の `patternScale` とセットで詰める。

### 下地の手続き模様（[`pattern.js`](pattern.js)）

§8 の表にあるとおり、最小サンプルは `tDiffuse`（8×8 スプライトシートの写真）を
単色グラデーションに落としている。量子化するのは UV なので、その UV で引く「模様」が
無いとモザイク化が視覚的に成立しない。外部アセットを増やさずに済ませるため、
GLSL で 4 種（fBm / grid / voronoi / stripes）を生成している。

### 放置時の自動発生

カーソルが触れていない間は、一定間隔でランダムな頂点から波を出す。
全周から選ぶと半分は裏側で発生して縁にしか見えないので、カメラを向いている
頂点に絞っている。

### 元コードと意図的に変えた点

- **色相シフトの固定オフセット `-0.08` を外した。**
  元コードは sRGB 値に対して `rgb2hsv` しているが、three の color management 下では
  uniform の `THREE.Color` はリニア値で入るため hue の位置が異なる。固定オフセットを
  そのまま適用すると hue が負に回り込み、金色ではなくマゼンタになる。

- **手動ガンマ（`pow(2.2)` / `pow(0.45)`）を削除した。**
  同じくリニア前提のため二重変換になる。出力は `#include <colorspace_fragment>` に任せる。

- **波の到達距離は形状の実サイズに合わせる。** 半径 1 の球なら表面上の最大距離は 2。
  ここを超える値にすると、波が一瞬で通過しきって何も見えなくなる。
