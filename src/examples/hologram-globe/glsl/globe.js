import { HOLO } from './holo'

/**
 * 地球儀の本体。陸の点・海岸線・外殻・投影の光錐。
 *
 * どれも同じ `HOLO` を通す。別々に色を作ると、同じ装置から出た光に見えない。
 */

/** 陸に置いた点 */
export const dotVertexShader = /* glsl */`
  precision highp float;
  ${HOLO}

  uniform float uProj;
  uniform float uSize;
  uniform float uRadius;

  varying float vDim;

  void main() {
    vec3 p = holoGlitch(position * uRadius);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    /*
     * 裏側の点も描く。**消すと球ではなく皿に見える。**
     * ただし手前と同じ明るさだと前後が分からないので落とす。
     */
    vec3 n = normalize(mat3(modelMatrix) * position);
    vec3 view = normalize(cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz);
    float facing = dot(n, view);
    float back = smoothstep(-0.15, 0.35, facing);

    float scan = holoScan(position.y);
    vDim = (0.35 + back * 0.65) * (1.0 + scan * uScanGain) * holoFlicker(position.y);

    gl_PointSize = uSize * uProj * 0.01 / max(0.001, -mv.z);
  }
`

export const dotFragmentShader = /* glsl */`
  precision highp float;
  uniform vec3 uTint;
  uniform float uGain;
  varying float vDim;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float a = smoothstep(0.25, 0.05, d);
    gl_FragColor = vec4(uTint * vDim * uGain * a, 1.0);
    #include <colorspace_fragment>
  }
`

/** 海岸線。点だけだと大陸の形が読めない */
export const lineVertexShader = /* glsl */`
  precision highp float;
  ${HOLO}

  uniform float uRadius;
  varying float vDim;

  void main() {
    vec3 p = holoGlitch(position * uRadius);
    vec4 world = modelMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;

    vec3 n = normalize(mat3(modelMatrix) * position);
    float back = smoothstep(-0.15, 0.35, dot(n, normalize(cameraPosition - world.xyz)));
    vDim = (0.22 + back * 0.78) * (1.0 + holoScan(position.y) * uScanGain) * holoFlicker(position.y);
  }
`

export const lineFragmentShader = /* glsl */`
  precision highp float;
  uniform vec3 uTint;
  uniform float uGain;
  varying float vDim;
  void main() {
    gl_FragColor = vec4(uTint * vDim * uGain, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * 外殻。点と線だけだと中身の詰まった球に見えない。
 * 縁だけ光る薄い球を 1 枚かぶせて、体積があることを示す。
 */
export const shellVertexShader = /* glsl */`
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vObjY;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - world.xyz;
    vObjY = position.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const shellFragmentShader = /* glsl */`
  precision highp float;
  ${HOLO}

  uniform float uGain;
  uniform float uPower;

  varying vec3 vNormal;
  varying vec3 vView;
  varying float vObjY;

  void main() {
    float f = holoFresnel(vNormal, vView, uPower);
    float a = f * uGain * (1.0 + holoScan(vObjY) * uScanGain * 0.5) * holoFlicker(vObjY);
    gl_FragColor = vec4(uTint * a, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * 投影の光錐。台座から像へ向かって広がる。
 *
 * 錐の側面も**縁ほど明るく**する。均一に塗ると、光ではなく円錐の板に見える。
 */
export const coneVertexShader = /* glsl */`
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - world.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const coneFragmentShader = /* glsl */`
  precision highp float;
  ${HOLO}

  uniform float uGain;

  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;

  void main() {
    // 縁ほど明るい。錐を横から見たとき、side が寝ている所が縁になる
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    // 上ほど薄い。像に近づくにつれ光が散る
    float fall = smoothstep(1.0, 0.0, vUv.y);
    // 埃を照らしている感じ。細かい横縞をゆっくり流す
    float dust = 0.75 + 0.25 * sin(vUv.y * 60.0 - uTime * 2.0);
    float a = rim * fall * dust * uGain * holoFlicker(vUv.y);
    gl_FragColor = vec4(uTint * a, 1.0);
    #include <colorspace_fragment>
  }
`
