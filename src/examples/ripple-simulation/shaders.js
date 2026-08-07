export const quadVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * 波動方程式の離散化を ping-pong FBO で回す。
 *   next = (n + s + e + w) * 0.5 - prev
 * R に現在の高さ、G に 1 フレーム前の高さを持つ。
 * 端は ClampToEdge なので、そのまま反射境界として振る舞う。
 */
export const simFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D uPrev;
  uniform vec2  uTexel;
  uniform vec2  uAspect;      // 注入を真円にするための補正
  uniform vec2  uPointer;
  uniform float uPointerForce;
  uniform vec2  uDrop;
  uniform float uDropForce;
  uniform float uRadius;
  uniform float uDamping;

  varying vec2 vUv;

  float inject(vec2 uv, vec2 center, float force) {
    if (abs(force) < 0.0001) return 0.0;
    float d = distance(uv * uAspect, center * uAspect);
    return force * smoothstep(uRadius, 0.0, d);
  }

  void main() {
    vec4 state = texture2D(uPrev, vUv);
    float curr = state.r;
    float prev = state.g;

    float n = texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r;
    float s = texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r;
    float e = texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r;
    float w = texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r;

    float next = (n + s + e + w) * 0.5 - prev;
    next *= uDamping;

    next += inject(vUv, uPointer, uPointerForce);
    next += inject(vUv, uDrop, uDropForce);

    next = clamp(next, -2.0, 2.0);

    gl_FragColor = vec4(next, curr, 0.0, 1.0);
  }
`

/**
 * 高さフィールドの勾配から法線を作り、背景テクスチャを屈折させる。
 * uMode で見せ方を切り替える。
 */
export const renderFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D uState;
  uniform sampler2D uTexture;
  uniform vec2  uTexel;
  uniform vec2  uTexScale;
  uniform float uRefraction;
  uniform float uDispersion;
  uniform float uSpecular;
  uniform float uShininess;
  uniform vec3  uLightDir;
  uniform int   uMode;

  varying vec2 vUv;

  vec3 heightToNormal(out float hx, out float hy) {
    hx = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r
       - texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
    hy = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r
       - texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
    return normalize(vec3(-hx, -hy, 0.12));
  }

  void main() {
    float hx, hy;
    vec3 normal = heightToNormal(hx, hy);
    vec2 offset = vec2(hx, hy) * uRefraction;
    vec2 base = vUv * uTexScale;

    vec3 color;

    if (uMode == 3) {
      // 高さフィールドをそのまま可視化
      float h = texture2D(uState, vUv).r;
      vec3 warm = vec3(1.0, 0.45, 0.1);
      vec3 cool = vec3(0.1, 0.6, 1.0);
      color = mix(vec3(0.02), h > 0.0 ? warm : cool, clamp(abs(h) * 6.0, 0.0, 1.0));
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
      return;
    }

    if (uMode == 2) {
      // 色収差つき屈折：RGB を少しずつ違う量だけずらす
      float r = texture2D(uTexture, base + offset * (1.0 + uDispersion)).r;
      float g = texture2D(uTexture, base + offset).g;
      float b = texture2D(uTexture, base + offset * (1.0 - uDispersion)).b;
      color = vec3(r, g, b);
    } else {
      color = texture2D(uTexture, base + offset).rgb;
    }

    float spec = pow(max(dot(normal, normalize(uLightDir)), 0.0), uShininess);
    color += spec * uSpecular;

    if (uMode == 1) {
      // 金属寄り：下地を暗く落として反射を強調する
      color = mix(color * 0.25, vec3(1.0), spec * 0.9);
      float rim = pow(1.0 - abs(normal.z), 2.0);
      color += rim * 0.35;
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
