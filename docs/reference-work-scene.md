# 参考実装の調査記録 — Active Theory / Work 一覧

`~/web-asset-scraper` で取得した `compiled.vs` / `uil.json` / `app.js` を展開して読んだ結果。
**推測は書かない。** 出典（ファイルと識別子）を必ず添える。

一度、シェーダー 1 本（`WorkPanelShader.glsl`）だけ読んで実装して外した。
一覧の板はそれではない。以下が実際の構成。

---

## 1. 場面の構成（`uil.json`）

| 要素 | シェーダー | 位置 / 大きさ |
|---|---|---|
| `Element_1_Work` | `WorkItemShader` | scale `[4, 2.6, 1]`、rotation `[0,0,180]` — **板** |
| `Element_3_Work` | `WorkItemUIShader` | scale `[4, 2, 1]` — 文字を焼いた板 |
| `Element_4_Work` | — | pos `[0,-1,0]`、scale `[0.02, 2, 0.02]` — 細い縦棒 |
| `Element_5_Work` | — | pos `[0, 3.446, 0]`、scale 3.5 |
| `Element_8_Work` | `ChainShader` | pos `[0, 3, 0]`、scale 2 — **クロムの塊** |
| `P_Element_6_Work` | `FlowerParticleShader` | pos `[0,-4.5,0]`、scale `[0.38,0.38,0.6]` — **粒子** |
| カメラ | — | fov 35、local pos `[0,0,2]`、**rotation `[0, 196.07, 0]`**、lerp 0.07 |

粒子数 `work_page_config_particleCount = 150000`、体積 `[-1,1] x [-1,1] x [-0.5,0.5]`。

## 2. 板の配置（`app.js` / `WorkItems.positionViews`）

**平らな横並びではない。下降する螺旋。**

```js
const step = mobile ? radians(35) : radians(50)
const total = Math.min(7, views.length)
const yStep = mobile ? 0.16 * total : 0.12 * total
let angle = 0
views.forEach((view, i) => {
  view.group.position.x = 3.8 * Math.cos(angle)
  view.group.position.z = 3.8 * Math.sin(angle)
  const pos = view.group.position.clone().multiplyScalar(2)
  view.group.lookAt(pos)            // Object3D.lookAt は +Z を対象の逆へ向ける
  angle -= step
  view.group.position.y = -yStep * i
  // カメラ目標 = pos（半径 7.6）、向きは板と同じ quaternion
})
```

スクロールで `_cameraTargets` の間を position は lerp、quaternion は slerp（毎フレーム 0.2）。
カメラ自身の `rotation [0, 196.07, 0]` は **180° + 16°** で、外を向いた group の中で
振り返って板を見るための値。

## 3. 板のシェーダー（`WorkItemShader.glsl`）

**MRT。2 枚の的へ同時に書く。**

```glsl
#drawbuffer Color          gl_FragColor = color;
#drawbuffer WorkRefraction gl_FragColor = refractionOut;   // 裏面のみ。表面は 0
```

- 両面描画。`normal.z < 0.0` で `vBackface = 1.0`、`vUv.x` を反転
- `vSide = abs(normal.x)` → 側面を持ち上げる `color *= 1.0 + pow(vSide, 3.0)`
- **屈折**は `tRefraction`（= `WorkRefraction` バッファ）を `radialBlur(tRefraction, ruv, 5.0, 5.0)`
  で引く。`ruv` は画面座標を法線マップと `uHover` とマウスでずらしたもの
- 環境反射 `envColorEquiRGB(tEnv, vRefraction, 0.2, 0.05) * 0.08`（等距円筒の `work/env1.jpg`）
- 法線マップは `waternormals.jpg`、`cnoise` で動かす
- 映像 `tVideo` と静止画 `tMap` を `uVideoBlend` で混ぜる。
  **UV は板の uv と画面座標を 0.3 で混ぜている**（`videoUV = mix(videoUV, scaleUV(gl_FragCoord.xy/resolution, vec2(0.6)), 0.3)`）
- 色は**黒から足していく**。`color.rgb += video * 0.45`、`+= refraction * ...`、
  `blendSoftLight(color, video, ...)`、`blendAdd(color, uColor, ...)`（マウス位置が中心）
- 頂点でせん断 `pos.y -= pos.x * 0.08`、うねり `pos.z += sin(time*0.5 + abs(0.5-pos.x)*3.0)*0.1`

uil の値: `uFresnelPow 1` / `uRefractionRatio 1` / `uDistortStrength 0`。

## 4. 粒子（`FlowerParticleShader.glsl`）

- **粒子も `WorkRefraction` へ書く。** だからガラス越しに見える中身は
  「粒子 + 板の裏面」であって、背景や筒ではない
- 色は `tPointColor`（粒ごとの色）に **matcap（`matcap3.png`）を soft-light と overlay で
  重ねて**、HSV で色相をずらす。**彩度はここから来ている**
- `gl_PointSize = 0.0275 * DPR * 2.0 * vScale * (1000.0 / length(mvPosition))`

`ChainShader` も同様に両方の的へ書き、`tRefraction` を `uReflection.y` で足す。

## 5. 一覧ページの合成（`WorkComposite.fs`）

**ここは遷移だけ。** `uTransition` が 0 か 1 のときは単に `tDiffuse` か `tDetail` を出す。
間のときだけ fbm の円形ワイプ。ブルームとコントラストの行は**コメントアウト済み**。

一覧の見た目を作っているのは次の `GlobalComposite.fs`。

## 6. 全ページ共通の合成（`GlobalComposite.fs`）

これが「高そうに見える」ところの正体。

1. **フロスト。** 繰り返しの法線マップ（`damaged_road_normal.png`、`uNormalScale = 3`）で
   画面全体の UV をずらす。右上隅が強い。`sin(time - length*30.0 + uScroll*5.0)` で脈打つ
2. **RGB ずらし** `getRGB(tDiffuse, uv, radians(120.0), ...)`
3. `adjustContrast(color, uContrast.x, uContrast.y)`
4. **隅のグラデーション。** `vec3(0.5,0.5,1.0)` を HSV にして
   `hue += cnoise(squareUV*0.65 - time*0.04)*0.065 + 0.88` → **色相がゆっくり動く**。
   `blendAdd(color, gradient, 0.05 + pow(cornerNoise * gNoise, 2.0))`
5. `color += pow(getUnrealBloom(uv), vec3(1.8))`
6. **粒子ノイズを 15% でオーバーレイ** `blendOverlay(color, vec3(getNoise(vUv, time)), 0.15)`

ブルームの値（work）: strength 0.5 / radius 0.5 / luminosityThreshold **0**。
全体ブルーム: strength 0.3 / radius 0.2 / threshold 0。

## 7. こちらへ移せない物

- 映像・実写スキャン（顧客素材）
- `env1.jpg` / `matcap3.png` / `damaged_road_normal.png`（配布物）

→ 環境マップと法線マップは**手続きで焼く**（`matcap-material` で matcap を焼いたのと同じ手）。
