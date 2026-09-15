/**
 * matcap の引き方。
 *
 * **ビュー空間の法線**から uv を作る。世界空間で引くと、カメラを回したときに
 * 光が世界へ貼り付いたままになり、matcap の前提（光はカメラに対して固定）が
 * 崩れる。
 *
 * 焼いた 3 成分（拡散・粗い鏡面・鋭い鏡面）を、それぞれ別の色で掛けて足す。
 * 1 枚に色まで焼くと、色を変えるだけで焼き直しになる。
 */

export const matcapVertexShader = /* glsl */`
  precision highp float;

  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    // 法線行列を使う。スケールが非一様なとき modelViewMatrix では歪む
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`

export const matcapFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D tMatcap;
  uniform vec3  uBase;      // 拡散の色
  uniform vec3  uRough;     // 粗い鏡面の色
  uniform vec3  uSharp;     // 鋭い鏡面の色
  uniform float uBaseAmt;
  uniform float uRoughAmt;
  uniform float uSharpAmt;
  uniform float uChannels;  // 0 = 単一 matcap / 1 = 多チャンネル

  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 n = normalize(vViewNormal);

    /*
     * 遠近を使っているので視線は一定ではない。**視線と法線から反射を取り、
     * その向きで引く**と、画面の端でも matcap が寄れない。素朴に n.xy で
     * 引くと、端に置いた物が中央と同じ向きを向いて見える。
     */
    vec3 v = normalize(vViewPos);
    vec3 r = reflect(v, n);
    float m = 2.0 * sqrt(r.x * r.x + r.y * r.y + (r.z + 1.0) * (r.z + 1.0));
    vec2 uv = r.xy / m + 0.5;

    vec3 s = texture2D(tMatcap, uv).rgb;

    vec3 col = uBase * s.r * uBaseAmt
             + uRough * s.g * uRoughAmt
             + uSharp * s.b * uSharpAmt;

    // 単一 matcap との比較用。3 成分を混ぜず、濃淡そのままを 1 色で出す
    vec3 single = uBase * (s.r * 0.8 + s.g * 0.5 + s.b * 0.7);

    gl_FragColor = vec4(mix(single, col, uChannels), 1.0);
    #include <colorspace_fragment>
  }
`
