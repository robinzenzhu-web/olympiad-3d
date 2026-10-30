import type { Step } from '../schema/problem'
import { usePlayer } from './store'

const letter = (i: number) => String.fromCharCode(65 + i)

/** 选择题：选完立刻显示对错与解析；可以改选；不作答也能点「下一步」 */
export function Quiz({ step, index }: { step: Step; index: number }) {
  const chosen = usePlayer((s) => s.quiz[index])
  const answer = usePlayer((s) => s.answer)
  const options = step.options ?? []
  const done = chosen !== undefined
  const correct = done && chosen === step.answer

  return (
    <div className="quiz">
      <p className="quiz-q">{step.question}</p>
      <div className="options" role="group" aria-label="选项">
        {options.map((o, i) => {
          const cls = ['option']
          if (done && i === chosen) cls.push(correct ? 'right' : 'wrong')
          return (
            <button key={i} type="button" className={cls.join(' ')} aria-pressed={chosen === i} onClick={() => answer(index, i)}>
              <span className="opt-key">{letter(i)}</span>
              <span>{o}</span>
            </button>
          )
        })}
      </div>
      {done && (
        <div className={correct ? 'feedback ok' : 'feedback bad'} role="status">
          <strong>{correct ? '✔ 答对了！' : `✘ 不对哦，正确答案是 ${letter(step.answer ?? 0)}`}</strong>
          {step.explanation && <span> {step.explanation}</span>}
        </div>
      )}
      {!done && <p className="hint">选一个答案试试，也可以直接点“下一步”看讲解。</p>}
    </div>
  )
}
