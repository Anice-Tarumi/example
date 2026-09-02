/**
 * 走査する映像の「信号の悪さ」。
 *
 * ブラウン管もホログラムも、絵が壊れて見える理由は同じところにある。
 * 走査して像を作る以上、乱れは**走査線の方向に伸びる**。等方な粒を乗せても
 * 「ノイズを貼った板」にしかならない。
 *
 * ここに置くのは管の物理ではなく信号のほうだけ。樽型歪み・蛍光体マスク・
 * 周縁減光はガラス管に固有なので、持ち出さない。
 */

export const SIGNAL = /* glsl */`
  /*
   * sin ベースの hash は座標が大きいと（画素座標は数百〜数千）
   * sin の引数が桁あふれして精度が落ち、乱数ではなく滑らかな関数になる。
   * 画素座標を直接入れるので、大きい入力に耐えるものを使う。
   */
  float signalHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  /*
   * 砂嵐は uv ではなく**画素**を種にする。
   * uv に固定周波数を掛けると、画面が遠いほど 1 画素に何粒も入って
   * 折り返し、渦（モアレ）になる。画素座標なら距離に関係なく
   * 常に 1 画素 1 粒。近づいても遠ざかってもざらつきが保たれる。
   */
  float staticNoise(vec2 frag, float t) {
    return signalHash(frag + floor(t * 24.0) * 71.13);
  }

  /** 横に伸びたノイズ。信号の乱れは走査線方向に尾を引く */
  float bandNoise(vec2 frag, float t) {
    return signalHash(vec2(floor(frag.y), floor(t * 18.0)) * 3.7);
  }

  /**
   * 垂直同期のずれ。明るい帯がゆっくり流れる。
   * 戻り値は帯の強さ 0..1。位置ずらしと輝度の両方に使う。
   */
  float rollingBar(float y, float t, float speed) {
    float roll = fract(y + t * speed);
    return smoothstep(0.10, 0.0, roll) + smoothstep(0.9, 1.0, roll);
  }
`
