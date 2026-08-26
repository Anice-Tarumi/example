export const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * 1 枚の絵 + 深度マップだけで奥行きを作る。
 *
 *   1. 視差レイマーチ … 視線を少しずつ進め、深度サーフェスをくぐった位置で止める
 *   2. DOF            … 止まった点の深度と焦点面の差でディスクブラー
 *   3. フラッシュライト … カーソルからの距離を深度込みで測り、手前だけ照らす
 *   4. 角丸マスク      … sdRoundedBox でカードの縁を丸める
 *
 * サンプル数は定数として埋め込む（GLSL のループ長を動かせないため）。
 */
export function parallaxFragmentShader(parallaxSamples, blurSamples) {
  const P = Math.max(1, Math.round(parallaxSamples))
  const B = Math.max(1, Math.round(blurSamples))

  return /* glsl */`
    precision highp float;

    uniform sampler2D uTexture;
    uniform sampler2D uDepthTexture;
    uniform vec2  uShift;          // カーソル由来の視差オフセット
    uniform float uZMultiplier;    // 深度 → z の倍率。視差の強さ
    uniform float uFocus;          // 焦点面の深度
    uniform float uBlurStrength;
    uniform float uAperture;
    uniform vec2  uLight;          // フラッシュライトの中心（UV）
    uniform float uLightRadius;
    uniform float uLightStrength;
    uniform float uLightDepth;     // 光が届く深度の範囲
    uniform vec3  uLightColor;
    uniform float uCorner;
    uniform float uVignette;
    uniform vec3  uFogColor;
    uniform float uFogAmount;
    uniform float uPad;          // 視差でずれても画像の外を引かないための余白
    uniform float uAspect;
    uniform int   uMode;

    varying vec2 vUv;

    float sampleDepth(vec2 uv) {
      return texture2D(uDepthTexture, clamp(uv, 0.0, 1.0)).r;
    }

    /**
     * 視差レイマーチ。
     * 視点から出たレイを進めながら、その xy 位置の深度と現在の z を比べ、
     * サーフェスをくぐった時点で止める。止まった uv で本画像を引く。
     */
    vec2 marchParallax(vec2 uv, vec2 shift) {
      vec3 rayPos = vec3(uv, 0.0);
      vec3 rayStep = vec3(shift, 1.0) / float(${P});

      for (int i = 0; i < ${P}; i++) {
        float d = (1.0 - sampleDepth(rayPos.xy)) * uZMultiplier;
        if (d < rayPos.z) break;
        rayPos += rayStep;
      }
      return rayPos.xy;
    }

    /** 焦点面から外れた深度ほどぼかす。ディスク状にサンプルして平均 */
    vec3 sampleWithDof(vec2 uv, float depth) {
      float coc = abs(depth - uFocus) * uBlurStrength;
      if (coc < 0.0008) return texture2D(uTexture, clamp(uv, 0.0, 1.0)).rgb;

      vec3 sum = texture2D(uTexture, clamp(uv, 0.0, 1.0)).rgb;
      float golden = 2.39996323;
      for (int i = 0; i < ${B}; i++) {
        float a = golden * float(i);
        float r = sqrt((float(i) + 0.5) / float(${B})) * coc;
        vec2 offset = vec2(cos(a), sin(a)) * r * vec2(1.0 / uAspect, 1.0) * uAperture;
        sum += texture2D(uTexture, clamp(uv + offset, 0.0, 1.0)).rgb;
      }
      return sum / float(${B} + 1);
    }

    /** 角丸矩形の SDF */
    float sdRoundedBox(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
    }

    void main() {
      // 表示するのは画像の内側だけ。視差でレイが外へ出ると ClampToEdge で
      // 端の 1 列が引き伸ばされ、画面の縁に縦線や色のくさびが出る
      vec2 uv = vUv * (1.0 - 2.0 * uPad) + uPad;

      // カーソルで視差をずらす。深度が大きい（手前）ほど大きく動く
      vec2 shift = uShift;
      vec2 marched = marchParallax(uv, shift);
      float depth = sampleDepth(marched);

      if (uMode == 1) {
        gl_FragColor = vec4(vec3(depth), 1.0);
        #include <colorspace_fragment>
        return;
      }

      vec3 color = sampleWithDof(marched, depth);

      // フラッシュライト。画面距離だけでなく深度差でも減衰させるので、
      // 手前の木だけが照らされて奥の山は暗いまま残る
      if (uLightStrength > 0.0) {
        vec2 d = (marched - uLight) * vec2(uAspect, 1.0);
        float planar = length(d) / max(uLightRadius, 1e-4);
        float depthGap = abs(depth - uLightDepth) / max(uLightStrength > 0.0 ? 0.35 : 1.0, 1e-4);
        float falloff = exp(-planar * planar) * exp(-depthGap * depthGap);
        color += uLightColor * falloff * uLightStrength;
      }

      // 奥ほど大気で沈ませる
      color = mix(uFogColor, color, mix(1.0, depth, uFogAmount));

      // カードの角を丸める
      vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
      float mask = 1.0 - smoothstep(-0.004, 0.004, sdRoundedBox(p, vec2(uAspect, 1.0) * 0.5, uCorner));

      // 周辺減光
      float vig = 1.0 - uVignette * pow(length((uv - 0.5) * 2.0) * 0.72, 2.4);
      color *= clamp(vig, 0.0, 1.0);

      gl_FragColor = vec4(color * mask, 1.0);
      #include <colorspace_fragment>
    }
  `
}
