import { useLayoutEffect, useState } from 'react'
import { Leva, levaStore } from 'leva'
import { getCategory } from '../categories'
import { levaTheme } from './levaTheme'

/** キャンバス全面 + 右上コントロールパネル + 左下 info オーバーレイ */
/** 実機幅の境目。CSS のブレークポイントと合わせる */
const NARROW = 860

export default function ExampleLayout({ meta, children }) {
  /*
   * 狭い画面では**説明もパネルも畳んでおく**。
   *
   * 実測すると、leva が画面の 54%、説明札が 33% を覆っていた。合わせて
   * 9 割で、肝心のシーンが左の細い帯しか見えない。既定で開いておくのは、
   * 覆っても困らない広さがあるときだけ。
   */
  const narrow = typeof window !== 'undefined' && window.innerWidth <= NARROW
  const [infoOpen, setInfoOpen] = useState(!narrow)
  const [panelOpen, setPanelOpen] = useState(!narrow)
  const category = getCategory(meta.category)

  /*
   * example を切り替えるたびに leva のストアを空にする。
   *
   * leva は値を**パスで**持つ。どの example も `variant` という同じパスを
   * 使うので、前の example の値が残ったまま次が登録され、新しい方の初期値が
   * 捨てられる。アンマウント時の `disposePaths` は参照カウントを減らすだけで、
   * ボタンとフォルダ以外は `data` に残り続ける。
   *
   * ストアを分ける手もあるが、`useControls` の多くは R3F の Canvas の中に
   * あり、**Canvas は別のレンダラなので React のコンテキストが渡らない**。
   * ここで捨てるのが確実。
   *
   * 捨てるのは**アンマウント時**。leva の登録は useEffect の中なので、
   * 「古い方の後始末 → 新しい方の登録」の順になり、消し過ぎない。
   * 描画中に呼ぶと、レンダー中に別コンポーネントを更新したと React に怒られる。
   */
  useLayoutEffect(() => () => levaStore.dispose(), [])

  return (
    <div className="stage">
      <div className="stage__canvas">{children}</div>

      {/*
        * 狭い画面ではボタンで開閉する。leva 自身のタイトルバーは使わない
        * （`titleBar={false}` で消しているし、開閉の見た目を揃えたい）。
        */}
      <button
        type="button"
        className="stage__panel-toggle"
        onClick={() => setPanelOpen((v) => !v)}
        aria-expanded={panelOpen}
        aria-label="パラメータ"
      >
        {panelOpen ? '✕' : '⚙'}
      </button>

      <div className={`stage__controls${panelOpen ? ' is-open' : ''}`}>
        <Leva fill flat titleBar={false} theme={levaTheme} />
      </div>

      <div className={`stage__info${infoOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="stage__info-toggle"
          onClick={() => setInfoOpen((v) => !v)}
          aria-expanded={infoOpen}
        >
          <span className="stage__info-cat">{category.label}</span>
          <span className="stage__info-title">{meta.title}</span>
          <span className="stage__info-chevron">{infoOpen ? '▾' : '▸'}</span>
        </button>

        {infoOpen && (
          <div className="stage__info-body">
            <p className="stage__info-desc">{meta.description}</p>

            {meta.tags?.length > 0 && (
              <div className="stage__info-tags">
                {meta.tags.map((t) => (
                  <span key={t} className="tag">{t}</span>
                ))}
              </div>
            )}

            {meta.source && (
              <div className="stage__info-meta">
                Inspired by{' '}
                {meta.sourceUrl ? (
                  <a href={meta.sourceUrl} target="_blank" rel="noreferrer">
                    {meta.source}
                  </a>
                ) : (
                  meta.source
                )}
              </div>
            )}

            {meta.note && (
              <div className="stage__info-meta">
                Note: <code>{meta.note}</code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
