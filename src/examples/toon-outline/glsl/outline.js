import { normalCodecGLSL } from './gbuffer'

export const quadVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * 合成パス。G-Buffer を十字 5 タップで読み、
 * ID・深度・法線の 3 つの変化量を足し合わせて輪郭を出す。
 *
 * 3 つを併用するのが要点:
 *   - 深度差   … 手前と奥の境界
 *   - 法線差   … 折れ目（同じ深度でも面が曲がっているところ）
 *   - ID 差    … 深度も法線も連続な素材の切り替わり
 */
export const outlineFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tColor;   // rgb = 色, a = surfaceId
  uniform sampler2D tInfo;    // r = 深度, gb = 法線, a = マスク
  uniform vec2  uResolution;
  uniform float uThickness;
  uniform vec3  uOutlineColor;
  uniform vec3  uIdRange;
  uniform vec3  uDepthRange;
  uniform vec3  uNormalRange;
  uniform float uSmoothMargin;
  uniform int   uMode;

  varying vec2 vUv;

${normalCodecGLSL}

  float fit(float v, float a, float b, float c, float d) {
    return clamp((v - a) / (b - a), 0.0, 1.0) * (d - c) + c;
  }

  void main() {
    vec4 centerColor = texture2D(tColor, vUv);
    vec4 centerInfo = texture2D(tInfo, vUv);

    if (uMode == 1) {
      gl_FragColor = vec4(vec3(centerInfo.r), 1.0);
      #include <colorspace_fragment>
      return;
    }
    if (uMode == 2) {
      gl_FragColor = vec4(decodeNormalSpheremap(centerInfo.gb) * 0.5 + 0.5, 1.0);
      #include <colorspace_fragment>
      return;
    }
    if (uMode == 3) {
      // 面 ID を色相に散らして可視化する
      float id = centerColor.a;
      vec3 vis = 0.5 + 0.5 * cos(6.2831 * (id * 3.0 + vec3(0.0, 0.33, 0.67)));
      gl_FragColor = vec4(vis * step(0.001, centerInfo.a + id), 1.0);
      #include <colorspace_fragment>
      return;
    }

    // 解像度が変わっても線の太さが変わらないように補正する
    float resScale = min(1.0, uResolution.y / 1300.0);
    vec2 offset = (1.0 / uResolution) * uThickness * max(resScale, 0.35) * 3.0;

    vec2 uvL = vUv - vec2(offset.x, 0.0);
    vec2 uvR = vUv + vec2(offset.x, 0.0);
    vec2 uvD = vUv - vec2(0.0, offset.y);
    vec2 uvU = vUv + vec2(0.0, offset.y);

    vec4 iL = texture2D(tInfo, uvL);
    vec4 iR = texture2D(tInfo, uvR);
    vec4 iD = texture2D(tInfo, uvD);
    vec4 iU = texture2D(tInfo, uvU);

    float idC = centerColor.a;
    float idL = texture2D(tColor, uvL).a;
    float idR = texture2D(tColor, uvR).a;
    float idD = texture2D(tColor, uvD).a;
    float idU = texture2D(tColor, uvU).a;

    // 中心との差を x = 右 - 左, y = 上 - 下 の形で取る
    vec2 idVar = vec2((idR - idC) - (idL - idC), (idU - idC) - (idD - idC));
    vec2 depthVar = vec2((iR.r - centerInfo.r) - (iL.r - centerInfo.r),
                         (iU.r - centerInfo.r) - (iD.r - centerInfo.r));

    vec3 nC = decodeNormalSpheremap(centerInfo.gb);
    vec2 normalVar = vec2(
      distance(decodeNormalSpheremap(iR.gb), nC) - distance(decodeNormalSpheremap(iL.gb), nC),
      distance(decodeNormalSpheremap(iU.gb), nC) - distance(decodeNormalSpheremap(iD.gb), nC)
    );

    float idContribution = fit(
      fit(length(idVar), uIdRange.x, uIdRange.y, 0.0, 1.0),
      uIdRange.z, uIdRange.z + uSmoothMargin, 0.0, 1.0);

    float normalContribution = fit(
      fit(length(normalVar), uNormalRange.x, uNormalRange.y, 0.0, 1.0),
      uNormalRange.z, uNormalRange.z + uSmoothMargin, 0.0, 1.0);

    // 視線にほぼ平行な面は深度が急変するので、しきい値を上げて誤検出を防ぐ
    float depthLimit = uDepthRange.z + (1.0 - nC.z);
    float depthContribution = fit(
      fit(length(depthVar), uDepthRange.x, uDepthRange.y, 0.0, 1.0),
      depthLimit, depthLimit + uSmoothMargin, 0.0, 1.0);

    float outline = clamp(idContribution + normalContribution + depthContribution, 0.0, 1.0);
    // 背景（何も描かれていないところ）には線を引かない
    outline *= centerInfo.a;

    // 手前側に線を寄せる。4 近傍で最も手前が中心より手前なら、そちらの持ち物
    float minDepth = min(min(iL.r, iR.r), min(iD.r, iU.r));
    if (minDepth < centerInfo.r) {
      outline *= 0.35;
    }

    vec3 color = mix(centerColor.rgb, uOutlineColor, outline);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
