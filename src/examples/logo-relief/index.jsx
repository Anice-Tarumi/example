import { Canvas, useFrame } from '@react-three/fiber'
import { useControls, folder, button } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import iconUrl from '../../assets/brand/icon.png'
import { plasterVertexShader, plasterFragmentShader } from '../../shared/glsl/plaster'
import { createHeightField } from '../relief-field/heightField'
import { bakeLogoHeight } from './logoHeight'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

/*
 * relief-field より高い。あちらは球の当たり判定に使うだけなので粗くてよいが、
 * こちらは**文字の形が読めないと成立しない**。384 でも step は 2ms 前後。
 */
const FIELD = 384
const PLANE_W = 4.8
const PLANE_H = 2.7

/**
 * 石膏の壁をこすると、中からロゴが浮き上がる。
 *
 * 高さ場に直接ブラシを置くのではなく、**露出度**を塗る。
 * 実際の高さは `露出度 × ロゴの高さ場` なので、
 * どれだけこすってもロゴの形からはみ出さない。
 *
 * ロゴの高さ場は距離変換でベベルを付けて焼く。マスクをそのまま高さにすると
 * 縁が垂直に切り立ち、法線が破綻して「紙を貼った」ようになる。
 */
function Wall({ params, logo }) {
  // ここに塗るのは高さではなく露出度（0..1）
  const reveal = useMemo(() => createHeightField(FIELD), [])
  useEffect(() => () => reveal.dispose(), [reveal])

  // 実際に描画へ渡す高さ場。露出度とロゴの積
  const height = useMemo(() => {
    const data = new Float32Array(FIELD * FIELD)
    const tex = new THREE.DataTexture(data, FIELD, FIELD, THREE.RedFormat, THREE.FloatType)
    tex.minFilter = tex.magFilter = THREE.LinearFilter
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.needsUpdate = true
    return { data, tex }
  }, [])
  useEffect(() => () => height.tex.dispose(), [height])

  const prevUv = useRef(null)

  const uniforms = useMemo(
    () => ({
      uHeight: { value: height.tex },
      uTexel: { value: new THREE.Vector2(1 / FIELD, 1 / FIELD) },
      uHeightScale: { value: DEFAULTS.heightScale },
      uLightDir: { value: new THREE.Vector3(-0.6, 0.6, 0.5) },
      uBaseColor: { value: new THREE.Color(DEFAULTS.baseColor) },
      uAmbient: { value: DEFAULTS.ambient },
      uShadow: { value: DEFAULTS.shadow },
      uCavity: { value: DEFAULTS.cavity },
      uMicro: { value: DEFAULTS.micro },
      uSpecular: { value: DEFAULTS.specular },
    }),
    [height],
  )

  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: plasterVertexShader, fragmentShader: plasterFragmentShader, uniforms }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  const paint = (e) => {
    if (!e.uv) return
    const prev = prevUv.current
    if (prev) reveal.stampLine(prev.x, prev.y, e.uv.x, e.uv.y, params.brushRadius, params.brushStrength)
    else reveal.stamp(e.uv.x, e.uv.y, params.brushRadius, params.brushStrength * 0.3)
    prevUv.current = { x: e.uv.x, y: e.uv.y }
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    // 露出度は 0..1。clamp なので二度掛けても値が動かない
    reveal.step(dt, { diffuse: params.diffuse, decay: params.decay, cap: 1 })

    if (logo) {
      const r = reveal.data
      const out = height.data
      for (let i = 0; i < out.length; i++) {
        const v = r[i]
        out[i] = (v > 0 ? v : 0) * logo[i]
      }
      height.tex.needsUpdate = true
    }

    const a = (params.lightAngle * Math.PI) / 180
    uniforms.uLightDir.value.set(Math.cos(a), Math.sin(a), params.lightHeight).normalize()
    uniforms.uHeightScale.value = params.heightScale
    uniforms.uAmbient.value = params.ambient
    uniforms.uShadow.value = params.shadow
    uniforms.uCavity.value = params.cavity
    uniforms.uMicro.value = params.micro
    uniforms.uSpecular.value = params.specular
    uniforms.uBaseColor.value.set(params.baseColor)
  })

  useControls({ Clear: button(() => reveal.clear()) }, [reveal])

  return (
    <mesh material={material} onPointerMove={paint} onPointerOut={() => { prevUv.current = null }}>
      <planeGeometry args={[PLANE_W, PLANE_H]} />
    </mesh>
  )
}

export default function LogoRelief() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Rub: folder({
      brushRadius: { value: DEFAULTS.brushRadius, min: 0.02, max: 0.2, step: 0.005, label: 'radius' },
      brushStrength: { value: DEFAULTS.brushStrength, min: 0.02, max: 1, step: 0.02, label: 'strength' },
      diffuse: { value: DEFAULTS.diffuse, min: 0, max: 0.24, step: 0.01, label: 'spread' },
      decay: { value: DEFAULTS.decay, min: 0.05, max: 2.5, step: 0.05, label: 'sink' },
    }),
    Logo: folder({
      logoScale: { value: DEFAULTS.logoScale, min: 0.2, max: 0.95, step: 0.01, label: 'size' },
      bevel: { value: DEFAULTS.bevel, min: 0.005, max: 0.2, step: 0.005 },
      engrave: { value: DEFAULTS.engrave, min: 0, max: 1.2, step: 0.05, label: 'engrave' },
    }),
    Surface: folder({
      heightScale: { value: DEFAULTS.heightScale, min: 0.02, max: 0.5, step: 0.01, label: 'relief' },
      lightAngle: { value: DEFAULTS.lightAngle, min: 0, max: 360, step: 1, label: 'light angle' },
      lightHeight: { value: DEFAULTS.lightHeight, min: 0.05, max: 1.5, step: 0.05, label: 'light height' },
      ambient: { value: DEFAULTS.ambient, min: 0, max: 1, step: 0.02 },
      shadow: { value: DEFAULTS.shadow, min: 0, max: 1, step: 0.02 },
      cavity: { value: DEFAULTS.cavity, min: 0, max: 1, step: 0.02 },
      micro: { value: DEFAULTS.micro, min: 0, max: 0.3, step: 0.01, label: 'grain' },
      specular: { value: DEFAULTS.specular, min: 0, max: 0.6, step: 0.02 },
      baseColor: { value: DEFAULTS.baseColor, label: 'color' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  /*
   * ロゴの高さ場は焼き直しが要るパラメータ（大きさ・ベベル・彫り）が
   * 変わったときだけ作り直す。毎フレームやるものではない。
   */
  const [logo, setLogo] = useState(null)
  useEffect(() => {
    let alive = true
    bakeLogoHeight(iconUrl, {
      size: FIELD,
      aspect: PLANE_W / PLANE_H,
      scale: params.logoScale,
      bevel: params.bevel,
      engrave: params.engrave,
    }).then((data) => { if (alive) setLogo(data) })
    return () => { alive = false }
  }, [params.logoScale, params.bevel, params.engrave])

  return (
    <Canvas camera={{ position: [0, 0, 3.05], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={[params.background]} />
      <Wall params={params} logo={logo} />
    </Canvas>
  )
}
