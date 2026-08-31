import antonUrl from './assets/Anton-Regular.ttf?url'
import groteskUrl from './assets/SpaceGrotesk-VariableFont_wght.ttf?url'
import jpUrl from './assets/ZenKakuGothicNew-Bold.ttf?url'

/**
 * フォントの読み込み。
 *
 * **canvas は未ロードのフォントを黙って代替フォントで描く。** 例外も警告も出ない。
 * `ctx.font` に指定した family が使えなければ、勝手に sans-serif で塗って終わる。
 * SDF を焼く前に必ず `FontFace.load()` の完了を待つこと。
 *
 * 日本語フォントは 2MB あるので、選ばれたときだけ読む。
 */

export const FONTS = {
  anton: {
    label: 'Anton',
    family: 'ShowcaseAnton',
    url: antonUrl,
    weight: '400',
    sample: 'SHOWCASE',
  },
  grotesk: {
    label: 'Space Grotesk',
    family: 'ShowcaseGrotesk',
    url: groteskUrl,
    weight: '700',
    sample: 'SHOWCASE',
  },
  jp: {
    label: 'Zen Kaku (JP)',
    family: 'ShowcaseJP',
    url: jpUrl,
    weight: '700',
    sample: '技術検証',
  },
}

export const FONT_OPTIONS = Object.fromEntries(
  Object.entries(FONTS).map(([id, f]) => [f.label, id]),
)

const loaded = new Map()

/** 同じフォントを二度読まない。読み込み中の Promise を共有する */
export function loadFont(id) {
  const font = FONTS[id] || FONTS.anton
  if (loaded.has(font.family)) return loaded.get(font.family)

  const face = new FontFace(font.family, `url(${font.url})`, { weight: font.weight })
  const p = face.load().then((f) => {
    document.fonts.add(f)
    return font
  })
  loaded.set(font.family, p)
  return p
}
