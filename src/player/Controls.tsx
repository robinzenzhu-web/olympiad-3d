import { useLayoutEffect, useRef, useState } from 'react'
import type { Step } from '../schema/problem'

interface Props {
  steps: Step[]
  current: number
  onGoto: (i: number) => void
}

/** 底部控制条：上一步 / 步骤圆点（可点击跳转）/ 下一步 */
export function Controls({ steps, current, onGoto }: Props) {
  const last = steps.length - 1
  const dotsRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  // 圆点排不下（手机窄屏 + 步数多）时改用 “6 / 11” 文字：圆点绝不溢出、不压住两侧按钮
  const [cramped, setCramped] = useState(false)

  useLayoutEffect(() => {
    const dots = dotsRef.current
    const row = rowRef.current
    if (!dots || !row) return
    // row 的宽度是“圆点排开本来需要多宽”（它不参与压缩），dots 的宽度是“真正能用多宽”
    const measure = () => setCramped(row.scrollWidth > dots.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(dots)
    ro.observe(row)
    return () => ro.disconnect()
  }, [steps.length])

  return (
    <nav className="controls" aria-label="步骤导航">
      <button type="button" className="btn" disabled={current <= 0} onClick={() => onGoto(current - 1)}>
        ← 上一步
      </button>
      <div className="dots" ref={dotsRef}>
        {cramped && (
          <span className="dots-count" role="status" aria-label={`第 ${current + 1} 步，共 ${steps.length} 步`}>
            {current + 1} / {steps.length}
          </span>
        )}
        <div className={cramped ? 'dots-row offscreen' : 'dots-row'} ref={rowRef} role="tablist" aria-label="步骤">
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === current}
              aria-label={`第 ${i + 1} 步：${s.title}`}
              title={`${i + 1}. ${s.title}`}
              className={['dot', i === current ? 'active' : '', i < current ? 'done' : ''].join(' ').trim()}
              onClick={() => onGoto(i)}
            />
          ))}
        </div>
      </div>
      <button type="button" className="btn primary" disabled={current >= last} onClick={() => onGoto(current + 1)}>
        下一步 →
      </button>
    </nav>
  )
}
