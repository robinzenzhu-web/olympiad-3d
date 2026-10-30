import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import type { Problem, Step } from '../schema/problem'
import { Explore } from './Explore'
import { Formula } from './Formula'
import { Quiz } from './Quiz'

// ---------- 讲解文字：支持 **加粗**、空行分段、"- " 开头的列表 ----------
type Block = { t: 'p'; lines: string[] } | { t: 'ul'; items: string[] }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let cur: Block | null = null
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      cur = null
    } else if (/^\s*[-•]\s+/.test(line)) {
      if (cur?.t !== 'ul') {
        cur = { t: 'ul', items: [] }
        blocks.push(cur)
      }
      cur.items.push(line.replace(/^\s*[-•]\s+/, ''))
    } else {
      if (cur?.t !== 'p') {
        cur = { t: 'p', lines: [] }
        blocks.push(cur)
      }
      cur.lines.push(line)
    }
  }
  return blocks
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  )
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="rich">
      {parseBlocks(text).map((b, i) =>
        b.t === 'p' ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}

/** 配图路径相对 public/；http(s) 与绝对路径原样使用 */
export function assetUrl(src: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src
  return import.meta.env.BASE_URL + src.replace(/^\/+/, '')
}

const TYPE_LABEL: Record<NonNullable<Step['type']>, string> = { normal: '', quiz: '小测验', explore: '动手探索' }

interface Props {
  problem: Problem
  step: Step
  index: number
}

export function StepCard({ problem, step, index }: Props) {
  const total = problem.steps.length
  const type = step.type ?? 'normal'
  const isLast = index === total - 1
  const root = useRef<HTMLDivElement>(null)

  // 换步后回到卡片顶部
  useEffect(() => {
    root.current?.parentElement?.scrollTo({ top: 0 })
  }, [index])

  return (
    <div className="step-card" ref={root}>
      <div className="step-meta">
        <span>
          第 {index + 1} / {total} 步
        </span>
        {TYPE_LABEL[type] && <span className={`tag tag-${type}`}>{TYPE_LABEL[type]}</span>}
      </div>
      <h2 className="step-title">{step.title}</h2>
      {step.narration && <RichText text={step.narration} />}
      {step.image && <img className="step-image" src={assetUrl(step.image)} alt={step.title} />}
      {step.formula && <Formula tex={step.formula} />}
      {type === 'quiz' && <Quiz step={step} index={index} />}
      {type === 'explore' && <Explore step={step} index={index} />}
      {isLast && problem.answer && (
        <div className="answer-box">
          <strong>答案：</strong>
          {problem.answer}
        </div>
      )}
    </div>
  )
}
