/**
 * 焼いた変形の再生。
 *
 * 組み込みマテリアルの `begin_vertex` と `beginnormal_vertex` だけ差し替える。
 * 自前のシェーダーにすると、ライティングも影も環境マップも書き直しになる。
 *
 * 破片は「どの桁の・何番目か」しか持たない。位置も姿勢もテクスチャから引く。
 * CPU が毎フレーム触るのは、桁ごとの再生位置（uniform 6 個）だけ。
 */

export const vatVertexHead = /* glsl */`
  attribute float aPiece;   // 破片の番号
  attribute float aSlot;    // 何桁目か

  uniform sampler2D tPos;
  uniform sampler2D tRot;
  uniform vec2  uTexSize;   // 破片数, 数字数 × フレーム数
  uniform float uFrames;
  uniform float uRow[8];    // 桁ごとの行（数字 × フレーム数 + フレーム）
  uniform float uSlotX[8];
  uniform float uScale;
  uniform float uDot;      // 粒 1 つの大きさ

  vec3 applyQuat(vec3 v, vec4 q) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }

  vec4 vatFetch(sampler2D tex, float row) {
    // テクセルの中心を突く。境界を踏むと隣の破片や隣のフレームを拾う
    vec2 uv = vec2((aPiece + 0.5) / uTexSize.x, (row + 0.5) / uTexSize.y);
    return texture2D(tex, uv);
  }
`

export const vatBeginVertex = /* glsl */`
  int slot = int(aSlot + 0.5);
  float row = uRow[slot];

  vec4 pos = vatFetch(tPos, row);
  vec4 rot = vatFetch(tRot, row);

  // w は粒の大きさ。散っている間は小さく、揃うと大きくなる
  float s = uScale * uDot * pos.w;

  vec3 transformed = applyQuat(position * s, rot) + pos.xyz * uScale;
  transformed.x += uSlotX[slot];
`

export const vatBeginNormal = /* glsl */`
  int nSlot = int(aSlot + 0.5);
  vec4 nRot = vatFetch(tRot, uRow[nSlot]);
  vec3 objectNormal = applyQuat(normal, nRot);
`
