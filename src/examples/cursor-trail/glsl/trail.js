/**
 * カーソルの軌跡。
 *
 * 位置の履歴を **N×1 のテクスチャ**に持つ。
 * 左端がカーソルの現在位置で、右へ行くほど過去。各テクセルは毎フレーム
 * 「左隣」へ寄っていくので、値が右へ流れていくシフトレジスタになる。
 *
 * 頂点を CPU で毎フレーム書き換える実装だと、長さを伸ばすほど転送が増える。
 * 履歴をテクスチャに置けば、ジオメトリは**一度作った円筒のまま**で、
 * 頂点シェーダーが自分の担当リングの位置をテクスチャから引くだけで済む。
 */

export const quadVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const trailUpdateShader = /* glsl */`
  precision highp float;

  uniform sampler2D tPos;
  uniform vec3  uCursor;
  uniform vec2  uSize;
  uniform float uLag;     // 0 に近いほど素早く左隣へ追いつく
  uniform float uInit;    // 1 なら全部カーソル位置で埋める

  void main() {
    if (uInit > 0.5) {
      gl_FragColor = vec4(uCursor, 1.0);
      return;
    }

    // 左端は常にカーソルそのもの
    if (gl_FragCoord.x <= 1.0) {
      gl_FragColor = vec4(uCursor, 1.0);
      return;
    }

    vec2 uv = gl_FragCoord.xy / uSize;
    vec2 left = (gl_FragCoord.xy - vec2(1.0, 0.0)) / uSize;

    vec3 self = texture2D(tPos, uv).xyz;
    vec3 prev = texture2D(tPos, left).xyz;

    /*
     * uLag = 0 なら純粋なシフトレジスタ。1 フレームに 1 テクセルだけ右へ流れ、
     * 履歴の長さ = 直近 N フレームぶんの軌跡になる。
     *
     * **大きくしすぎてはいけない。** 値が右へ伝わる速さが (1 - uLag) 倍に落ちる
     * ので、尾の方が何百フレームも前の位置に取り残され、そこまで細い針が伸びる。
     * 少しだけ入れると角が丸まって、線が滑らかに引き伸ばされる。
     */
    gl_FragColor = vec4(mix(prev, self, uLag), 1.0);
  }
`

/**
 * MeshStandardMaterial に差し込む頂点の書き換え。
 *
 * 自前のシェーダーで書くとライティングと環境マップを全部再実装することになる。
 * 組み込みマテリアルの `begin_vertex` と `beginnormal_vertex` だけ差し替えれば、
 * 金属もマットも既存の質感がそのまま使える。
 */
export const trailVertexHead = /* glsl */`
  attribute vec2 computeUV;

  uniform sampler2D tPos;
  uniform vec2  uDataSize;
  uniform float uRadius;
  uniform float uTaper;
  uniform float uSpeedWidth;
  uniform float uHeadRadius;

  varying float vAlong;

  /** 進行方向を z 軸に合わせる回転。up と平行になると縮退するので保険を入れる */
  mat3 dirFrame(vec3 dir, vec3 up) {
    if (abs(dot(dir, up)) > 0.999) up = vec3(1.0, 0.0, 0.0);
    vec3 x = normalize(cross(up, dir));
    vec3 y = normalize(cross(dir, x));
    return mat3(x, y, dir);
  }
`

export const trailBeginVertex = /* glsl */`
  float u = computeUV.x;
  vAlong = u;

  float du = 1.0 / uDataSize.x;
  vec3 p0 = texture2D(tPos, vec2(u, 0.5)).xyz;
  vec3 p1 = texture2D(tPos, vec2(u + du, 0.5)).xyz;

  vec3 delta = p0 - p1;
  /*
   * 太さに使う「速さ」は 1 区間だと隣り合うリングでばらつき、
   * 数珠つなぎの玉に見える。前後を均して滑らかにする。
   */
  float seg = (length(delta)
    + length(texture2D(tPos, vec2(u + du, 0.5)).xyz - texture2D(tPos, vec2(u + du * 2.0, 0.5)).xyz)
    + length(texture2D(tPos, vec2(max(u - du, 0.0), 0.5)).xyz - p0)) / 3.0;
  // 止まっているとリングが重なって方向が出ない。前フレームの向きに頼らず z を向かせる
  float dl = length(delta);
  vec3 dir = dl > 1e-5 ? delta / dl : vec3(0.0, 0.0, 1.0);
  mat3 frame = dirFrame(dir, vec3(0.0, 1.0, 0.0));

  /*
   * 太さ。
   *   端は細らせる（切り口が円で終わると棒に見える）
   *   速いところは細くする（インクが伸びる）
   */
  float taper = smoothstep(0.0, 0.04, u) * smoothstep(1.0, 0.72, u);
  float fast = clamp(0.02 / max(seg, 1e-4), 0.35, 1.4);
  float w = uRadius * mix(1.0, taper, uTaper) * mix(1.0, fast, uSpeedWidth);
  w *= mix(uHeadRadius, 1.0, smoothstep(0.0, 0.12, u));

  vec3 transformed = p0 + frame * vec3(position.xy * w, 0.0);
`

export const trailBeginNormal = /* glsl */`
  vec3 nP0 = texture2D(tPos, vec2(computeUV.x, 0.5)).xyz;
  vec3 nP1 = texture2D(tPos, vec2(computeUV.x + 1.0 / uDataSize.x, 0.5)).xyz;
  vec3 nDelta = nP0 - nP1;
  float nSeg = length(nDelta);
  vec3 nDir = nSeg > 1e-5 ? nDelta / nSeg : vec3(0.0, 0.0, 1.0);
  vec3 objectNormal = normalize(dirFrame(nDir, vec3(0.0, 1.0, 0.0)) * vec3(normal.xy, 0.0));
`
