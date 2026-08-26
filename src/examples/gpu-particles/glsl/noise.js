/**
 * 4D simplex noise (Ashima Arts / Stefan Gustavson, MIT) と、
 * そのポテンシャル場の回転から作る curl noise。
 *
 * curl は定義上 divergence が 0 になるため、パーティクルに湧き出しや
 * 吸い込みが生じず、渦だけが残る。GPGPU パーティクルの定番。
 */
export const noiseGLSL = /* glsl */`
  vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  float mod289f(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permutev4(vec4 x) { return mod289v4(((x * 34.0) + 1.0) * x); }
  float permutef(float x) { return mod289f(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrtv4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float taylorInvSqrtf(float r) { return 1.79284291400159 - 0.85373472095314 * r; }

  vec4 grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p, s;
    p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
    return p;
  }

  #define F4 0.309016994374947451

  float snoise4(vec4 v) {
    const vec4 C = vec4(
      0.138196601125011,   // (5 - sqrt(5)) / 20 = G4
      0.276393202250021,   // 2 * G4
      0.414589803375032,   // 3 * G4
      -0.447213595499958   // -1 + 4 * G4
    );

    vec4 i  = floor(v + dot(v, vec4(F4)));
    vec4 x0 = v - i + dot(i, C.xxxx);

    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyz);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;

    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;

    i = mod289v4(i);
    float j0 = permutef(permutef(permutef(permutef(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permutev4(permutev4(permutev4(permutev4(
                i.w + vec4(i1.w, i2.w, i3.w, 1.0))
              + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
              + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
              + i.x + vec4(i1.x, i2.x, i3.x, 1.0));

    vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);

    vec4 p0 = grad4(j0,   ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);

    vec4 norm = taylorInvSqrtv4(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    p4 *= taylorInvSqrtf(dot(p4, p4));

    vec3 m0 = max(0.6 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;

    return 49.0 * (
      dot(m0 * m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2))) +
      dot(m1 * m1, vec2(dot(p3, x3), dot(p4, x4)))
    );
  }

  /** ポテンシャル場。成分ごとに座標をずらして相関を切る */
  vec3 potential(vec3 p, float t) {
    return vec3(
      snoise4(vec4(p, t)),
      snoise4(vec4(p + vec3(123.4, 234.5, 345.6), t)),
      snoise4(vec4(p + vec3(456.7, 567.8, 678.9), t))
    );
  }

  /**
   * fBm 版 curl noise。
   * オクターブごとに周波数を 2 倍、振幅を persistence 倍していく。
   * 回転は中心差分で取る（解析勾配より安いうえ十分滑らか）。
   */
  vec3 curlNoise(vec3 p, float t, float persistence, int octaves) {
    const float e = 0.08;
    vec3 result = vec3(0.0);
    float freq = 1.0;
    float amp = 1.0;

    for (int i = 0; i < 3; i++) {
      if (i >= octaves) break;

      vec3 q = p * freq;

      vec3 dx = vec3(e, 0.0, 0.0);
      vec3 dy = vec3(0.0, e, 0.0);
      vec3 dz = vec3(0.0, 0.0, e);

      vec3 px0 = potential(q - dx, t);
      vec3 px1 = potential(q + dx, t);
      vec3 py0 = potential(q - dy, t);
      vec3 py1 = potential(q + dy, t);
      vec3 pz0 = potential(q - dz, t);
      vec3 pz1 = potential(q + dz, t);

      // curl F = (∂Fz/∂y - ∂Fy/∂z, ∂Fx/∂z - ∂Fz/∂x, ∂Fy/∂x - ∂Fx/∂y)
      float x = (py1.z - py0.z) - (pz1.y - pz0.y);
      float y = (pz1.x - pz0.x) - (px1.z - px0.z);
      float z = (px1.y - px0.y) - (py1.x - py0.x);

      result += vec3(x, y, z) / (2.0 * e) * amp;

      freq *= 2.0;
      amp *= persistence;
    }

    return result;
  }
`
