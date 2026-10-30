import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/** KaTeX 公式；LaTeX 写错时 KaTeX 会把错误内容以红字显示，不会抛异常 */
export function Formula({ tex }: { tex: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: true, throwOnError: false, strict: 'ignore', output: 'html' }),
    [tex],
  )
  return <div className="formula" dangerouslySetInnerHTML={{ __html: html }} />
}
