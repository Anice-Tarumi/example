import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { viewsVertexShader, viewsFragmentShader } from './glsl/views'
import {
  lenticularVertexShader,
  lenticularFragmentShader,
  edgeFragmentShader,
} from './glsl/lenticular'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'
import bgUrl from './assets/layer-a-bg.jpg?url'
import jellyUrl from './assets/layer-b-jelly.png?url'
import fishUrl from './assets/layer-c-fish.png?url'
import kelpUrl from './assets/layer-d-kelp.png?url'

/**
 * レンチキュラーのカード。
 *
 * 触って楽しい所を軸に組んだ。**傾ける → 中身が動く → 端まで倒すと
 * 隠し絵が出る**。この 3 段があると人は最後まで倒す。
 *
 * 手応えを合わせるために、**視線角は外から与えず実際の視線から出す**。
 * カードの回転とカメラの位置から計算するので、傾けた量と見え方が必ず
 * 一致する。角度をパラメータで渡すと、動きと絵がずれて嘘になる。
 *
 * 絵は起動時に 1 回だけ焼く。レンチキュラーは**印刷物が動かない**のが
 * 本質で、毎フレーム描き直すとただの視差になる。
 */

/** カードの寸法。名刺より少し大きい比率 */
const CARD_W = 3.2
const CARD_H = 2.0
const CARD_T = 0.055
const CARD_R = 0.13

/** アトラスの並び。列 x 行 = 焼く枚数 */
const GRID = new THREE.Vector2(6, 4)
/** コマ 1 枚の解像度 */
const TILE = 384

/**
 * 層の絵を読む。
 *
 * **色空間を明示する。** 既定のままだと線形として扱われて、
 * 焼いた絵が沈む。絵は sRGB で描かれている。
 */
function useLayers() {
  const [maps, setMaps] = useState(null)
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    let alive = true
    Promise.all([bgUrl, jellyUrl, fishUrl, kelpUrl].map((u) => loader.loadAsync(u)))
      .then((list) => {
        if (!alive) return
        for (const t of list) {
          t.colorSpace = THREE.SRGBColorSpace
          // ずらして引くので、外側は端の色で埋める
          t.wrapS = THREE.ClampToEdgeWrapping
          t.wrapT = THREE.ClampToEdgeWrapping
          t.minFilter = THREE.LinearMipmapLinearFilter
          t.generateMipmaps = true
        }
        setMaps(list)
      })
      .catch((e) => console.warn('[lenticular] 層の絵を読めなかった:', e))
    return () => { alive = false }
  }, [])
  return maps
}

/** 角丸のカード。厚みを持たせる。板紙に見せるには側面が要る */
function useCardGeometry() {
  return useMemo(() => {
    const shape = new THREE.Shape()
    const w = CARD_W / 2
    const h = CARD_H / 2
    const r = CARD_R
    shape.moveTo(-w + r, -h)
    shape.lineTo(w - r, -h)
    shape.quadraticCurveTo(w, -h, w, -h + r)
    shape.lineTo(w, h - r)
    shape.quadraticCurveTo(w, h, w - r, h)
    shape.lineTo(-w + r, h)
    shape.quadraticCurveTo(-w, h, -w, h - r)
    shape.lineTo(-w, -h + r)
    shape.quadraticCurveTo(-w, -h, -w + r, -h)

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: CARD_T, bevelEnabled: false, curveSegments: 12,
    })
    geo.translate(0, 0, -CARD_T / 2)
    geo.computeVertexNormals()

    /*
     * **UV を貼り直す。** `ExtrudeGeometry` の既定は
     * `WorldUVGenerator` で、シェイプの座標をそのまま uv に入れる。
     * つまり 0〜1 ではなく -1.6〜1.6 が入り、レンズの割り付けが壊れる。
     */
    const pos = geo.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / CARD_W + 0.5
      uv[i * 2 + 1] = pos.getY(i) / CARD_H + 0.5
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))

    /*
     * 表と側面でマテリアルを分ける。**表だけレンズにする。**
     * 側面までレンズにすると、細い面に縞が詰まって点滅する。
     * `ExtrudeGeometry` は 0 番が前後の面、1 番が側面。
     */
    return geo
  }, [])
}

function Card({ params, tiltRef }) {
  const { gl } = useThree()
  const group = useRef(null)
  const layers = useLayers()
  const geometry = useCardGeometry()
  useEffect(() => () => geometry.dispose(), [geometry])

  /*
   * サブ画像のアトラス。**焼き直すのは焼きの設定を変えたときだけ。**
   * 毎フレーム焼くと、レンチキュラーではなく単なる視差になるうえ重い。
   */
  const atlas = useFBO(TILE * GRID.x, TILE * GRID.y, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  })

  const bakeUniforms = useMemo(() => ({
    tA: { value: null },
    tB: { value: null },
    tC: { value: null },
    tD: { value: null },
    uGrid: { value: GRID.clone() },
    uViews: { value: DEFAULTS.views },
    uMaxAngle: { value: THREE.MathUtils.degToRad(DEFAULTS.maxAngle) },
    uParallax: { value: DEFAULTS.parallax },
    uLightSwing: { value: DEFAULTS.lightSwing },
  }), [])

  const bakeQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
    vertexShader: viewsVertexShader,
    fragmentShader: viewsFragmentShader,
    uniforms: bakeUniforms,
    depthTest: false,
    depthWrite: false,
  })), [bakeUniforms])
  useEffect(() => () => bakeQuad.dispose(), [bakeQuad])

  /*
   * 焼きの設定が変わったときだけ焼く。**毎フレーム焼かない。**
   * レンチキュラーは印刷物が動かないのが本質で、焼き直すとただの視差になる。
   */
  useEffect(() => {
    if (!layers) return
    bakeUniforms.tA.value = layers[0]
    bakeUniforms.tB.value = layers[1]
    bakeUniforms.tC.value = layers[2]
    bakeUniforms.tD.value = layers[3]
    bakeUniforms.uViews.value = Math.min(params.views, GRID.x * GRID.y)
    bakeUniforms.uMaxAngle.value = THREE.MathUtils.degToRad(params.maxAngle)
    bakeUniforms.uParallax.value = params.parallax
    bakeUniforms.uLightSwing.value = params.lightSwing
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(atlas)
    bakeQuad.render(gl)
    gl.setRenderTarget(prev)
  }, [gl, atlas, bakeQuad, bakeUniforms, layers, params.views, params.maxAngle,
    params.parallax, params.lightSwing])

  const uniforms = useMemo(() => ({
    tViews: { value: atlas.texture },
    uGrid: { value: GRID.clone() },
    uViews: { value: DEFAULTS.views },
    uMaxAngle: { value: THREE.MathUtils.degToRad(DEFAULTS.maxAngle) },
    uLenses: { value: DEFAULTS.lenses },
    uFocal: { value: DEFAULTS.focal },
    uBleed: { value: DEFAULTS.bleed },
    uAberration: { value: DEFAULTS.aberration },
    uRidge: { value: DEFAULTS.ridge },
    uSheen: { value: DEFAULTS.sheen },
    uGrain: { value: DEFAULTS.grain },
    uShowPrint: { value: 0 },
    uTime: { value: 0 },
  }), [atlas])

  const faceMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: lenticularVertexShader,
    fragmentShader: lenticularFragmentShader,
    uniforms,
  }), [uniforms])
  useEffect(() => () => faceMat.dispose(), [faceMat])

  const edgeUniforms = useMemo(() => ({ uColor: { value: new THREE.Color('#9aa7bd') } }), [])
  const edgeMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: lenticularVertexShader,
    fragmentShader: edgeFragmentShader,
    uniforms: edgeUniforms,
  }), [edgeUniforms])
  useEffect(() => () => edgeMat.dispose(), [edgeMat])

  useFrame((state, delta) => {
    uniforms.uViews.value = Math.min(params.views, GRID.x * GRID.y)
    uniforms.uMaxAngle.value = THREE.MathUtils.degToRad(params.maxAngle)
    uniforms.uLenses.value = params.lenses
    uniforms.uFocal.value = params.focal
    uniforms.uBleed.value = params.bleed
    uniforms.uAberration.value = params.aberration
    uniforms.uRidge.value = params.ridge
    uniforms.uSheen.value = params.sheen
    uniforms.uGrain.value = params.grain
    uniforms.uShowPrint.value = params.showPrint ? 1 : 0
    uniforms.uTime.value = state.clock.elapsedTime

    const g = group.current
    if (!g) return
    const t = tiltRef.current
    const dt = Math.min(delta, 1 / 20)
    /*
     * 追従は遅らせる。**直に入れると手に張り付いて物に見えない。**
     * 重さがあるから、少し遅れて止まる。
     */
    const k = Math.min(1, dt * 7)
    g.rotation.y += (t.x * params.tilt - g.rotation.y) * k
    g.rotation.x += (t.y * params.tilt * 0.55 - g.rotation.x) * k
    // ごく弱く漂わせる。完全な静止は画像に見える
    const e = state.clock.elapsedTime
    g.position.y = Math.sin(e * 0.6) * 0.02
    g.rotation.z = Math.sin(e * 0.43) * 0.012
  })

  return (
    <group ref={group}>
      {/* 0 番が前後の面、1 番が側面。表だけレンズにする */}
      <mesh geometry={geometry} material={[faceMat, edgeMat]} />
    </group>
  )
}

/** ポインタと、端末の傾き。両方を 1 つの値に束ねる */
function useTilt(enableGyro) {
  const tilt = useRef({ x: 0, y: 0 })
  const [gyroReady, setGyroReady] = useState(false)

  useEffect(() => {
    /*
     * **キャンバスの矩形で測る。** 窓基準にすると、サイドバーのぶん
     * 中心がずれて、正面を向いた状態にできない。
     */
    const onMove = (e) => {
      const el = document.querySelector('.stage__canvas canvas') || document.querySelector('canvas')
      const r = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
      tilt.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
      tilt.current.y = ((e.clientY - r.top) / r.height) * 2 - 1
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    if (!enableGyro || !gyroReady) return
    const onOrient = (e) => {
      /*
       * `gamma` が左右の傾き、`beta` が前後。**生の角度をそのまま
       * 使わない。** 手に持った端末は常に少し傾いているので、
       * 扱いやすい範囲へ写す。
       */
      const g = THREE.MathUtils.clamp((e.gamma ?? 0) / 35, -1, 1)
      const b = THREE.MathUtils.clamp(((e.beta ?? 45) - 45) / 35, -1, 1)
      tilt.current.x = g
      tilt.current.y = b
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [enableGyro, gyroReady])

  /*
   * iOS は**ユーザー操作の中で**許可を取らないと傾きが来ない
   * （Safari 13 以降）。自動では有効にできないので、ボタンを出す。
   */
  const needsPermission = typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function'

  const requestGyro = async () => {
    if (!needsPermission) { setGyroReady(true); return }
    try {
      const res = await DeviceOrientationEvent.requestPermission()
      setGyroReady(res === 'granted')
    } catch {
      setGyroReady(false)
    }
  }

  return { tilt, gyroReady, needsPermission, requestGyro }
}

export default function LenticularCard() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Lens: folder({
      lenses: { value: DEFAULTS.lenses, min: 8, max: 200, step: 1, label: 'lenses' },
      focal: { value: DEFAULTS.focal, min: 0, max: 3, step: 0.02, label: 'focal / pitch' },
      bleed: { value: DEFAULTS.bleed, min: 0, max: 1, step: 0.02, label: 'ghosting' },
      aberration: { value: DEFAULTS.aberration, min: 0, max: 2, step: 0.02, label: 'chromatic' },
      ridge: { value: DEFAULTS.ridge, min: 0, max: 1, step: 0.02, label: 'ridge' },
      sheen: { value: DEFAULTS.sheen, min: 0, max: 2, step: 0.05, label: 'gloss' },
      grain: { value: DEFAULTS.grain, min: 0, max: 0.4, step: 0.01, label: 'grain' },
      showPrint: { value: DEFAULTS.showPrint, label: 'lens off (print)' },
    }),
    Print: folder({
      views: { value: DEFAULTS.views, min: 2, max: 24, step: 1, label: 'sub images' },
      maxAngle: { value: DEFAULTS.maxAngle, min: 6, max: 45, step: 1, label: 'angle range' },
      parallax: { value: DEFAULTS.parallax, min: 0, max: 1.2, step: 0.02, label: 'parallax' },
      lightSwing: { value: DEFAULTS.lightSwing, min: 0, max: 1.5, step: 0.05, label: 'light swing' },
    }),
    Feel: folder({
      tilt: { value: DEFAULTS.tilt, min: 0, max: 2, step: 0.05, label: 'tilt' },
      gyro: { value: DEFAULTS.gyro, label: 'use gyro' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  const { tilt, gyroReady, needsPermission, requestGyro } = useTilt(params.gyro)

  return (
    <>
      <Canvas camera={{ position: [0, 0, 5.1], fov: 34 }} dpr={[1, 2]}>
        <color attach="background" args={[params.background]} />
        <Card params={params} tiltRef={tilt} />
      </Canvas>

      {/*
        * 傾きの許可。**自動では取れない。** iOS は必ずユーザー操作の中で
        * 呼ぶ決まりなので、押させる以外の方法が無い。
        */}
      {params.gyro && needsPermission && !gyroReady && (
        <button
          type="button"
          onClick={requestGyro}
          style={{
            position: 'absolute', left: '50%', bottom: '1.6rem', transform: 'translateX(-50%)',
            padding: '0.6rem 1.1rem', borderRadius: '999px', zIndex: 3,
            border: '1px solid rgba(255,255,255,.25)', background: 'rgba(12,14,18,.7)',
            color: '#e8ecf4', font: 'inherit', fontSize: '.85rem', cursor: 'pointer',
          }}
        >
          端末を傾けて見る（センサーを許可）
        </button>
      )}
    </>
  )
}
