import { Canvas } from '@react-three/fiber'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import Boards from '../lab/Boards'
import Backdrop from '../lab/Backdrop'
import Environment from '../lab/Environment'
import Dof from '../lab/Dof'
import { examples } from '../registry'
import './lab.css'

/**
 * ラボのトップ。
 *
 * 領域ごとの板を並べて選ばせる。**文字だけの目次にしない。** 何をやって
 * いる場所かは、並んでいる絵そのものが説明する。
 *
 * 一覧の器（サイドバー・検索・タグ）はここには出さない。あれは 39 件を
 * 絞り込むための道具で、入口に置くと倉庫の入口に見える。
 */

/** 板に流す絵。サムネイルが焼けている example から拾う */
function useBoardTextures() {
  const [maps, setMaps] = useState([])

  useEffect(() => {
    const picks = examples.filter((e) => e.thumbUrl).slice(0, 10)
    if (!picks.length) return
    const loader = new THREE.TextureLoader()
    let alive = true
    /*
     * 1 枚でも落ちたら全部止まる、という作りにしない。**落ちた物だけ捨てる。**
     * `Promise.all` は 1 つの拒否で全体が拒否され、しかも受け手が無いと
     * 未処理の拒否として例外に化ける。
     */
    Promise.allSettled(picks.map((e) => loader.loadAsync(e.thumbUrl))).then((res) => {
      if (!alive) return
      const list = []
      res.forEach((r, i) => {
        if (r.status !== 'fulfilled') {
          console.warn('[lab] サムネイルを読めなかった:', picks[i].slug)
          return
        }
        const t = r.value
        t.colorSpace = THREE.SRGBColorSpace
        t.minFilter = THREE.LinearMipmapLinearFilter
        t.generateMipmaps = true
        list.push(t)
      })
      setMaps(list)
    })
    return () => { alive = false }
  }, [])

  return maps
}

export default function Lab() {
  const focusRef = useRef(0)
  const [focus, setFocus] = useState(0)
  const maps = useBoardTextures()

  const boards = useMemo(() => [
    {
      id: 'works',
      to: '/works',
      label: 'Works',
      sub: '映像・CG の成果物',
      desc: 'CG チームが作った映像と、その裏側で組んだ仕組み。',
      tint: '#8b7f72',
      textures: null,
    },
    {
      id: 'experiments',
      to: '/experiments',
      label: 'Experiments',
      sub: `ブラウザで動く技術 ${examples.length} 件`,
      desc: 'WebGL と DOM で「どこまでできるか」を 1 件ずつ実装して確かめた記録。ゲームや AR もここに入る。全部その場で触れる。',
      tint: '#6f8ba8',
      textures: maps,
    },
  ], [maps])

  const current = boards[Math.max(0, Math.min(boards.length - 1, focus))]

  return (
    <div className="lab">
      <Canvas
        className="lab__canvas"
        camera={{ position: [0, 0, 5.2], fov: 35, near: 0.1, far: 60 }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0b0c10']} />
        <Backdrop tint="#0b0c10" />
        <Environment fog="#0b0c10" />
        <Boards boards={boards} focusRef={focusRef} onFocus={setFocus} />
        {/* 最後に置く。場面を焼いてから後処理で出す */}
        <Dof focus={5.6} range={3.0} maxBlur={0.016} bloom={0.55} threshold={0.3} />
      </Canvas>

      <header className="lab__head">
        <span className="lab__mark">anicecompany</span>
        <span className="lab__name">CG &amp; Interactive Lab</span>
      </header>

      {/*
        * 板の説明は DOM で出す。**面に文字を焼かない。**
        * 焼くと読めない大きさになるし、選択もコピーもできない。
        */}
      <div className="lab__meta">
        <p className="lab__index">
          {String(focus + 1).padStart(2, '0')} / {String(boards.length).padStart(2, '0')}
        </p>
        <h1 className="lab__title">{current.label}</h1>
        <p className="lab__sub">{current.sub}</p>
        <p className="lab__desc">{current.desc}</p>
        <Link className="lab__enter" to={current.to}>入る →</Link>
      </div>

      <nav className="lab__nav" aria-label="セクション">
        {boards.map((b, i) => (
          <Link
            key={b.id}
            to={b.to}
            className={`lab__nav-item${i === focus ? ' is-current' : ''}`}
          >
            {b.label}
          </Link>
        ))}
      </nav>

      <p className="lab__hint">ドラッグ / ホイールで送る · 板を押して入る</p>
    </div>
  )
}
