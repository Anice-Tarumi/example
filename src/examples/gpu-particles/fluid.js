import { useFBO } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import {
  baseVertexShader,
  splatShader,
  curlShader,
  vorticityShader,
  divergenceShader,
  clearShader,
  pressureShader,
  gradientSubtractShader,
  advectionShader,
} from '../../shared/glsl/fluid'

/**
 * 画面空間の速度場だけを解く軽量な流体。
 *
 * igloo はパーティクルをカメラ投影してこの速度場をサンプルし、
 * 画面平面に沿って押しのける。カーソルの力を直接パーティクルへ与えるのではなく
 * 「カーソル → 流体 → パーティクル」の二段構えにすることで、
 * カーソルを離したあとも渦と慣性が残る。
 *
 * 染料は運ばないので、fluid-solver から dye のパスを省いた形になる。
 */
export function useVelocityField(res, aspect) {
  const size = useMemo(() => {
    const a = aspect < 1 ? 1 / aspect : aspect
    const min = Math.round(res)
    const max = Math.round(res * a)
    return aspect > 1 ? { width: max, height: min } : { width: min, height: max }
  }, [res, aspect])

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
  const rg = useMemo(() => ({ ...opts, format: THREE.RGFormat }), [opts])
  const red = useMemo(() => ({ ...opts, format: THREE.RedFormat }), [opts])

  const velA = useFBO(size.width, size.height, rg)
  const velB = useFBO(size.width, size.height, rg)
  const curlRt = useFBO(size.width, size.height, red)
  const divRt = useFBO(size.width, size.height, red)
  const prsA = useFBO(size.width, size.height, red)
  const prsB = useFBO(size.width, size.height, red)

  const materials = useMemo(() => {
    const mk = (fs, uniforms) =>
      new THREE.ShaderMaterial({
        vertexShader: baseVertexShader,
        fragmentShader: fs,
        uniforms,
        depthTest: false,
        depthWrite: false,
      })
    const texel = { value: new THREE.Vector2() }
    return {
      texel,
      splat: mk(splatShader, {
        texelSize: texel,
        uTarget: { value: null },
        aspectRatio: { value: 1 },
        color: { value: new THREE.Vector3() },
        point: { value: new THREE.Vector2() },
        prevPoint: { value: new THREE.Vector2() },
        radius: { value: 0.004 },
      }),
      curl: mk(curlShader, { texelSize: texel, uVelocity: { value: null } }),
      vorticity: mk(vorticityShader, {
        texelSize: texel,
        uVelocity: { value: null },
        uCurl: { value: null },
        curl: { value: 30 },
        dt: { value: 1 / 60 },
      }),
      divergence: mk(divergenceShader, { texelSize: texel, uVelocity: { value: null } }),
      clear: mk(clearShader, { texelSize: texel, uTexture: { value: null }, value: { value: 0.8 } }),
      pressure: mk(pressureShader, {
        texelSize: texel,
        uPressure: { value: null },
        uDivergence: { value: null },
      }),
      gradientSubtract: mk(gradientSubtractShader, {
        texelSize: texel,
        uPressure: { value: null },
        uVelocity: { value: null },
      }),
      advection: mk(advectionShader, {
        texelSize: texel,
        dyeTexelSize: texel,
        uVelocity: { value: null },
        uSource: { value: null },
        dt: { value: 1 / 60 },
        dissipation: { value: 0.2 },
      }),
    }
  }, [])

  const quad = useMemo(() => new FullScreenQuad(null), [])

  useEffect(() => () => {
    for (const [k, m] of Object.entries(materials)) if (k !== 'texel') m.dispose()
    quad.dispose()
  }, [materials, quad])

  useEffect(() => {
    materials.texel.value.set(1 / size.width, 1 / size.height)
    materials.splat.uniforms.aspectRatio.value = aspect
  }, [materials, size, aspect])

  const buf = useRef({ velRead: velA, velWrite: velB, prsRead: prsA, prsWrite: prsB })
  const cleared = useRef(false)

  useEffect(() => {
    buf.current = { velRead: velA, velWrite: velB, prsRead: prsA, prsWrite: prsB }
    cleared.current = false
  }, [velA, velB, prsA, prsB])

  /** 1 フレーム進める。戻り値は速度場テクスチャ */
  function step(gl, dt, pointer, params) {
    const b = buf.current
    const m = materials

    const blit = (target, material) => {
      quad.material = material
      gl.setRenderTarget(target)
      quad.render(gl)
    }

    if (!cleared.current) {
      const keep = gl.getClearColor(new THREE.Color()).getHex()
      gl.setClearColor(0x000000, 0)
      for (const rt of [velA, velB, curlRt, divRt, prsA, prsB]) {
        gl.setRenderTarget(rt)
        gl.clear(true, false, false)
      }
      gl.setClearColor(keep, 1)
      cleared.current = true
    }

    if (pointer.moved) {
      const dx = (pointer.x - pointer.px) * params.fluidForce
      const dy = (pointer.y - pointer.py) * params.fluidForce
      m.splat.uniforms.uTarget.value = b.velRead.texture
      m.splat.uniforms.point.value.set(pointer.x, pointer.y)
      m.splat.uniforms.prevPoint.value.set(pointer.px, pointer.py)
      m.splat.uniforms.radius.value = (params.fluidRadius / 100) * 1.5
      m.splat.uniforms.color.value.set(dx, dy, 0)
      blit(b.velWrite, m.splat)
      ;[b.velRead, b.velWrite] = [b.velWrite, b.velRead]
    }

    m.curl.uniforms.uVelocity.value = b.velRead.texture
    blit(curlRt, m.curl)

    m.vorticity.uniforms.uVelocity.value = b.velRead.texture
    m.vorticity.uniforms.uCurl.value = curlRt.texture
    m.vorticity.uniforms.curl.value = params.fluidCurl
    m.vorticity.uniforms.dt.value = dt
    blit(b.velWrite, m.vorticity)
    ;[b.velRead, b.velWrite] = [b.velWrite, b.velRead]

    m.divergence.uniforms.uVelocity.value = b.velRead.texture
    blit(divRt, m.divergence)

    m.clear.uniforms.uTexture.value = b.prsRead.texture
    m.clear.uniforms.value.value = 0.8
    blit(b.prsWrite, m.clear)
    ;[b.prsRead, b.prsWrite] = [b.prsWrite, b.prsRead]

    m.pressure.uniforms.uDivergence.value = divRt.texture
    for (let i = 0; i < params.fluidIterations; i++) {
      m.pressure.uniforms.uPressure.value = b.prsRead.texture
      blit(b.prsWrite, m.pressure)
      ;[b.prsRead, b.prsWrite] = [b.prsWrite, b.prsRead]
    }

    m.gradientSubtract.uniforms.uPressure.value = b.prsRead.texture
    m.gradientSubtract.uniforms.uVelocity.value = b.velRead.texture
    blit(b.velWrite, m.gradientSubtract)
    ;[b.velRead, b.velWrite] = [b.velWrite, b.velRead]

    m.advection.uniforms.dt.value = dt
    m.advection.uniforms.uVelocity.value = b.velRead.texture
    m.advection.uniforms.uSource.value = b.velRead.texture
    m.advection.uniforms.dissipation.value = params.fluidDissipation
    blit(b.velWrite, m.advection)
    ;[b.velRead, b.velWrite] = [b.velWrite, b.velRead]

    gl.setRenderTarget(null)
    return b.velRead.texture
  }

  return step
}
