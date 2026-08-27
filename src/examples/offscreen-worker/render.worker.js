import { createScene } from './scene'

/**
 * ワーカー側の描画ループ。
 *
 * メインスレッドから `transferControlToOffscreen()` したキャンバスを受け取り、
 * あとはここで完結する。メインが詰まっても、このループは止まらない。
 *
 * `requestAnimationFrame` はワーカーにも存在する（DedicatedWorkerGlobalScope）。
 * 無い環境向けに setTimeout へ落とす。
 */

let sceneApi = null
let running = false
let frames = 0
let fpsMark = 0

const raf =
  typeof self.requestAnimationFrame === 'function'
    ? self.requestAnimationFrame.bind(self)
    : (cb) => setTimeout(() => cb(performance.now()), 16)

function loop(now) {
  if (!running) return
  sceneApi.render(now / 1000)

  // 実測 fps をメインへ返す。止まっていないことを数字でも示す
  frames++
  if (now - fpsMark >= 500) {
    self.postMessage({ type: 'fps', value: (frames * 1000) / (now - fpsMark) })
    frames = 0
    fpsMark = now
  }

  raf(loop)
}

self.onmessage = (e) => {
  const msg = e.data

  if (msg.type === 'init') {
    try {
      sceneApi = createScene({
        canvas: msg.canvas,
        width: msg.width,
        height: msg.height,
        dpr: msg.dpr,
        count: msg.count,
      })
      running = true
      fpsMark = performance.now()
      raf(loop)
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) })
    }
    return
  }

  if (!sceneApi) return

  if (msg.type === 'resize') sceneApi.resize(msg.width, msg.height, msg.dpr)
  else if (msg.type === 'params') sceneApi.setParams(msg.params)
  else if (msg.type === 'stop') {
    running = false
    sceneApi.dispose()
    sceneApi = null
  }
}
