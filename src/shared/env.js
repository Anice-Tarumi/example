import studioUrl from '../assets/env/studio_1k.hdr?url'
import roadUrl from '../assets/env/road_1k.hdr?url'

/**
 * 共有の環境マップ。
 *
 * Poly Haven（CC0）の 2k を 1k へ落として持っている。
 * 反射に使うだけなら 1k で十分で、2k は 1 枚 6MB あって配信に向かない。
 *
 * 板（Lightformer）で代用すると「板が 2 枚映っている」絵になる。
 * 金属やガラスの映り込みは実写の環境が要る。
 */
export const ENV_MAPS = {
  studio: { label: 'Studio', url: studioUrl },
  road: { label: 'Road', url: roadUrl },
}

/** Lightformer で組む選択肢も残す。比較できると違いが分かる */
export const ENV_OPTIONS = {
  Studio: 'studio',
  Road: 'road',
  'Lightformers': 'lightformer',
}
