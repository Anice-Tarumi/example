import { useControls, folder, button } from 'leva'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createScene } from './scene'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/**
 * 同じシーンを左右で描く。
 *   左 … メインスレッド（ふつうの three.js）
 *   右 … Worker + OffscreenCanvas
 *
 * メインスレッドを故意に固めると、左だけが止まって右は回り続ける。
 * 「描画をメインから逃がす」効果が、説明なしで目に見える。
 *
 * R3F は使わない。ワーカーには `document` が無いので three を直接叩く必要があり、
 * それなら左右で同じコード（`scene.js`）を共有した方が比較として正しい。
 */

const supportsOffscreen =
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'

/** キャンバスの実サイズを測って返す。ワーカーへは数値でしか渡せない */
function useSize(ref) {
  const [size, setSize] = useState({ w: 1, h: 1 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setSize({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

function Panel({ label, tone, fps, children }) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%' }}>
      {children}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: '6px 10px',
          borderRadius: 6,
          font: '500 12px ui-monospace, monospace',
          letterSpacing: '0.04em',
          color: tone,
          background: 'rgba(8,11,18,0.72)',
          border: `1px solid ${tone}33`,
          pointerEvents: 'none',
        }}
      >
        {label} · {fps.toFixed(0)} fps
      </div>
    </div>
  )
}

export default function OffscreenWorker() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const blockRef = useRef(DEFAULTS.blockMs)

  const [params, setParams] = useControls(() => ({
    Scene: folder({
      count: { value: DEFAULTS.count, min: 200, max: 4000, step: 100 },
      spin: { value: DEFAULTS.spin, min: 0, max: 2, step: 0.02 },
      metalness: { value: DEFAULTS.metalness, min: 0, max: 1, step: 0.02 },
      roughness: { value: DEFAULTS.roughness, min: 0.05, max: 1, step: 0.02 },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
    Block: folder({
      blockMs: { value: DEFAULTS.blockMs, min: 100, max: 3000, step: 50, label: 'duration' },
      autoBlock: { value: DEFAULTS.autoBlock, label: 'auto' },
      autoInterval: { value: DEFAULTS.autoInterval, min: 0.8, max: 8, step: 0.1, label: 'every' },
      'block now': button(() => {
        // 同期ループでメインスレッドを占有する。setTimeout では詰まらない
        const until = performance.now() + blockRef.current
        // eslint-disable-next-line no-empty
        while (performance.now() < until) {}
      }),
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  useEffect(() => {
    blockRef.current = params.blockMs
  }, [params.blockMs])

  // ---- メインスレッド側 ----
  const mainWrap = useRef(null)
  const mainCanvas = useRef(null)
  const mainSize = useSize(mainWrap)
  const [mainFps, setMainFps] = useState(0)
  const mainApi = useRef(null)

  useEffect(() => {
    const canvas = mainCanvas.current
    if (!canvas || mainSize.w < 2) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const api = createScene({
      canvas,
      width: mainSize.w,
      height: mainSize.h,
      dpr,
      count: params.count,
    })
    mainApi.current = api

    let raf = 0
    let frames = 0
    let mark = performance.now()

    const loop = (now) => {
      api.render(now / 1000)
      frames++
      if (now - mark >= 500) {
        setMainFps((frames * 1000) / (now - mark))
        frames = 0
        mark = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      api.dispose()
      mainApi.current = null
    }
    // count を変えたらシーンごと作り直す
  }, [params.count, mainSize.w, mainSize.h])

  useEffect(() => {
    mainApi.current?.setParams(params)
  }, [params])

  useEffect(() => {
    if (mainSize.w < 2) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    mainApi.current?.resize(mainSize.w, mainSize.h, dpr)
  }, [mainSize])

  // ---- ワーカー側 ----
  const workerWrap = useRef(null)
  const workerCanvas = useRef(null)
  const workerSize = useSize(workerWrap)
  const [workerFps, setWorkerFps] = useState(0)
  const worker = useRef(null)

  // サイズが確定してから 1 度だけ起こす。
  // 依存に入れずに早期 return すると、初回で弾かれたきり二度と起きない
  const workerReady = supportsOffscreen && workerSize.w > 2 && workerSize.h > 2

  useEffect(() => {
    const canvas = workerCanvas.current
    if (!canvas || !workerReady) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = new Worker(new URL('./render.worker.js', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e) => {
      if (e.data.type === 'fps') setWorkerFps(e.data.value)
      else if (e.data.type === 'error') console.error('[worker init]', e.data.message)
    }
    w.onerror = (e) => console.error('[worker]', e.message || e)
    w.onmessageerror = (e) => console.error('[worker msg]', e)

    // 一度 transfer したキャンバスは main から描けない。key で作り直す前提
    const offscreen = canvas.transferControlToOffscreen()
    w.postMessage(
      {
        type: 'init',
        canvas: offscreen,
        width: workerSize.w,
        height: workerSize.h,
        dpr,
        count: params.count,
      },
      [offscreen],
    )

    return () => {
      w.postMessage({ type: 'stop' })
      w.terminate()
      worker.current = null
    }
    // サイズの変化は init 後に resize メッセージで送る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.count, workerReady])

  useEffect(() => {
    if (workerSize.w < 2) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    worker.current?.postMessage({ type: 'resize', width: workerSize.w, height: workerSize.h, dpr })
  }, [workerSize])

  useEffect(() => {
    worker.current?.postMessage({ type: 'params', params })
  }, [params])

  // ---- 自動ブロック ----
  const blockNow = useCallback((ms) => {
    const until = performance.now() + ms
    // eslint-disable-next-line no-empty
    while (performance.now() < until) {}
  }, [])

  useEffect(() => {
    if (!params.autoBlock) return
    const id = setInterval(() => blockNow(params.blockMs), params.autoInterval * 1000)
    return () => clearInterval(id)
  }, [params.autoBlock, params.autoInterval, params.blockMs, blockNow])

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: params.background }}>
      <Panel label="MAIN THREAD" tone="#ff8a6b" fps={mainFps}>
        <div ref={mainWrap} style={{ width: '100%', height: '100%' }}>
          <canvas
            key={`m-${params.count}`}
            ref={mainCanvas}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      </Panel>

      <div style={{ width: 1, background: 'rgba(255,255,255,0.14)' }} />

      <Panel label={supportsOffscreen ? 'WORKER' : 'WORKER (未対応)'} tone="#6bd8ff" fps={workerFps}>
        <div ref={workerWrap} style={{ width: '100%', height: '100%' }}>
          <canvas
            key={`w-${params.count}`}
            ref={workerCanvas}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      </Panel>
    </div>
  )
}
