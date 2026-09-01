import { Canvas, useFrame } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { useControls, folder, button } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ENV_MAPS } from '../../shared/env'
import { createHeightField } from './heightField'
import { createBalls } from './balls'
import { plasterVertexShader, plasterFragmentShader } from '../../shared/glsl/plaster'
import { PRESETS, PRESET_OPTIONS, DEFAULT_PRESET, DEFAULTS } from './presets'

const FIELD = 256
/*
 * 板は画面より広く取る（端が見えると板に見える）。
 * ただし**球を生む範囲は見えている範囲**に合わせる。
 * 板の幅で生むと、視界の外に落ちていって画面に何も出てこない。
 */
const HALF_W = 2.4
const TOP = 1.35
const BOTTOM = -1.35
const SPAWN_HALF = 1.45
const SPAWN_TOP = 1.15
const BALLS = 40

const dummy = new THREE.Object3D()

/**
 * 石膏の壁と、その上を落ちていく金属球。
 *
 * 壁と球は**同じ高さ場**を見る。壁は法線と影の材料として、
 * 球は斜面の勾配として。見えている隆起と球の動きが食い違わない。
 */
function Wall({ params }) {
  const field = useMemo(() => createHeightField(FIELD), [])
  const balls = useMemo(
    () => createBalls({ count: BALLS, halfWidth: HALF_W, top: TOP, bottom: BOTTOM, spawnHalf: SPAWN_HALF, spawnTop: SPAWN_TOP }),
    [],
  )
  useEffect(() => () => field.dispose(), [field])

  const mesh = useRef(null)
  const shadowMesh = useRef(null)
  const prevUv = useRef(null)

  const uniforms = useMemo(
    () => ({
      uHeight: { value: field.texture },
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
    [field],
  )

  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: plasterVertexShader, fragmentShader: plasterFragmentShader, uniforms }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  // 接地影。単色の円だと縁が立って別の物体に見える
  const shadowMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uOpacity: { value: 0.3 } },
        // 手書きシェーダーは instanceMatrix を自分で掛ける。
        // 組み込みマテリアルは chunk がやるので、忘れると全インスタンスが原点に重なる
        vertexShader: `varying vec2 vP;
          void main(){
            vP = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `uniform float uOpacity; varying vec2 vP;
          void main(){ float a = smoothstep(1.0, 0.15, length(vP)); gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity); }`,
      }),
    [],
  )
  useEffect(() => () => shadowMaterial.dispose(), [shadowMaterial])

  /*
   * なぞる。押していなくても反応する。
   * 前フレームの位置と結んで塗らないと、速く動かしたとき点線になる。
   */
  const paint = (e) => {
    if (!e.uv) return
    const r = params.brushRadius
    const amount = params.brushStrength * (e.buttons ? 2.2 : 1)
    const prev = prevUv.current
    if (prev) field.stampLine(prev.x, prev.y, e.uv.x, e.uv.y, r, amount)
    else field.stamp(e.uv.x, e.uv.y, r, amount * 0.3)
    prevUv.current = { x: e.uv.x, y: e.uv.y }
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)

    field.step(dt, { diffuse: params.diffuse, decay: params.decay, cap: params.cap })
    balls.step(dt, field, params)

    // 光の向き。角度で回すほうが「斜めから当てる」を掴みやすい
    const a = (params.lightAngle * Math.PI) / 180
    uniforms.uLightDir.value.set(Math.cos(a), Math.sin(a), params.lightHeight).normalize()
    uniforms.uHeightScale.value = params.heightScale
    uniforms.uAmbient.value = params.ambient
    uniforms.uShadow.value = params.shadow
    uniforms.uCavity.value = params.cavity
    uniforms.uMicro.value = params.micro
    uniforms.uSpecular.value = params.specular
    uniforms.uBaseColor.value.set(params.baseColor)

    if (!mesh.current) return
    const lx = Math.cos(a)
    const ly = Math.sin(a)
    for (let i = 0; i < BALLS; i++) {
      if (!balls.alive[i]) {
        // 生きていない球は原点に潰して隠す
        dummy.position.set(0, 0, -10)
        dummy.scale.setScalar(0.0001)
      } else {
        /*
         * 奥行きは**シェーダーと同じ換算**で出す。
         * heightScale は uv 単位なので、板の幅を掛けてワールドへ直す。
         * ここがずれると、球だけ手前に飛び出して大きく見える。
         */
        const h = field.height(balls.toU(balls.x[i]), balls.toV(balls.y[i]))
        const z = params.radius + h * params.heightScale * (HALF_W * 2) * params.lift
        dummy.position.set(balls.x[i], balls.y[i], z)
        dummy.scale.setScalar(params.radius)
      }
      // 転がりの姿勢。回っていないと、どれだけ軌道が正しくても滑って見える
      dummy.quaternion.set(balls.qx[i], balls.qy[i], balls.qz[i], balls.qw[i])
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)

      if (shadowMesh.current) {
        if (!balls.alive[i]) {
          dummy.position.set(0, 0, -10)
          dummy.scale.setScalar(0.0001)
        } else {
          // 接地影。光と反対側へずらすだけで球が壁に乗って見える
          dummy.position.set(balls.x[i] - lx * params.radius * 0.55, balls.y[i] - ly * params.radius * 0.55, 0.004)
          dummy.scale.setScalar(params.radius * 1.5)
        }
        dummy.quaternion.set(0, 0, 0, 1)
        dummy.updateMatrix()
        shadowMesh.current.setMatrixAt(i, dummy.matrix)
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (shadowMesh.current) shadowMesh.current.instanceMatrix.needsUpdate = true
  })

  // リセットは leva の button から呼ぶ
  useControls({ Clear: button(() => field.clear()) }, [field])

  return (
    <>
      <mesh
        material={material}
        onPointerMove={paint}
        onPointerOut={() => { prevUv.current = null }}
      >
        <planeGeometry args={[HALF_W * 2, TOP - BOTTOM]} />
      </mesh>

      {/* 接地影。縁を立てると円盤が転がっているように見えるので、外へ向かって消す */}
      <instancedMesh ref={shadowMesh} args={[undefined, undefined, BALLS]} material={shadowMaterial}>
        <circleGeometry args={[1, 24]} />
      </instancedMesh>

      <instancedMesh ref={mesh} args={[undefined, undefined, BALLS]}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial
          color={params.ballColor}
          metalness={1}
          roughness={params.ballRough}
          envMapIntensity={1.1}
        />
      </instancedMesh>
    </>
  )
}

export default function ReliefField() {
  const { variant } = useControls({
    variant: { value: DEFAULT_PRESET, options: PRESET_OPTIONS, label: 'Variant' },
  })

  const [params, setParams] = useControls(() => ({
    Brush: folder({
      brushRadius: { value: DEFAULTS.brushRadius, min: 0.01, max: 0.16, step: 0.005, label: 'radius' },
      brushStrength: { value: DEFAULTS.brushStrength, min: 0.05, max: 2, step: 0.05, label: 'strength' },
      diffuse: { value: DEFAULTS.diffuse, min: 0, max: 0.24, step: 0.01, label: 'spread' },
      decay: { value: DEFAULTS.decay, min: 0.05, max: 2.5, step: 0.05, label: 'sink' },
    }),
    Surface: folder({
      heightScale: { value: DEFAULTS.heightScale, min: 0.01, max: 0.3, step: 0.005, label: 'relief' },
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
    Balls: folder({
      spawnInterval: { value: DEFAULTS.spawnInterval, min: 0.2, max: 4, step: 0.05, label: 'interval' },
      radius: { value: DEFAULTS.radius, min: 0.03, max: 0.12, step: 0.002 },
      gravity: { value: DEFAULTS.gravity, min: 0.2, max: 6, step: 0.05 },
      solid: { value: DEFAULTS.solid, min: 0.05, max: 3, step: 0.05, label: 'solid at' },
      drag: { value: DEFAULTS.drag, min: 0, max: 1.5, step: 0.02, label: 'air drag' },
      surfaceFriction: { value: DEFAULTS.surfaceFriction, min: 0, max: 0.4, step: 0.005, label: 'friction' },
      restitution: { value: DEFAULTS.restitution, min: 0.2, max: 1.6, step: 0.05, label: 'bounce' },
      maxSpeed: { value: DEFAULTS.maxSpeed, min: 0.5, max: 6, step: 0.1, label: 'max speed' },
      carve: { value: DEFAULTS.carve, min: 0, max: 1.5, step: 0.05, label: 'groove' },
      lift: { value: DEFAULTS.lift, min: 0, max: 2, step: 0.05, label: 'ride height' },
      cap: { value: DEFAULTS.cap, min: 0.3, max: 3, step: 0.1, label: 'height cap' },
      ballRough: { value: DEFAULTS.ballRough, min: 0.02, max: 0.6, step: 0.02, label: 'roughness' },
      ballColor: { value: DEFAULTS.ballColor, label: 'metal' },
    }),
  }))

  useEffect(() => {
    const preset = PRESETS[variant]
    if (preset) setParams(preset.params)
  }, [variant, setParams])

  return (
    <Canvas camera={{ position: [0, 0, 3.05], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={[params.background]} />
      {/* 壁は自前のシェーダーで陰影を作る。環境マップは球の映り込み用 */}
      <Suspense fallback={null}>
        <Environment files={ENV_MAPS.studio.url} />
        <Wall params={params} />
      </Suspense>
    </Canvas>
  )
}
