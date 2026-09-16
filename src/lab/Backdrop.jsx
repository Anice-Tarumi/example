import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * 一番奥の地。
 *
 * ここは**下地だけ**を受け持つ。漂う粒は `Bokeh` に移した。本家の画面を
 * 撮って並べたら、あちらの粒は 1 画素の塵ではなく大小のボケ玉で、
 * 細かい点をいくら撒いても均一な靄にしかならないと分かったため。
 */

export default function Backdrop({ tint = '#0b0c10' }) {
  const grad = useMemo(() => new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { uTint: { value: new THREE.Color(tint) } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // 画面いっぱいに置く。行列を通さない
        gl_Position = vec4(position.xy * 2.0, 0.99999, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uTint;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - vec2(0.5, 0.56);
        // 中央をわずかに持ち上げるだけ。板が座る場所を作る
        float v = smoothstep(0.85, 0.0, length(p * vec2(0.8, 1.25)));
        gl_FragColor = vec4(uTint + vec3(0.030, 0.034, 0.046) * v, 1.0);
      }
    `,
  }), [tint])
  useEffect(() => () => grad.dispose(), [grad])

  return (
    <mesh material={grad} frustumCulled={false} renderOrder={-100}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
