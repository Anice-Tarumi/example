import { SIGNAL } from '../../../shared/glsl/signal'

/**
 * ホログラムの共通部分。
 *
 * CRT から持ってこられるのは信号の乱れだけで、それだけでは色の付いた模型に
 * しかならない。ホログラムに見えるかどうかは**光として置けているか**で決まる。
 * ここで重ねているのは 4 つ。
 *
 *   1. フレネル     … 視線に寝た面ほど明るい。最大の手掛かり
 *   2. 物体空間の走査 … 明るい帯が像を這い上がる。画面 UV でやると板に見える
 *   3. 切片のずれ   … たまに横一列が横へ飛ぶ。CRT の裂けを 3D でやる
 *   4. 明滅と欠落   … 投影が一瞬途切れる
 *
 * 加算合成で描き、深度は書かない。光なので裏側が透ける。
 */

export const HOLO = /* glsl */`
  ${SIGNAL}

  uniform float uTime;
  uniform vec3  uTint;
  uniform float uScanFreq;    // 走査帯の細かさ
  uniform float uScanSpeed;
  uniform float uScanGain;
  uniform float uGlitch;      // 切片のずれの強さ
  uniform float uFlicker;

  /**
   * 走査帯。**物体空間の高さ**で数える。
   * 画面 UV で数えると、像がどう転がっても帯は画面に貼り付いたままで、
   * 「板に模様を描いた」ようにしか見えない。
   */
  float holoScan(float objY) {
    float band = fract(objY * uScanFreq - uTime * uScanSpeed);
    // 細い明帯と、その裏の広く薄い持ち上がり
    return smoothstep(0.94, 1.0, band) * 1.6 + smoothstep(0.0, 0.6, band) * 0.18;
  }

  /**
   * 切片のずれ。高さで切った一列ぶんを横へ飛ばす。
   *
   * 常時出しっぱなしにしない。**たまに起きるから壊れて見える。**
   * 出ている間だけ、帯ごとに違う量だけずらす。
   */
  vec3 holoGlitch(vec3 p) {
    // 発生の窓。時間の粗い乱数が高いときだけ開く
    float gate = smoothstep(0.86, 0.98, signalHash(vec2(floor(uTime * 2.3), 7.1)));
    if (gate <= 0.0) return p;
    float slice = floor(p.y * 26.0 + uTime * 3.0);
    float amt = (signalHash(vec2(slice, floor(uTime * 12.0))) - 0.5);
    // 全部の帯を動かさない。動く帯と残る帯が混ざるほうが壊れて見える
    float pick = step(0.55, signalHash(vec2(slice, 3.3)));
    p.x += amt * gate * pick * uGlitch;
    return p;
  }

  /** 視線に寝た面ほど明るい。ホログラムらしさの大半はここ */
  float holoFresnel(vec3 normal, vec3 viewDir, float power) {
    return pow(1.0 - abs(dot(normalize(normal), normalize(viewDir))), power);
  }

  /** 投影の途切れ。粗い横帯が流れる成分を混ぜる */
  float holoFlicker(float objY) {
    float f = 1.0 + (signalHash(vec2(floor(uTime * 18.0), 1.7)) - 0.5) * uFlicker;
    f *= 1.0 - step(0.5, fract(objY * 3.0 - uTime * 9.0)) * uFlicker * 0.12;
    return f;
  }
`
