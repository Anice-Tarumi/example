import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, ContactShadows } from '@react-three/drei'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { useControls, folder } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ENV_MAPS } from '../../shared/env'
import {
  quadVertexShader,
  trailUpdateShader,
  trailVertexHead,
  trailBeginVertex,
  trailBeginNormal,
} from './glsl/trail'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

const RADIAL = 12

/** N×1 の位置履歴。ping-pong で 1 フレームぶん右へ流す */
function createHistory(size) {
  const opts = {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    generateMipmaps: false,
  }
  return {
    a: new THREE.WebGLRenderTarget(size, 1, opts),
    b: new THREE.WebGLRenderTarget(size, 1, opts),
  }
}

/**
 * 円筒を軌跡に沿って並べ直す。
 *
 * リング 1 本 = 履歴の 1 テクセル。ジオメトリは作ったきり触らない。
 * 位置も法線も頂点シェーダーがテクスチャから引く。
 */
function Trail({ params }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  const segments = params.segments
  const history = useMemo(() => createHistory(segments), [segments])
  useEffect(() => () => { history.a.dispose(); history.b.dispose() }, [history])

  const updateUniforms = useMemo(
    () => ({
      tPos: { value: null },
      uCursor: { value: new THREE.Vector3() },
      uSize: { value: new THREE.Vector2(segments, 1) },
      uLag: { value: DEFAULTS.lag },
      uInit: { value: 1 },
    }),
    [segments],
  )

  const quad = useMemo(
    () =>
      new FullScreenQuad(
        new THREE.ShaderMaterial({
          vertexShader: quadVertexShader,
          fragmentShader: trailUpdateShader,
          uniforms: updateUniforms,
          depthTest: false,
          depthWrite: false,
        }),
      ),
    [updateUniforms],
  )
  useEffect(() => () => quad.dispose(), [quad])

  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(1, 1, 1, RADIAL, segments - 1, true)
    // 軸を +Z に倒す。断面が xy に来るので、頂点シェーダーで扱いやすい
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2)
    geo.attributes.position.applyMatrix4(m)
    geo.attributes.normal.applyMatrix4(m)

    /*
     * 各頂点がどのリングかを持たせる。
     * CylinderGeometry の頂点は「高さ方向のリング × 円周」の順に並ぶ。
     * 上端が y = +0.5 なので、回転後は z が大きいほど**新しい**側になる。
     */
    const count = geo.attributes.position.count
    const uvs = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      const ring = Math.floor(i / (RADIAL + 1))
      uvs[i * 2] = 1 - ring / (segments - 1)
    }
    geo.setAttribute('computeUV', new THREE.BufferAttribute(uvs, 2))
    // 頂点が動くので、three が計算した範囲は当てにならない
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
    return geo
  }, [segments])
  useEffect(() => () => geometry.dispose(), [geometry])

  const extra = useMemo(
    () => ({
      tPos: { value: null },
      uDataSize: { value: new THREE.Vector2(segments, 1) },
      uRadius: { value: DEFAULTS.radius },
      uTaper: { value: DEFAULTS.taper },
      uSpeedWidth: { value: DEFAULTS.speedWidth },
      uHeadRadius: { value: DEFAULTS.headRadius },
    }),
    [segments],
  )

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, extra)
      shader.vertexShader = trailVertexHead + shader.vertexShader
      shader.vertexShader = shader.vertexShader
        .replace('#include <beginnormal_vertex>', trailBeginNormal)
        .replace('#include <begin_vertex>', trailBeginVertex)
    }
    // onBeforeCompile を差し替えたら key を変えないと three が古い program を使い回す
    mat.customProgramCacheKey = () => 'cursor-trail'
    return mat
  }, [extra])
  useEffect(() => () => material.dispose(), [material])

  const group = useRef(null)
  const cursor = useRef(new THREE.Vector3())
  const inited = useRef(false)
  const moved = useRef(false)
  const read = useRef(history.a)
  const write = useRef(history.b)

  useEffect(() => {
    read.current = history.a
    write.current = history.b
    inited.current = false
  }, [history])

  /*
   * カーソルをワールドへ。カメラの正面 uDepth の平面に落とす。
   * レイキャスト用の板を置く手もあるが、板は当たり判定を持つぶん
   * 回転や配置の影響を受ける。逆射影のほうが素直。
   */
  useEffect(() => {
    const onMove = (e) => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector3(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
        0.5,
      )
      ndc.unproject(camera)
      const dir = ndc.sub(camera.position).normalize()
      const t = (0 - camera.position.z) / dir.z
      cursor.current.copy(camera.position).addScaledVector(dir, t)
      // 回っている群の中に描くので、群のローカル系へ戻す
      if (group.current) group.current.worldToLocal(cursor.current)
      // 最初の 1 回。原点で埋めた履歴から線が伸びるのを避ける
      if (!moved.current) { moved.current = true; inited.current = false }
    }
    const el = gl.domElement
    el.addEventListener('pointermove', onMove)
    return () => el.removeEventListener('pointermove', onMove)
  }, [gl, camera])

  useFrame((state, delta) => {
    if (group.current) group.current.rotation.y += params.spin * delta

    updateUniforms.uCursor.value.copy(cursor.current)
    updateUniforms.uLag.value = params.lag

    const prev = gl.getRenderTarget()
    if (!inited.current) {
      // 履歴が空だと原点から線が伸びる。まずカーソル位置で埋める
      updateUniforms.uInit.value = 1
      for (const t of [read.current, write.current]) {
        gl.setRenderTarget(t)
        quad.render(gl)
      }
      updateUniforms.uInit.value = 0
      inited.current = true
    }

    updateUniforms.tPos.value = read.current.texture
    gl.setRenderTarget(write.current)
    quad.render(gl)
    gl.setRenderTarget(prev)

    const tmp = read.current
    read.current = write.current
    write.current = tmp

    extra.tPos.value = read.current.texture
    extra.uRadius.value = params.radius
    extra.uTaper.value = params.taper
    extra.uSpeedWidth.value = params.speedWidth
    extra.uHeadRadius.value = params.headRadius

    material.color.set(params.color)
    material.metalness = params.metalness
    material.roughness = params.roughness
    material.envMapIntensity = params.envIntensity
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}

export default function CursorTrail() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Trail: folder({
      segments: { value: DEFAULTS.segments, min: 48, max: 512, step: 8, label: 'length' },
      radius: { value: DEFAULTS.radius, min: 0.008, max: 0.2, step: 0.002 },
      lag: { value: DEFAULTS.lag, min: 0, max: 0.6, step: 0.01, label: 'follow lag' },
      taper: { value: DEFAULTS.taper, min: 0, max: 1, step: 0.05 },
      speedWidth: { value: DEFAULTS.speedWidth, min: 0, max: 1.5, step: 0.05, label: 'speed → width' },
      headRadius: { value: DEFAULTS.headRadius, min: 0.05, max: 1.5, step: 0.05, label: 'head' },
      spin: { value: DEFAULTS.spin, min: -0.8, max: 0.8, step: 0.02, label: 'auto spin' },
    }),
    Material: folder({
      color: { value: DEFAULTS.color },
      metalness: { value: DEFAULTS.metalness, min: 0, max: 1, step: 0.02 },
      roughness: { value: DEFAULTS.roughness, min: 0.02, max: 1, step: 0.02 },
      envIntensity: { value: DEFAULTS.envIntensity, min: 0, max: 3, step: 0.05, label: 'env' },
    }),
    Scene: folder({
      ambient: { value: DEFAULTS.ambient, min: 0, max: 1.5, step: 0.05 },
      floor: { value: DEFAULTS.floor },
      floorColor: { value: DEFAULTS.floorColor, label: 'floor' },
      background: { value: DEFAULTS.background, label: 'bg' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0.4, 3.4], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={[params.background]} />
      <ambientLight intensity={params.ambient} />
      <directionalLight position={[2, 3, 2]} intensity={1.1} />

      <Suspense fallback={null}>
        <Environment files={ENV_MAPS.studio.url} />
        <Trail params={params} />
        {params.floor && (
          <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.15, 0]}>
              <planeGeometry args={[40, 40]} />
              <meshStandardMaterial color={params.floorColor} roughness={0.9} metalness={0} />
            </mesh>
            {/* 軌跡が床から浮いていることを示す影。無いと空中の絵に見える */}
            <ContactShadows position={[0, -1.14, 0]} opacity={0.5} scale={9} blur={2.4} far={3} />
          </>
        )}
      </Suspense>
    </Canvas>
  )
}
