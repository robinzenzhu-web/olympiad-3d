/**
 * content.ts —— 加载 content/problems/*.json 并校验：
 *   JSON 语法 → zod schema → 引擎语义校验 → 试算 computeStates。
 * 任何一步失败都变成一条「文件名 / 第几步 / 字段 / 错误信息」，不会抛出，也不影响其他题目。
 */
import type { z } from 'zod'
import { ProblemSchema, type Problem } from './schema/problem'
import { validateProblem, ProblemError } from './engine/validate'
import { computeStates } from './engine/state'

export interface ContentError {
  /** 文件名，如 cube-paint-3.json */
  file: string
  /** 尽力从文件里读出的题目 id（可能没有） */
  id?: string
  /** 0 起的步骤下标；undefined = 与具体步骤无关 */
  step?: number
  field: string
  message: string
}

export interface LoadedProblem {
  file: string
  problem: Problem
}

export interface ContentResult {
  problems: LoadedProblem[]
  errors: ContentError[]
}

// ---------- zod 错误 → 中文 ----------
type ZodIssue = z.core.$ZodIssue

const EXPECTED_ZH: Record<string, string> = {
  string: '文字（要加引号）',
  number: '数字',
  int: '整数',
  boolean: 'true 或 false',
  array: '列表 [ ... ]',
  object: '对象 { ... }',
  tuple: '列表 [ ... ]',
}

const CANDIDATES: Record<string, string> = {
  do: 'show、hide、explode、highlight、fade、number、clear、reset、setText、move、fill、setSlots、mark、unmark、remainder、transfer、brace、divider、clearNotes',
  type: 'CubeGrid、CubeStack、Label、Bench、Arrow',
  kind: 'token、block',
}

function describeIssue(issue: ZodIssue): string {
  // schema 里自己写的中文提示（区间、颜色等）优先；zod 默认消息是英文，不会命中
  if (issue.code !== 'invalid_union' && /[\u4e00-\u9fff]/.test(issue.message)) return issue.message
  switch (issue.code) {
    case 'invalid_type': {
      const exp = EXPECTED_ZH[issue.expected] ?? issue.expected
      return /received undefined/.test(issue.message) ? `缺少这个字段（应为${exp}）` : `类型不对，应为${exp}`
    }
    case 'unrecognized_keys':
      return `不认识的字段：${issue.keys.join('、')}（是不是拼错了？）`
    case 'invalid_value':
      return `不是合法的值，可选：${issue.values.map((v) => JSON.stringify(v)).join('、')}`
    case 'too_small': {
      const n = Number(issue.minimum)
      if (issue.origin === 'array') return `至少要有 ${n} 项`
      if (issue.origin === 'string') return n <= 1 ? '不能为空' : `至少 ${n} 个字符`
      return `不能小于 ${n}`
    }
    case 'too_big': {
      const n = Number(issue.maximum)
      if (issue.origin === 'array') return `最多 ${n} 项`
      if (issue.origin === 'string') return `最多 ${n} 个字符`
      return `不能大于 ${n}`
    }
    case 'invalid_union': {
      const note = (issue as { note?: string }).note ?? ''
      if (/discriminator/i.test(note)) {
        const key = String(issue.path[issue.path.length - 1] ?? '')
        const c = CANDIDATES[key]
        return c ? `不是合法的取值，可选：${c}` : '不是合法的取值'
      }
      const first = issue.errors?.[0]?.[0]
      return first ? describeIssue(first) : '格式不对'
    }
    case 'custom':
      return issue.message
    default:
      return /[\u4e00-\u9fff]/.test(issue.message) ? issue.message : `格式不对（${issue.message}）`
  }
}

function fmtPath(path: readonly PropertyKey[]): string {
  let s = ''
  for (const p of path) s += typeof p === 'number' ? `[${p}]` : s ? `.${String(p)}` : String(p)
  return s
}

function zodIssueToError(file: string, id: string | undefined, issue: ZodIssue): ContentError {
  const path = issue.path
  if (path[0] === 'steps' && typeof path[1] === 'number') {
    return { file, id, step: path[1], field: fmtPath(path.slice(2)) || '(整个步骤)', message: describeIssue(issue) }
  }
  return { file, id, field: fmtPath(path) || '(整个文件)', message: describeIssue(issue) }
}

// ---------- 校验入口 ----------
/** 校验一份已解析的 JSON 数据 */
export function validateProblemData(file: string, raw: unknown): { problem?: Problem; errors: ContentError[] } {
  const id = raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string' ? (raw as { id: string }).id : undefined
  const parsed = ProblemSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => zodIssueToError(file, id, i)) }
  }
  const problem = parsed.data
  const issues = validateProblem(problem)
  if (issues.length) {
    return { errors: issues.map((i) => ({ file, id: problem.id, step: i.step, field: i.field, message: i.message })) }
  }
  try {
    computeStates(problem) // 试算一遍，兜底
  } catch (e) {
    if (e instanceof ProblemError) {
      return { errors: [{ file, id: problem.id, step: e.issue.step, field: e.issue.field, message: e.issue.message }] }
    }
    return { errors: [{ file, id: problem.id, field: '(试算)', message: (e as Error).message }] }
  }
  return { problem, errors: [] }
}

/** 校验一份 JSON 文本 */
export function validateProblemText(file: string, text: string): { problem?: Problem; errors: ContentError[] } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { errors: [{ file, field: '(JSON 语法)', message: `${(e as Error).message}。常见原因：少/多了逗号、引号、括号` }] }
  }
  return validateProblemData(file, raw)
}

/** 加载一批 {路径: JSON 文本} */
export function loadContent(files: Record<string, string>): ContentResult {
  const problems: LoadedProblem[] = []
  const errors: ContentError[] = []
  const seen = new Map<string, string>()
  for (const path of Object.keys(files).sort()) {
    const file = path.split('/').pop() ?? path
    const r = validateProblemText(file, files[path]!)
    errors.push(...r.errors)
    if (!r.problem) continue
    const prev = seen.get(r.problem.id)
    if (prev) {
      errors.push({ file, id: r.problem.id, field: 'id', message: `题目 id "${r.problem.id}" 与 ${prev} 重复，请改成不同的 id` })
      continue
    }
    seen.set(r.problem.id, file)
    problems.push({ file, problem: r.problem })
  }
  return { problems, errors }
}

// `?raw` 方式读取原文：这样 JSON 语法错误也能显示在页面上，而不是让构建/开发服务器直接崩溃
const rawFiles = import.meta.glob('/content/problems/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export const content: ContentResult = loadContent(rawFiles)

export function findProblem(id: string): Problem | undefined {
  return content.problems.find((p) => p.problem.id === id)?.problem
}
