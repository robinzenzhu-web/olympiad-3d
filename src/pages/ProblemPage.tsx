import { Suspense, lazy } from 'react'
import { content, findProblem } from '../content'
import { HOME_HREF } from '../router'
import { ContentErrors } from './ContentErrors'

// 播放器（含 three.js）按需加载，让列表页首屏更快
const Player = lazy(() => import('../player/Player').then((m) => ({ default: m.Player })))

export function ProblemPage({ id }: { id: string }) {
  const problem = findProblem(id)
  if (!problem) {
    const related = content.errors.filter((e) => e.id === id)
    return (
      <div className="page">
        <div className="notice">
          <strong>{related.length ? `题目 “${id}” 的文件有错误，暂时无法播放` : `找不到题目 “${id}”`}</strong>
          <p>
            <a href={HOME_HREF}>← 返回题目列表</a>
          </p>
        </div>
        <ContentErrors errors={related} title="需要修正的地方" />
      </div>
    )
  }
  return (
    <Suspense fallback={<div className="page">加载中…</div>}>
      <Player key={problem.id} problem={problem} />
    </Suspense>
  )
}
