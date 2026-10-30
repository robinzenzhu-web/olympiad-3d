/**
 * validate.ts —— 引擎语义校验（zod 之后的第二道关）：
 * target 是否存在、动作与对象类型是否匹配、filter 键是否适用、
 * explore 的 bind / formulaTemplate 表达式是否合法且在整个滑块范围内都能算出合法尺寸。
 */
import type { Action, Control, Problem, SceneObjectType, Step } from '../schema/problem'
import { resolveColor } from './colors'
import { ExprError, collectVars, evalNode, formatNumber, parseExpr, templateExprs, type ExprNode } from './expr'
import type { Issue } from './errors'
import { validateBenchDef } from './bench'

export { ProblemError, type Issue } from './errors'

type TypedMap = Readonly<Record<string, { readonly type: SceneObjectType }>>
type FieldError = { field: string; message: string }

const CELL_TYPES: readonly SceneObjectType[] = ['CubeGrid', 'CubeStack']
const BENCH_ONLY: readonly SceneObjectType[] = ['Bench']
const ALLOWED_TYPES: Record<Action['do'], readonly SceneObjectType[] | 'any'> = {
  show: 'any',
  hide: 'any',
  reset: 'any',
  move: 'any',
  explode: CELL_TYPES,
  highlight: CELL_TYPES,
  fade: CELL_TYPES,
  number: CELL_TYPES,
  clear: [...CELL_TYPES, 'Bench', 'Arrow'],
  setText: ['Label', 'Arrow'],
  fill: BENCH_ONLY,
  setSlots: BENCH_ONLY,
  mark: BENCH_ONLY,
  unmark: BENCH_ONLY,
  remainder: BENCH_ONLY,
  transfer: BENCH_ONLY,
  brace: BENCH_ONLY,
  divider: BENCH_ONLY,
  clearNotes: BENCH_ONLY,
}

/** 用错对象类型时的额外提示（把出题人引向正确的动作） */
function typeHint(action: Action['do'], type: SceneObjectType): string {
  if (type === 'Bench' && (action === 'highlight' || action === 'fade' || action === 'number' || action === 'explode')) {
    return '。Bench 要标记某几份请用 mark（highlight / cross / ghost / dim），改内容用 fill'
  }
  if (type !== 'Bench' && ALLOWED_TYPES[action] === BENCH_ONLY) return '。这是 Bench（板凳行）专用的动作'
  return ''
}

/** 单个 action 的检查（computeStates 与 validateProblem 共用）。返回 null 表示没问题 */
export function checkAction(objects: TypedMap, action: Action): FieldError | null {
  const obj = Object.prototype.hasOwnProperty.call(objects, action.target) ? objects[action.target] : undefined
  if (!obj) {
    const ids = Object.keys(objects)
    return {
      field: 'target',
      message: `找不到对象 "${action.target}"。scene.objects 里现有的对象：${ids.length ? ids.join('、') : '（没有）'}`,
    }
  }
  const allowed = ALLOWED_TYPES[action.do]
  if (allowed !== 'any' && !allowed.includes(obj.type)) {
    return {
      field: 'target',
      message: `动作 "${action.do}" 只能用于 ${allowed.join(' / ')}，但 "${action.target}" 是 ${obj.type}${typeHint(action.do, obj.type)}`,
    }
  }
  if ('filter' in action && action.filter) {
    if (action.filter.region !== undefined && obj.type !== 'CubeGrid') {
      return { field: 'filter.region', message: `region 只能用于 CubeGrid，但 "${action.target}" 是 ${obj.type}` }
    }
  }
  if (action.do === 'highlight' && action.color !== undefined && resolveColor(action.color) === null) {
    return {
      field: 'color',
      message: `颜色 "${action.color}" 不认识。请写 #rrggbb（如 "#f5b301"），或 yellow / red / blue / green / purple / orange / pink / teal / gray`,
    }
  }
  return null
}

// ---------- explore ----------
const MAX_DIM = 20
const MAX_CELLS = 1000

const MAX_SLIDER_STEPS = 1000

/** 滑块的格数（不含起点）：(max-min)/step，容忍浮点误差 */
function sliderSteps(c: Pick<Control, 'min' | 'max' | 'step'>): number {
  return Math.max(0, Math.floor((c.max - c.min) / (c.step ?? 1) + 1e-9))
}

/**
 * 滑块会取到的所有值（含 default、一定含 max）。
 * 格数超过 MAX_SLIDER_STEPS 时不会被截断（checkExplore 会先报错拦住）。
 */
export function sliderValues(c: Pick<Control, 'min' | 'max' | 'step' | 'default'>): number[] {
  const step = c.step ?? 1
  const n = sliderSteps(c)
  const out: number[] = []
  for (let k = 0; k <= n; k++) out.push(Math.round((c.min + k * step) * 1e9) / 1e9)
  // max 不在刻度上时（如 0~10，step 3），滑块拖到头仍可能取到 max，也要检查
  if (!out.includes(c.max)) out.push(c.max)
  if (!out.includes(c.default)) out.push(c.default)
  return out
}

function parseSafe(src: string): { ast?: ExprNode; error?: string } {
  try {
    return { ast: parseExpr(src) }
  } catch (e) {
    return { error: e instanceof ExprError ? e.message : String(e) }
  }
}

export function checkExplore(objects: TypedMap, step: Step): FieldError[] {
  const c = step.control
  if (!c) return []
  const errs: FieldError[] = []
  if (!(c.min < c.max)) errs.push({ field: 'control.max', message: 'max 必须大于 min' })
  if (c.default < c.min || c.default > c.max) {
    errs.push({ field: 'control.default', message: `default=${c.default} 不在 min~max（${c.min}~${c.max}）范围内` })
  }
  const st = c.step ?? 1
  const k = (c.default - c.min) / st
  if (Math.abs(k - Math.round(k)) > 1e-9) {
    errs.push({ field: 'control.default', message: `default=${c.default} 不在滑块的刻度上（从 min=${c.min} 起每隔 step=${st} 一格）` })
  }
  if (errs.length) return errs
  const steps = sliderSteps(c)
  if (steps > MAX_SLIDER_STEPS) {
    return [
      {
        field: 'control.step',
        message: `滑块步数过多：(max-min)/step = ${formatNumber(steps)} 格，最多 ${MAX_SLIDER_STEPS} 格。请调大 step 或缩小 min~max`,
      },
    ]
  }

  const values = sliderValues(c)
  const allowedVars = new Set([c.param])

  c.bind.forEach((b, bi) => {
    const f = (sub: string) => `control.bind[${bi}].${sub}`
    const obj = Object.prototype.hasOwnProperty.call(objects, b.target) ? objects[b.target] : undefined
    if (!obj) {
      errs.push({ field: f('target'), message: `找不到对象 "${b.target}"` })
      return
    }
    if (obj.type !== 'CubeGrid') {
      errs.push({ field: f('target'), message: `prop "size" 只能绑定到 CubeGrid，但 "${b.target}" 是 ${obj.type}` })
      return
    }
    const asts: ExprNode[] = []
    for (let d = 0; d < b.value.length; d++) {
      const p = parseSafe(b.value[d]!)
      if (p.error || !p.ast) {
        errs.push({ field: f(`value[${d}]`), message: `表达式 "${b.value[d]}" 有问题：${p.error}` })
        continue
      }
      const unknown = [...collectVars(p.ast)].filter((v) => !allowedVars.has(v))
      if (unknown.length) {
        errs.push({ field: f(`value[${d}]`), message: `表达式里的变量 ${unknown.join('、')} 没有定义（这一步只有参数 "${c.param}"）` })
        continue
      }
      asts.push(p.ast)
    }
    if (asts.length !== 3) return
    for (const v of values) {
      const dims: number[] = []
      for (let d = 0; d < 3; d++) {
        let r: number
        try {
          r = evalNode(asts[d]!, { [c.param]: v })
        } catch (e) {
          errs.push({ field: f(`value[${d}]`), message: `当 ${c.param}=${v} 时算不出来：${(e as Error).message}` })
          return
        }
        if (!Number.isInteger(r) || r < 1 || r > MAX_DIM) {
          errs.push({
            field: f(`value[${d}]`),
            message: `当 ${c.param}=${v} 时 "${b.value[d]}" 的结果是 ${formatNumber(r)}，边长必须是 1~${MAX_DIM} 的整数`,
          })
          return
        }
        dims.push(r)
      }
      if (dims[0]! * dims[1]! * dims[2]! > MAX_CELLS) {
        errs.push({ field: f('value'), message: `当 ${c.param}=${v} 时小方块超过 ${MAX_CELLS} 个，太多了` })
        return
      }
    }
  })

  if (step.formulaTemplate) {
    for (const src of templateExprs(step.formulaTemplate)) {
      const p = parseSafe(src)
      if (p.error || !p.ast) {
        errs.push({ field: 'formulaTemplate', message: `{{${src}}} 有问题：${p.error}` })
        continue
      }
      const unknown = [...collectVars(p.ast)].filter((v) => !allowedVars.has(v))
      if (unknown.length) {
        errs.push({ field: 'formulaTemplate', message: `{{${src}}} 里的变量 ${unknown.join('、')} 没有定义（只有参数 "${c.param}"）` })
        continue
      }
      for (const v of values) {
        try {
          evalNode(p.ast, { [c.param]: v })
        } catch (e) {
          errs.push({ field: 'formulaTemplate', message: `当 ${c.param}=${v} 时 {{${src}}} 算不出来：${(e as Error).message}` })
          break
        }
      }
    }
  }
  return errs
}

// ---------- 整题 ----------
/** 语义校验（假定已通过 zod schema）。返回所有问题，空数组表示通过 */
export function validateProblem(problem: Problem): Issue[] {
  const issues: Issue[] = []
  const objects: Record<string, { type: SceneObjectType }> = {}
  for (const o of problem.scene.objects) objects[o.id] = { type: o.type }

  problem.scene.objects.forEach((o, i) => {
    if (o.type === 'CubeStack') {
      const total = o.heights.reduce((n, r) => n + r.reduce((a, b) => a + b, 0), 0)
      const width = o.heights[0]!.length
      if (o.heights.some((r) => r.length !== width)) {
        issues.push({ field: `scene.objects[${i}].heights`, message: '每一行的长度必须一样（heights 要是一个规整的长方形）' })
      }
      if (total === 0) issues.push({ field: `scene.objects[${i}].heights`, message: '一块积木都没有（高度全是 0）' })
      if (total > MAX_CELLS) issues.push({ field: `scene.objects[${i}].heights`, message: `积木超过 ${MAX_CELLS} 块，太多了` })
    }
    if (o.type === 'CubeGrid' && o.size[0] * o.size[1] * o.size[2] > MAX_CELLS) {
      issues.push({ field: `scene.objects[${i}].size`, message: `小方块超过 ${MAX_CELLS} 个，太多了` })
    }
    if (o.type === 'Bench') {
      for (const e of validateBenchDef(o)) issues.push({ field: `scene.objects[${i}].${e.field}`, message: e.message })
    }
    if (o.type === 'Arrow' && o.from[0] === o.to[0] && o.from[1] === o.to[1] && o.from[2] === o.to[2]) {
      issues.push({ field: `scene.objects[${i}].to`, message: 'Arrow 的 from 和 to 不能是同一个点' })
    }
  })

  problem.steps.forEach((step, si) => {
    step.actions?.forEach((a, ai) => {
      const e = checkAction(objects, a)
      if (e) issues.push({ step: si, field: `actions[${ai}].${e.field}`, message: e.message })
    })
    for (const e of checkExplore(objects, step)) issues.push({ step: si, field: e.field, message: e.message })
  })
  return issues
}
