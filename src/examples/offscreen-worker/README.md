# OffscreenCanvas Worker

同じシーンを左右で描く。

- 左 … メインスレッド（ふつうの three.js）
- 右 … Worker + OffscreenCanvas

`block now` を押すとメインスレッドを同期ループで占有する。
**左だけが固まり、右は回り続ける。** `Auto Stutter` variant では自動で繰り返す。

実測では メインが 5 fps まで落ちても、ワーカーは 115 fps を保つ。
「描画をメインから逃がす」効果が、説明なしで数字と絵の両方に出る。

## なぜこれが効くのか

ブラウザのメインスレッドは、DOM 操作・React の再レンダリング・レイアウト・
`JSON.parse`・画像デコードなど、あらゆるものと `requestAnimationFrame` を
**1 本のキューで奪い合う**。重い処理が 1 つ挟まるだけで描画は止まる。

キャンバスの制御をワーカーへ移してしまえば、描画ループは別スレッドで回る。
メインが何をしていようと関係なくなる。

実案件で効くのは、たとえばこういう場面。

- スクロール連動サイトで、DOM の計測と 3D 描画が競合する
- 大きな JSON を読み込む瞬間だけ 3D がカクつく
- 広告タグやアナリティクスがメインを掴む

## 仕組み

```js
const offscreen = canvas.transferControlToOffscreen()
worker.postMessage({ type: 'init', canvas: offscreen, width, height, dpr }, [offscreen])
```

`transferControlToOffscreen()` した時点で、そのキャンバスは**メインからは描けなくなる**。
所有権が移るので、以後のやり取りは `postMessage` だけ。

ワーカーには `requestAnimationFrame` がある（`DedicatedWorkerGlobalScope`）。
描画ループはそのままワーカー内に置ける。

## 実装メモ

- **ワーカーには `document` も `window` も無い。**
  `WebGLRenderer` にキャンバスを渡さないと three が `document.createElement` を呼んで落ちる。
  ピクセル比も `window.devicePixelRatio` を読めないので、数値で送る。
- R3F は使わない。上記の理由で three を直接叩く必要があり、
  それなら左右で同じ `scene.js` を共有した方が比較として正しい。
- **サイズが確定してからワーカーを起こす。**
  `ResizeObserver` の初回が来る前に早期 return しつつ、その条件を依存配列に入れ忘れると、
  一度弾かれたきり二度と起きない。0 fps のまま何も出ない。
- 一度 transfer したキャンバスは再利用できない。作り直すときは React の `key` を変えて
  DOM ごと差し替える。
- ブロックは `while (performance.now() < until) {}` の同期ループで作る。
  `setTimeout` では詰まらないので比較にならない。

## 限界

- **入力は自前で橋渡しが要る。** ワーカーはイベントを直接受け取れないので、
  pointer 系はメインで拾って `postMessage` する。この example は入力を使わないので省いている。
- ワーカーの起動と初期化ぶん、最初のフレームは遅れる。
- Safari は 16.4 で OffscreenCanvas の WebGL に対応した。それ以前は非対応なので、
  メインスレッド描画へ落とす分岐が要る（この example は非対応表示のみ）。

## 操作

- `block now` でメインスレッドを故意に固める
- `duration` でブロック時間、`auto` で自動繰り返し
- `count` を上げると両方が重くなる（`Heavy Scene` variant）
