import { Link } from 'react-router-dom'

/**
 * 映像・CG の成果物。
 *
 * **中身が無いうちは、空の枠を並べない。** 置き場だけ先に作って、何を置く
 * 場所かを書いておく。プレースホルダの箱を敷き詰めると、逆に貧相に見える。
 */
export default function Works() {
  return (
    <div className="home">
      <header className="home__header">
        <h1 className="home__title">Works</h1>
        <p className="home__subtitle">
          CG チームが作った映像と、その裏側で組んだ仕組みを置く場所。
          いまは準備中。
        </p>
      </header>

      <div className="home__empty">
        <p>公開できる状態になったものから順に並べる。</p>
        <p>
          動くものを先に見たいなら <Link to="/experiments">Experiments</Link> へ。
          ブラウザで触れる実装が並んでいる。
        </p>
      </div>
    </div>
  )
}
