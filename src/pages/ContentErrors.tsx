import type { ContentError } from '../content'

/** 题目文件出错时显示：文件名 / 第几步 / 字段 / 错误信息 */
export function ContentErrors({ errors, title }: { errors: ContentError[]; title?: string }) {
  if (errors.length === 0) return null
  return (
    <section className="notice error" role="alert">
      <strong>{title ?? `有 ${errors.length} 处题目文件的错误（其余正确的题目不受影响）`}</strong>
      <ul className="error-list">
        {errors.map((e, i) => (
          <li key={i}>
            <code className="err-file">{e.file}</code>
            <span className="err-where">{e.step !== undefined ? `第 ${e.step + 1} 步` : '题目整体'}</span>
            <span className="err-field">
              字段 <code>{e.field}</code>
            </span>
            <span className="err-msg">{e.message}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
