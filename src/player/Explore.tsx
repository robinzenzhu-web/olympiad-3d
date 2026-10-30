import type { Step } from '../schema/problem'
import { ExprError, renderTemplate } from '../engine/expr'
import { Formula } from './Formula'
import { usePlayer } from './store'

/** 探索：参数滑块（3D 画面由 Player 根据同一个值实时重建）+ formulaTemplate 实时数值 */
export function Explore({ step, index }: { step: Step; index: number }) {
  const c = step.control!
  const stored = usePlayer((s) => s.explore[index])
  const setExplore = usePlayer((s) => s.setExplore)
  const value = stored ?? c.default

  let tex: string | null = null
  let err: string | null = null
  if (step.formulaTemplate) {
    try {
      tex = renderTemplate(step.formulaTemplate, { [c.param]: value })
    } catch (e) {
      err = e instanceof ExprError ? e.message : String(e)
    }
  }

  return (
    <div className="explore">
      <label className="slider-row">
        <span className="slider-label">
          {c.param} = <output>{value}</output>
        </span>
        <input
          type="range"
          min={c.min}
          max={c.max}
          step={c.step ?? 1}
          value={value}
          aria-label={`参数 ${c.param}`}
          onChange={(e) => setExplore(index, Number(e.target.value))}
        />
        <span className="slider-range">
          <span>{c.min}</span>
          <span>{c.max}</span>
        </span>
      </label>
      {tex && <Formula tex={tex} />}
      {err && <p className="err-inline">公式计算出错：{err}</p>}
    </div>
  )
}
