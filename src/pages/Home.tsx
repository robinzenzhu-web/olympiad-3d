import { content } from '../content'
import { groupBySeries } from '../catalog'
import { problemHref } from '../router'
import { ContentErrors } from './ContentErrors'

const excerpt = (s: string, n = 40) => {
  const chars = Array.from(s.replace(/\s+/g, ' ').trim())
  return chars.length > n ? chars.slice(0, n).join('') + '…' : chars.join('')
}

export function Home() {
  const { problems, errors } = content
  const groups = groupBySeries(problems.map((p) => p.problem))
  return (
    <div className="page">
      <header className="home-head">
        <h1>小学奥数 3D 分步讲解</h1>
        <p>选一道题，一步一步看明白。</p>
      </header>
      <ContentErrors errors={errors} />
      {problems.length === 0 ? (
        <p className="empty">还没有可用的题目。把题目 JSON 放进 content/problems/ 就会出现在这里。</p>
      ) : (
        groups.map((g) => (
          <section key={g.name} className="series" aria-label={g.name}>
            <h2 className="series-title">{g.name}</h2>
            <div className="grid">
              {g.problems.map((p) => (
                <a key={p.id} className="problem-card" href={problemHref(p.id)}>
                  {p.section && <span className="chip section">{p.section}</span>}
                  <h3>{p.title}</h3>
                  <div className="meta">
                    {p.grade && p.grade.length > 0 && <span className="chip grade">{p.grade.join('、')} 年级</span>}
                    {p.tags?.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="excerpt">{excerpt(p.problem)}</p>
                  <span className="steps-count">{p.steps.length} 步讲解</span>
                </a>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
