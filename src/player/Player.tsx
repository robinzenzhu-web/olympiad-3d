import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { Problem } from '../schema/problem'
import { applyControl, baseSceneRadius, computeCameras, computeStates, initialState } from '../engine/state'
import { Stage } from '../stage/Stage'
import { StageBoundary } from '../stage/StageBoundary'
import { HOME_HREF, problemHref } from '../router'
import { content } from '../content'
import { seriesNeighbors } from '../catalog'
import { Controls } from './Controls'
import { StepCard } from './StepCard'
import { usePlayer } from './store'

/**
 * 播放器：current step → states[step]（explore 步再叠加滑块值）→ <Stage/>。
 * 桌面左右布局 / 手机上下布局由 styles.css 控制。
 */
export function Player({ problem }: { problem: Problem }) {
  // 进入题目时重置播放状态，离开时清理（在 layout effect 里做，不在渲染期间改 store）
  const ready = usePlayer((s) => s.problemId === problem.id)
  useLayoutEffect(() => {
    usePlayer.getState().open(problem.id, problem.steps.length)
    return () => usePlayer.getState().close()
  }, [problem])
  return ready ? <PlayerInner problem={problem} /> : null
}

function PlayerInner({ problem }: { problem: Problem }) {
  const step = usePlayer((s) => s.step)
  const goto = usePlayer((s) => s.goto)
  const resetCamera = usePlayer((s) => s.resetCamera)
  const camReset = usePlayer((s) => s.camReset)
  const exploreValue = usePlayer((s) => s.explore[s.step])
  const [showProblem, setShowProblem] = useState(false)
  const { prev, next } = useMemo(
    () => seriesNeighbors(content.problems.map((p) => p.problem), problem.id),
    [problem.id],
  )

  const computed = useMemo(() => {
    try {
      const states = computeStates(problem)
      return {
        states,
        cameras: computeCameras(problem),
        baseRadius: baseSceneRadius(initialState(problem), states),
        error: null as string | null,
      }
    } catch (e) {
      return { states: [], cameras: [], baseRadius: 1, error: (e as Error).message }
    }
  }, [problem])

  const cur = problem.steps[step]!
  const base = computed.states[step]
  const display = useMemo(() => {
    if (!base) return null
    if (cur.type === 'explore' && cur.control) return applyControl(base, cur, exploreValue ?? cur.control.default)
    return base
  }, [base, cur, exploreValue])

  // 键盘 ← / → 翻页（在滑块上按方向键是调参数，不翻页）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const t = e.target
      if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'button')) return
      const s = usePlayer.getState()
      if (e.key === 'ArrowRight') s.next()
      else if (e.key === 'ArrowLeft') s.prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (computed.error || !display) {
    return (
      <div className="page">
        <div className="notice error">
          <strong>这道题无法播放</strong>
          <p>{computed.error}</p>
          <a href={HOME_HREF}>← 返回列表</a>
        </div>
      </div>
    )
  }

  return (
    <div className="player">
      <header className="topbar">
        <a className="back" href={HOME_HREF}>
          ← 列表
        </a>
        <h1 className="topbar-title">
          {problem.section && <span className="chip section">{problem.section}</span>}
          {problem.title}
        </h1>
        {(prev || next) && (
          <nav className="series-nav" aria-label={problem.series ?? '同系列'}>
            {prev ? (
              <a href={problemHref(prev.id)} title={prev.title}>
                ‹ 上一题
              </a>
            ) : (
              <span className="off">‹ 上一题</span>
            )}
            {next ? (
              <a href={problemHref(next.id)} title={next.title}>
                下一题 ›
              </a>
            ) : (
              <span className="off">下一题 ›</span>
            )}
          </nav>
        )}
        <button type="button" className="btn small" aria-expanded={showProblem} onClick={() => setShowProblem((v) => !v)}>
          {showProblem ? '收起题目' : '查看题目'}
        </button>
      </header>
      {showProblem && (
        <div className="problem-panel">
          <p>{problem.problem}</p>
        </div>
      )}
      <main className="player-main">
        <section className="stage" aria-label="3D 画面">
          <StageBoundary>
            <Stage state={display} camera={computed.cameras[step]!} autoRotate={!!cur.autoRotate} resetToken={camReset} baseRadius={computed.baseRadius} />
          </StageBoundary>
          <button type="button" className="btn small reset-cam" onClick={resetCamera}>
            重置视角
          </button>
        </section>
        <aside className="card">
          <StepCard key={step} problem={problem} step={cur} index={step} />
        </aside>
      </main>
      <Controls steps={problem.steps} current={step} onGoto={goto} />
    </div>
  )
}
