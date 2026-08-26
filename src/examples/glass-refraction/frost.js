import { useFBO } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

/**
 * MouseFrost — ガラス表面を撫でると霜が溶ける演出。
 *
 * カーソルがメッシュ上を通った UV に波を注入し、それを表面上で伝播させる。
 * 伝播は拡散（平均）ではなく **4 近傍の最大値**を取るのが特徴で、
 * 波が減衰しながらも輪郭を保ったまま外へ広がる。
 *
 * 出力テクスチャ:
 *   R = wave（撫でた跡。ここは霜が溶けて透明になる）
 *   G = rim （前フレームとの差。波の先端だけが光る）
 */

const frostVertexShader = /* glsl */`
  varying vec2 vFrostUv;
  void main() {
    vFrostUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const frostFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tBuffer;
  uniform vec2  uSplatCoords;
  uniform vec2  uSplatPrevCoords;
  uniform float uSplatRadius;
  uniform float uDamping;
  uniform float uWaveSpeed;
  uniform float uAdvect;
  uniform float uTime;

  varying vec2 vFrostUv;

  float line(vec2 uv, vec2 a, vec2 b) {
    vec2 pa = uv - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  float cubicIn(float t) { return t * t * t; }

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = vFrostUv;
    float res = float(textureSize(tBuffer, 0).x);
    vec2 invRes = vec2(1.0 / res);

    // ノイズで読み取り位置をずらし、波の縁を有機的に崩す
    vec2 advect = vec2(
      valueNoise(uv * 3.0 + uTime * 0.02),
      valueNoise(uv * 3.0 + 37.1 - uTime * 0.015)
    ) * 2.0 - 1.0;
    uv += advect * invRes * uAdvect;

    // 4 近傍の最大値を取る。平均だとぼやけて消えるが、max だと形が残って広がる
    vec2 offset = invRes * uWaveSpeed;
    float l = texture2D(tBuffer, uv - vec2(offset.x, 0.0)).r;
    float r = texture2D(tBuffer, uv + vec2(offset.x, 0.0)).r;
    float t = texture2D(tBuffer, uv + vec2(0.0, offset.y)).r;
    float b = texture2D(tBuffer, uv - vec2(0.0, offset.y)).r;
    float nextVal = max(max(l, r), max(t, b));

    // カーソルの移動線分に沿って注入。半径は移動速度に比例させる。
    // 元実装の下限 0.1 はキューブ表面を速く動く前提の値で、球の UV では
    // 移動量が小さく一度も閾値を越えないため下げてある。
    float radius = 0.055 * smoothstep(0.02, 0.8, uSplatRadius);
    if (radius > 0.0001) {
      float splat = cubicIn(clamp(1.0 - line(vFrostUv, uSplatPrevCoords, uSplatCoords) / radius, 0.0, 1.0));
      nextVal += splat;
    }

    nextVal = min(nextVal * uDamping, 1.0);

    // 前フレームとの差＝波の先端
    float rim = nextVal - texture2D(tBuffer, uv).r;

    gl_FragColor = vec4(nextVal, rim, 0.0, 1.0);
  }
`

export function useMouseFrost(size = 512) {
  const opts = useMemo(
    () => ({
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  )
  const rtA = useFBO(size, size, opts)
  const rtB = useFBO(size, size, opts)

  const uniforms = useMemo(
    () => ({
      tBuffer: { value: null },
      uSplatCoords: { value: new THREE.Vector2(-1, -1) },
      uSplatPrevCoords: { value: new THREE.Vector2(-1, -1) },
      uSplatRadius: { value: 0 },
      uDamping: { value: 0.985 },
      uWaveSpeed: { value: 1 },
      uAdvect: { value: 1 },
      uTime: { value: 0 },
    }),
    [],
  )

  const quad = useMemo(
    () =>
      new FullScreenQuad(
        new THREE.ShaderMaterial({
          vertexShader: frostVertexShader,
          fragmentShader: frostFragmentShader,
          uniforms,
          depthTest: false,
          depthWrite: false,
        }),
      ),
    [uniforms],
  )

  useEffect(() => () => {
    quad.material.dispose()
    quad.dispose()
  }, [quad])

  // 元実装と同じ速度追跡。止まっていたら注入せず、飛んだら軌跡を切る
  const state = useRef({
    pos: new THREE.Vector2(-1, -1),
    last: new THREE.Vector2(-1, -1),
    lastMoveTime: 0,
    lastRenderTime: 0,
    targetVelocity: 0,
    velocity: 0,
    read: rtA,
    write: rtB,
    cleared: false,
  })

  useEffect(() => {
    state.current.read = rtA
    state.current.write = rtB
    state.current.cleared = false
  }, [rtA, rtB])

  function setPointer(uv) {
    state.current.pos.copy(uv)
  }

  function step(gl, time, params) {
    const s = state.current

    if (!s.cleared) {
      const keep = gl.getClearColor(new THREE.Color()).getHex()
      gl.setClearColor(0x000000, 0)
      for (const rt of [rtA, rtB]) {
        gl.setRenderTarget(rt)
        gl.clear(true, false, false)
      }
      gl.setClearColor(keep, 1)
      s.cleared = true
    }

    // 元実装同様、更新は 15ms 間隔に制限する
    if (time - s.lastRenderTime < 0.015) return s.read.texture
    s.lastRenderTime = time

    let dist = s.pos.distanceTo(s.last)
    const sinceMove = time - s.lastMoveTime
    if (dist > 0) s.lastMoveTime = time

    // 間が空いた／大きく飛んだときは線を繋がない
    if (sinceMove > 0.15 || dist > 0.3) {
      s.last.copy(s.pos)
      s.targetVelocity = 0
      dist = 0
    }

    // UV 空間の移動量は小さいので、元実装より強めに積む
    s.targetVelocity = Math.min(Math.max((s.targetVelocity + dist * 18) * 0.88, 0), 1)
    const eased = 1 - Math.pow(1 - s.targetVelocity, 4)
    s.velocity += (eased - s.velocity) * 0.3

    uniforms.uSplatCoords.value.copy(s.pos)
    uniforms.uSplatPrevCoords.value.copy(s.last)
    uniforms.uSplatRadius.value = s.velocity * params.frostStrength
    uniforms.uDamping.value = params.frostDamping
    uniforms.uWaveSpeed.value = params.frostSpeed
    uniforms.uAdvect.value = params.frostAdvect
    uniforms.uTime.value = time
    uniforms.tBuffer.value = s.read.texture

    s.last.copy(s.pos)

    gl.setRenderTarget(s.write)
    quad.render(gl)
    gl.setRenderTarget(null)

    const next = s.write
    s.write = s.read
    s.read = next
    return next.texture
  }

  return { setPointer, step }
}
