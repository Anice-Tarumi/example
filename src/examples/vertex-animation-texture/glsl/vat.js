/**
 * 焼いたテクスチャを読んで再生するだけの頂点シェーダー。
 * CPU は毎フレーム何もしない（uniform を 3 つ書き換えるだけ）。
 */
export const vatVertexShader = /* glsl */`
  attribute float aPiece;
  attribute vec3  aOrigin;
  attribute vec3  aSize;
  attribute vec3  aTint;
  attribute vec3  aRestPos;    // 着地したときの変位
  attribute vec4  aRestQuat;   // 着地したときの姿勢

  uniform sampler2D tPosition;
  uniform sampler2D tOrient;
  uniform vec2  uTexSize;      // x = 破片数, y = フレーム数
  uniform float uFrameFrom;
  uniform float uFrameTo;
  uniform float uFrameRatio;
  uniform float uScatter;
  uniform mat4  uRevealViewProj;  // 像が結ぶカメラの view-projection
  uniform vec2  uRevealFrame;     // x = 画面のアスペクト, y = 絵を写す大きさ

  varying vec3 vNormalView;
  varying vec3 vTint;
  varying float vShatter;
  varying vec2  vRevealUv;

  /** クォータニオンでベクトルを回す */
  vec3 qrotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }

  vec2 texelUv(float piece, float frame) {
    return vec2((piece + 0.5) / uTexSize.x, (frame + 0.5) / uTexSize.y);
  }

  void main() {
    vec2 uvFrom = texelUv(aPiece, uFrameFrom);
    vec2 uvTo   = texelUv(aPiece, uFrameTo);

    vec3 offFrom = texture2D(tPosition, uvFrom).xyz;
    vec3 offTo   = texture2D(tPosition, uvTo).xyz;
    vec4 oriFrom = texture2D(tOrient, uvFrom);
    vec4 oriTo   = texture2D(tOrient, uvTo);

    // 隣接フレームなら slerp でなく線形 mix + 正規化で十分なめらか
    vec3 offset = mix(offFrom, offTo, uFrameRatio) * uScatter;
    vec4 orient = normalize(mix(oriFrom, oriTo, uFrameRatio));

    // 破片ローカル → 回転 → 元の位置 → 焼いた変位
    vec3 local = position * aSize;
    vec3 world = qrotate(orient, local) + aOrigin + offset;

    /*
     * アナモルフォーシス。
     *
     * 破片は自然に落ちるだけで、並びからは絵が作れない。
     * そこで **着地した状態で画面上のどこにいるか** を求め、
     * その画面座標をそのまま UV にする。
     * 各破片は「画面上で自分が覆う位置の絵」を持つので、
     * どこに落ちていても画面では絵が繋がる。
     *
     * 壁の状態では「これから行く先の絵」を持っているので並びが合わず、
     * 意味のない模様に見える。落ちて初めて揃う。
     */
    vec3 restWorld = qrotate(aRestQuat, local) + aOrigin + aRestPos * uScatter;
    vec4 restClip = uRevealViewProj * vec4(restWorld, 1.0);
    // NDC をそのまま UV にすると、正方形の絵が画面比に引き伸ばされる。
    // x にアスペクトを掛けて正方領域へ写す
    vec2 ndc = restClip.xy / max(restClip.w, 1e-5);
    ndc.x *= uRevealFrame.x;
    vRevealUv = ndc / max(uRevealFrame.y, 1e-3) * 0.5 + 0.5;

    vec4 mv = modelViewMatrix * vec4(world, 1.0);

    vNormalView = normalize(normalMatrix * qrotate(orient, normal));
    vTint = aTint;
    // どれだけ飛んだか。着色に使う
    vShatter = clamp(length(offset) * 0.55, 0.0, 1.0);

    gl_Position = projectionMatrix * mv;
  }
`

export const vatFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3  uLightDir;
  uniform vec3  uColorLit;
  uniform vec3  uColorShadow;
  uniform vec3  uColorHot;
  uniform float uSteps;
  uniform sampler2D uReveal;
  uniform float uRevealMix;

  varying vec3 vNormalView;
  varying vec3 vTint;
  varying float vShatter;
  varying vec2  vRevealUv;

  void main() {
    float ndl = dot(normalize(vNormalView), normalize(uLightDir)) * 0.5 + 0.5;
    float stepped = floor(ndl * uSteps) / max(uSteps - 1.0, 1.0);

    vec3 base = mix(uColorShadow, uColorLit, clamp(stepped, 0.0, 1.0)) * vTint;
    // 飛んだ破片ほど熱色に寄せる
    vec3 color = mix(base, uColorHot, vShatter * 0.55);

    // 着地した位置の画面座標で絵を引く。画面外は絵を持たない
    if (uRevealMix > 0.001) {
      vec4 art = texture2D(uReveal, clamp(vRevealUv, 0.0, 1.0));
      float inside = step(0.0, vRevealUv.x) * step(vRevealUv.x, 1.0)
                   * step(0.0, vRevealUv.y) * step(vRevealUv.y, 1.0);
      color = mix(color, art.rgb, uRevealMix * art.a * inside);
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
