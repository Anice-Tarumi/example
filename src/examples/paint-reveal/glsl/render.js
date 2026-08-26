/**
 * 合成パス。ai-quest の cutscene fragment shader から、
 * マスクで彩度を戻す部分（getMaskColor / textureBicubic）を移植した。
 *
 * トランジション用の prev/curr 2 枚合成は本題ではないので落とし、
 * 1 枚の絵に対する脱色 → 彩度復元だけを残している。
 */
export const renderFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D u_artwork;
  uniform sampler2D u_maskTexture;
  uniform vec2  u_maskTextureSize;
  uniform vec2  u_artworkScale;
  uniform float u_time;
  uniform float u_displace;
  uniform float u_desaturation;
  uniform float u_overlayBoost;
  uniform int   u_mode;

  varying vec2 v_uv;

  vec4 cubic(float v) {
    vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
    vec4 s = n * n * n;
    float x = s.x;
    float y = s.y - 4.0 * s.x;
    float z = s.z - 4.0 * s.y + 6.0 * s.x;
    float w = 6.0 - x - y - z;
    return vec4(x, y, z, w);
  }

  /**
   * bicubic サンプリング。マスクは画面の 1/4 解像度なので、
   * bilinear のままだと拡大時に境界が階段状になる。
   */
  vec4 textureBicubic(sampler2D t, vec2 texCoords, vec2 textureSize) {
    vec2 invTexSize = 1.0 / textureSize;
    texCoords = texCoords * textureSize - 0.5;
    vec2 fxy = fract(texCoords);
    texCoords -= fxy;
    vec4 xcubic = cubic(fxy.x);
    vec4 ycubic = cubic(fxy.y);
    vec4 c = texCoords.xxyy + vec2(-0.5, 1.5).xyxy;
    vec4 s = vec4(xcubic.xz + xcubic.yw, ycubic.xz + ycubic.yw);
    vec4 offset = c + vec4(xcubic.yw, ycubic.yw) / s;
    offset *= invTexSize.xxyy;
    vec4 sample0 = texture2D(t, offset.xz);
    vec4 sample1 = texture2D(t, offset.yz);
    vec4 sample2 = texture2D(t, offset.xw);
    vec4 sample3 = texture2D(t, offset.yw);
    float sx = s.x / (s.x + s.y);
    float sy = s.z / (s.z + s.w);
    return mix(mix(sample3, sample2, sx), mix(sample1, sample0, sx), sy);
  }

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  /** 元実装は transitionNoise.webp を引くが、ここは手続きノイズで代替する */
  vec3 maskJitterNoise(vec2 uv) {
    return vec3(
      valueNoise(uv * 6.0 + u_time * 0.05),
      valueNoise(uv * 6.0 + 41.7 - u_time * 0.04),
      valueNoise(uv * 6.0 + 93.1)
    ) - 0.5;
  }

  /** 塗られたところだけ彩度が戻る。元実装の getMaskColor そのまま */
  vec3 getMaskColor(vec3 color, vec4 mask) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 gray = mix(color, vec3(luma), u_desaturation);

    float paintMask = clamp(mask.r, 0.0, 1.0);
    float overlayMask = mask.a * u_overlayBoost;

    vec3 finalColor = mix(gray, color, clamp(paintMask + overlayMask, 0.0, 1.0));
    finalColor = mix(finalColor * 0.8, finalColor, paintMask);
    finalColor = mix(finalColor, finalColor * 1.44 + vec3(1.0), clamp(overlayMask, 0.0, 1.0));
    return finalColor;
  }

  void main() {
    vec3 noise = maskJitterNoise(v_uv);

    // マスクの UV を僅かに揺らして、塗り跡の輪郭を手描きっぽく崩す
    vec2 mUv = v_uv + noise.xx * 0.0042 + noise.yy * 0.0042;
    vec4 mask = textureBicubic(u_maskTexture, mUv, u_maskTextureSize);

    if (u_mode == 1) {
      // マスクそのものを可視化する。r=塗り跡, gb=ディスプレイス, a=オーバーレイ
      vec3 vis = vec3(mask.r, abs(mask.g - 0.0) * 8.0 + mask.a * 4.0, mask.a * 8.0);
      gl_FragColor = vec4(vis, 1.0);
      #include <colorspace_fragment>
      return;
    }

    // 絵の UV をマスクの gb でずらす。絵の具が下の絵を押しのけて見える
    vec2 uv = (v_uv - 0.5) * u_artworkScale + 0.5;
    uv += mask.gb * u_displace;

    vec3 art = texture2D(u_artwork, uv).rgb;
    vec3 color = getMaskColor(art, mask);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
