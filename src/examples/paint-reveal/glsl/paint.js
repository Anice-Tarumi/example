/**
 * ai-quest の ScreenPaint 系シェーダーの移植。
 *
 *   1. paint … カーソルの移動線分をブラシとして速度場を ping-pong で蓄積・減衰する
 *   2. fill  … その速度場を「絵の具マスク」に変換する。前フレームを薄めながら
 *              累積するので、塗った跡が残り、重ね塗りで濃くなる
 *   3. blur  … 速度場を低解像度でぼかし、流体的な広がりを作って 1 に還す
 */
export const quadVertexShader = /* glsl */`
  varying vec2 v_uv;
  void main() {
    v_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** 速度場の蓄積。data.xy = 速度(0.5 が静止), data.z = ブラシ重み, data.w = 補助重み */
export const paintFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D u_lowPaintTexture;
  uniform sampler2D u_prevPaintTexture;
  uniform vec2  u_paintTexelSize;
  uniform vec4  u_drawFrom;      // [x, y, radius, 1]
  uniform vec4  u_drawTo;
  uniform float u_pushStrength;
  uniform vec3  u_dissipations;  // [velocity, weight1, weight2]
  uniform vec2  u_vel;
  uniform float u_curlScale;
  uniform float u_curlStrength;

  varying vec2 v_uv;

  /** 線分 ab と点 p の距離、および線分上のパラメータ t */
  vec2 sdSegment(in vec2 p, in vec2 a, in vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return vec2(length(pa - ba * h), h);
  }

  vec2 hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
  }

  /** 値と導関数を同時に返す gradient noise。x = 値, yz = 勾配 */
  vec3 noised(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

    vec2 ga = hash(i + vec2(0.0, 0.0));
    vec2 gb = hash(i + vec2(1.0, 0.0));
    vec2 gc = hash(i + vec2(0.0, 1.0));
    vec2 gd = hash(i + vec2(1.0, 1.0));

    float va = dot(ga, f - vec2(0.0, 0.0));
    float vb = dot(gb, f - vec2(1.0, 0.0));
    float vc = dot(gc, f - vec2(0.0, 1.0));
    float vd = dot(gd, f - vec2(1.0, 1.0));

    return vec3(
      va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd),
      ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) +
        du * (u.yx * (va - vb - vc + vd) + vec2(vb, vc) - va)
    );
  }

  void main() {
    // カーソルの前フレーム位置→現在位置を線分としてブラシを引く。
    // 点で描くと速く動かしたときに軌跡が途切れる。
    vec2 res = sdSegment(gl_FragCoord.xy, u_drawFrom.xy, u_drawTo.xy);
    vec2 radiusWeight = mix(u_drawFrom.zw, u_drawTo.zw, res.y);
    float d = 1.0 - smoothstep(-0.01, radiusWeight.x, res.x);

    // ぼかした速度場で自分自身を移流させる（流体っぽい広がり）
    vec4 lowData = texture2D(u_lowPaintTexture, v_uv);
    vec2 velInv = (0.5 - lowData.xy) * u_pushStrength;

    // 速度場に curl noise を混ぜて、直線的な軌跡を渦に崩す
    if (u_curlStrength > 0.0) {
      vec3 noise3 = noised(gl_FragCoord.xy * u_curlScale * (1.0 - lowData.xy));
      vec2 noise = noised(
        gl_FragCoord.xy * u_curlScale * (2.0 - lowData.xy * (0.5 + noise3.x) + noise3.yz * 0.1)
      ).yz;
      velInv += noise * (lowData.z + lowData.w) * u_curlStrength;
    }

    vec4 data = texture2D(u_prevPaintTexture, v_uv + velInv * u_paintTexelSize);
    data.xy -= 0.5;

    vec4 delta = (u_dissipations.xxyz - 1.0) * data;

    vec2 newVel = u_vel * d;
    delta += vec4(newVel, radiusWeight.yy * d);
    delta.zw = sign(delta.zw) * max(vec2(0.004), abs(delta.zw));

    data += delta;
    data.xy += 0.5;

    gl_FragColor = clamp(data, vec4(0.0), vec4(1.0));
  }
`

/** 速度場 → 絵の具マスク。r = 塗り跡, gb = UV ディスプレイス, a = オーバーレイ */
export const fillFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D u_prevTexture;
  uniform sampler2D u_screenPaintTexture;
  uniform float u_fadeIntensity;
  uniform float u_paintIntensity;
  uniform float u_distortAmount;

  varying vec2 v_uv;

  void main() {
    vec4 color = vec4(0.0);
    vec4 prevTex = texture2D(u_prevTexture, v_uv);
    vec4 data = texture2D(u_screenPaintTexture, v_uv);

    float weight = (data.z + data.w) * 0.5;
    vec2 vel = (0.5 - data.xy - 0.001) * 2.0 * weight;

    float velAmp = length(vel.xy * 40.0);
    float fillMask = smoothstep(0.0, 0.4, velAmp);

    // 前フレームを少しずつ薄めながら残す。これで塗り跡が蓄積し、
    // 何度も通ったところほど濃くなる
    color.r += clamp(prevTex.r - u_fadeIntensity, 0.0, 1.0);
    color.r += fillMask * u_paintIntensity;
    color.gb += vel * u_distortAmount;
    color.a += smoothstep(0.48, 1.0, data.z * 1.2) * 0.032;

    gl_FragColor = color;
  }
`

/** 分離可能な 9 タップ gaussian blur */
export const blurFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D u_texture;
  uniform vec2 u_delta;

  varying vec2 v_uv;

  void main() {
    vec4 color = texture2D(u_texture, v_uv) * 0.1633;
    vec2 delta = u_delta;
    color += texture2D(u_texture, v_uv - delta) * 0.1531;
    color += texture2D(u_texture, v_uv + delta) * 0.1531;
    delta += u_delta;
    color += texture2D(u_texture, v_uv - delta) * 0.12245;
    color += texture2D(u_texture, v_uv + delta) * 0.12245;
    delta += u_delta;
    color += texture2D(u_texture, v_uv - delta) * 0.0918;
    color += texture2D(u_texture, v_uv + delta) * 0.0918;
    delta += u_delta;
    color += texture2D(u_texture, v_uv - delta) * 0.051;
    color += texture2D(u_texture, v_uv + delta) * 0.051;
    gl_FragColor = color;
  }
`
