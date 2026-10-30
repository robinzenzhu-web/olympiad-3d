/**
 * state.ts —— 状态快照。
 * computeStates(problem)[i] = 第 i 步结束后的完整场景状态（纯函数、可重复、跳步确定）。
 *
 * 设计要点：highlight / fade / number 以「规则列表」(rules) 的形式保存，
 * 并在每次变化后按顺序重放到当前 cell 集合上得到每个 cell 的最终外观(cells)。
 * 这样 explore 改变 size 之后，规则会自动作用在新生成的 cell 上。
 */
import type { Action, CameraSpec, Problem, Projection, SceneObject, SceneObjectType, Step } from '../schema/problem'
import { HIGHLIGHT_COLOR, resolveColor } from './colors'
import { buildGridCells, buildStackCells, compareCells, type Cell, type CellSet, type GridPaint, type Vec3 } from './cells'
import { evaluate } from './expr'
import { matchCell, type CellFilter } from './filter'
import { ProblemError, checkAction } from './validate'
import { applyBenchAction, clearMarks, initialBench, layoutBench, validateBenchDef, type BenchState } from './bench'
import type { ArrowTextAt, ArrowTextSide } from './arrowLabel'

export type Rule =
  | { kind: 'highlight'; filter?: CellFilter; color: string }
  | { kind: 'fade'; filter?: CellFilter; opacity: number }
  | { kind: 'number'; filter?: CellFilter }

export interface CellState {
  cell: Cell
  /** 覆盖色（#rrggbb）；null = 不覆盖 */
  highlight: string | null
  /** 0~1，0 = 隐藏 */
  opacity: number
  /** number 动作给的序号（1 起）；null = 不显示 */
  number: number | null
}

export interface ObjectState {
  id: string
  type: SceneObjectType
  visible: boolean
  position: Vec3
  /** explode 间距，0 = 合拢 */
  gap: number
  /** CubeGrid 当前尺寸（explore 会改变）；其他类型为 null */
  size: Vec3 | null
  paint: GridPaint
  /** CubeStack 高度图；其他类型为 null */
  heights: number[][] | null
  /** Label / Arrow 文字；其他类型为 null */
  text: string | null
  /** Bench 的完整状态；其他类型为 null */
  bench: BenchState | null
  /** Arrow：起点 = position，终点 = to；其他类型为 null */
  arrow: { to: Vec3; color: string; textAt: ArrowTextAt; textSide: ArrowTextSide; compactOffset: Vec3 | null } | null
  /** cell 包围盒尺寸（格） */
  dims: Vec3
  rules: Rule[]
  cells: CellState[]
}

export interface SceneState {
  /** 对象顺序（同 scene.objects） */
  order: string[]
  objects: Record<string, ObjectState>
}

// ---------- 构建 ----------
function buildCellSet(o: Pick<ObjectState, 'type' | 'size' | 'heights' | 'paint'>): CellSet {
  if (o.type === 'CubeGrid' && o.size) return buildGridCells(o.size, o.paint)
  if (o.type === 'CubeStack' && o.heights) return buildStackCells(o.heights)
  return { cells: [], dims: [0, 0, 0] }
}

/** 把规则按顺序重放到 cell 上 */
export function resolveCells(cells: readonly Cell[], rules: readonly Rule[]): CellState[] {
  const st: CellState[] = cells.map((cell) => ({ cell, highlight: null, opacity: 1, number: null }))
  for (const r of rules) {
    const matched = st.filter((s) => matchCell(s.cell, r.filter))
    if (r.kind === 'highlight') {
      for (const s of matched) s.highlight = r.color
    } else if (r.kind === 'fade') {
      for (const s of matched) s.opacity = r.opacity
    } else {
      matched
        .slice()
        .sort((a, b) => compareCells(a.cell, b.cell))
        .forEach((s, i) => {
          s.number = i + 1
        })
    }
  }
  return st
}

function initialObject(o: SceneObject): ObjectState {
  const base = {
    id: o.id,
    type: o.type,
    visible: o.visible ?? true,
    position: (('position' in o ? o.position : undefined) ?? [0, 0, 0]) as Vec3,
    gap: 0,
    rules: [] as Rule[],
    bench: null as BenchState | null,
    arrow: null as ObjectState['arrow'],
  }
  if (o.type === 'CubeGrid') {
    const size = [...o.size] as Vec3
    const paint: GridPaint = o.paint ?? 'none'
    const set = buildCellSet({ type: o.type, size, heights: null, paint })
    return { ...base, size, paint, heights: null, text: null, dims: set.dims, cells: resolveCells(set.cells, []) }
  }
  if (o.type === 'CubeStack') {
    const heights = o.heights.map((r) => [...r])
    const set = buildCellSet({ type: o.type, size: null, heights, paint: 'none' })
    return { ...base, size: null, paint: 'none', heights, text: null, dims: set.dims, cells: resolveCells(set.cells, []) }
  }
  const flat = { size: null, paint: 'none' as GridPaint, heights: null, dims: [0, 0, 0] as Vec3, cells: [] as CellState[] }
  if (o.type === 'Bench') return { ...base, ...flat, text: null, bench: initialBench(o) }
  if (o.type === 'Arrow') {
    return { ...base, ...flat, position: [...o.from] as Vec3, text: o.text ?? null, arrow: { to: [...o.to] as Vec3, color: resolveColor(o.color ?? '') ?? ARROW_COLOR, textAt: o.textAt ?? 'mid', textSide: o.textSide ?? 'auto', compactOffset: o.compactOffset ? ([...o.compactOffset] as Vec3) : null } }
  }
  return { ...base, ...flat, text: o.text }
}

/** Arrow 的默认颜色（老师的红笔标注） */
export const ARROW_COLOR = '#d1242f'

/** Arrow 当前的起点 / 终点。compact（窄屏）且写了 compactOffset 时整个箭头平移这个量（跟着 Bench 的 compactShow 把份挨到新位置） */
export function arrowEnds(o: Pick<ObjectState, 'position' | 'arrow'>, compact: boolean): { from: Vec3; to: Vec3 } {
  const a = o.arrow!
  const d = compact ? a.compactOffset : null
  if (!d) return { from: o.position, to: a.to }
  return { from: o.position.map((v, k) => v + d[k]!) as Vec3, to: a.to.map((v, k) => v + d[k]!) as Vec3 }
}

export function initialState(problem: Problem): SceneState {
  const objects: Record<string, ObjectState> = {}
  problem.scene.objects.forEach((o, i) => {
    if (o.type === 'Bench') {
      // 未经 validateProblem 直接试算时的兜底：定义不合法就报清楚位置，不要默默生成一堆废数据
      const e = validateBenchDef(o)[0]
      if (e) throw new ProblemError({ field: `scene.objects[${i}].${e.field}`, message: e.message })
    }
    objects[o.id] = initialObject(o)
  })
  return { order: problem.scene.objects.map((o) => o.id), objects }
}

function withRules(o: ObjectState, rules: Rule[]): ObjectState {
  return { ...o, rules, cells: resolveCells(o.cells.map((c) => c.cell), rules) }
}

function withSize(o: ObjectState, size: Vec3): ObjectState {
  const set = buildCellSet({ ...o, size })
  return { ...o, size, dims: set.dims, cells: resolveCells(set.cells, o.rules) }
}

// ---------- 动作 ----------
/**
 * 应用单个动作，返回新状态（不修改入参）。
 * `initial` 供 reset 恢复；出错抛 ProblemError（不带步骤号，由调用方补）。
 */
export function applyAction(state: SceneState, action: Action, initial: SceneState): SceneState {
  const err = checkAction(state.objects, action)
  if (err) throw new ProblemError({ field: err.field, message: err.message })
  const obj = state.objects[action.target]!
  let next: ObjectState
  switch (action.do) {
    case 'show':
      next = { ...obj, visible: true }
      break
    case 'hide':
      next = { ...obj, visible: false }
      break
    case 'explode':
      next = { ...obj, gap: action.gap ?? 0.4 }
      break
    case 'highlight': {
      const color = resolveColor(action.color ?? HIGHLIGHT_COLOR)!
      next = withRules(obj, [...obj.rules, { kind: 'highlight', filter: action.filter, color }])
      break
    }
    case 'fade':
      next = withRules(obj, [...obj.rules, { kind: 'fade', filter: action.filter, opacity: action.opacity }])
      break
    case 'number':
      next = withRules(obj, [...obj.rules, { kind: 'number', filter: action.filter }])
      break
    case 'clear':
      // Bench：清掉所有 mark；Arrow 没有可清的效果（空操作）；方块：清 highlight/fade/number
      next = obj.bench ? { ...obj, bench: clearMarks(obj.bench) } : obj.arrow ? obj : withRules(obj, [])
      break
    case 'reset': {
      const init = initial.objects[action.target]!
      // token id 计数器不回退：重置后新生成的 token 不会和之前的 id 撞车
      next = init.bench && obj.bench ? { ...init, bench: { ...init.bench, nextId: Math.max(init.bench.nextId, obj.bench.nextId) } } : init
      break
    }
    case 'setText':
      next = { ...obj, text: action.text }
      break
    case 'move': {
      const position = [...action.position] as Vec3
      next = { ...obj, position }
      // Arrow：position 就是起点，终点跟着平移
      if (obj.arrow) {
        const to = obj.arrow.to.map((v, k) => v + position[k]! - obj.position[k]!) as Vec3
        next = { ...next, arrow: { ...obj.arrow, to } }
      }
      break
    }
    case 'fill':
    case 'setSlots':
    case 'mark':
    case 'unmark':
    case 'remainder':
    case 'transfer':
    case 'brace':
    case 'divider':
    case 'clearNotes':
      next = { ...obj, bench: applyBenchAction(obj.id, obj.bench!, action) }
      break
  }
  return { ...state, objects: { ...state.objects, [action.target]: next } }
}

const MIN_DIM = 1
const MAX_DIM = 20

/**
 * explore：把滑块的值 value 代入 control.bind，得到新状态（size 变化时重建 cell，规则自动重放）。
 * 结果会四舍五入并限制在 1~20；表达式非法时抛错。
 */
export function applyControl(state: SceneState, step: Step, value: number): SceneState {
  const c = step.control
  if (!c) throw new ProblemError({ field: 'control', message: '这一步没有 control，不能 applyControl' })
  const vars = { [c.param]: value }
  let objects = state.objects
  for (const b of c.bind) {
    const obj = objects[b.target]
    if (!obj || obj.type !== 'CubeGrid') {
      throw new ProblemError({ field: 'control.bind', message: `"${b.target}" 不是 CubeGrid，无法绑定 size` })
    }
    const size = b.value.map((src) => {
      const r = Math.round(evaluate(src, vars))
      return Math.min(MAX_DIM, Math.max(MIN_DIM, r))
    }) as Vec3
    objects = { ...objects, [b.target]: withSize(obj, size) }
  }
  return { ...state, objects }
}

/** 应用一整步：先执行 actions，explore 步再按 default 值应用 control */
export function applyStep(state: SceneState, step: Step, initial: SceneState): SceneState {
  let s = state
  step.actions?.forEach((a, j) => {
    try {
      s = applyAction(s, a, initial)
    } catch (e) {
      if (e instanceof ProblemError) throw new ProblemError({ ...e.issue, field: `actions[${j}].${e.issue.field}` })
      throw e
    }
  })
  if (step.type === 'explore' && step.control) s = applyControl(s, step, step.control.default)
  return s
}

/** 第 i 项 = 第 i 步结束后的完整状态。出错时抛带步骤号的 ProblemError */
export function computeStates(problem: Problem): SceneState[] {
  const initial = initialState(problem)
  const out: SceneState[] = []
  let cur = initial
  problem.steps.forEach((step, i) => {
    try {
      cur = applyStep(cur, step, initial)
    } catch (e) {
      if (e instanceof ProblemError) throw new ProblemError({ ...e.issue, step: i })
      throw new ProblemError({ step: i, field: '', message: (e as Error).message })
    }
    out.push(cur)
  })
  return out
}

/**
 * 场景（可见的方块类对象）的包围半径，随 explode 间距 / explore 的 size 变化。
 * 渲染层用它的变化比例自动拉近/拉远相机，保证拆开或放大后仍在画面内。
 */
export function sceneRadius(state: SceneState): number {
  return sceneRadiusAt(state, false)
}

/** sceneRadius，可指定是否窄屏 compact（窄屏时 Bench 用 compactShow、Arrow 用 compactOffset）。单独一个函数，免得 .map(sceneRadius) 把下标当成 compact */
export function sceneRadiusAt(state: SceneState, compact: boolean): number {
  let r = 0
  // Bench / Arrow：所有可见的放进一个包围盒，半对角线作为半径（行变长 / 出现行尾多少时相机自动拉远）
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  const grow = (min: readonly number[], max: readonly number[]) => {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, min[k]!)
      hi[k] = Math.max(hi[k]!, max[k]!)
    }
  }
  for (const id of state.order) {
    const o = state.objects[id]!
    if (!o.visible) continue
    if (o.bench) {
      const b = layoutBench(o.bench, compact).bounds
      grow(b.min.map((v, k) => v + o.position[k]!), b.max.map((v, k) => v + o.position[k]!))
      continue
    }
    if (o.arrow) {
      const pad = o.text ? 0.5 : 0.1
      const { from, to } = arrowEnds(o, compact)
      grow(from.map((v, k) => Math.min(v, to[k]!) - pad), from.map((v, k) => Math.max(v, to[k]!) + pad))
      continue
    }
    if (o.cells.length === 0) continue
    const [x, y, z] = o.dims
    r = Math.max(r, 0.5 * Math.hypot(x, y, z) * (1 + o.gap))
  }
  if (Number.isFinite(lo[0])) r = Math.max(r, 0.5 * Math.hypot(hi[0]! - lo[0], hi[1]! - lo[1], hi[2]! - lo[2]))
  return r
}

/**
 * 相机规格对应的「基准半径」：题目初始场景的半径。
 * 初始场景里所有方块都不可见（半径 0）时，退而用各步状态里第一个有效的半径；都没有则为 1。
 */
export function baseSceneRadius(initial: SceneState, states: readonly SceneState[] = []): number {
  const r0 = sceneRadius(initial)
  if (r0 > 0) return r0
  for (const s of states) {
    const r = sceneRadius(s)
    if (r > 0) return r
  }
  return 1
}

/** 场景半径相对基准半径的缩放倍数（相机距离 = 规格距离 × fit × 该倍数）；任一值无效时不缩放 */
export function radiusScale(radius: number, baseRadius: number): number {
  return baseRadius > 0 && radius > 0 ? radius / baseRadius : 1
}

// ---------- 相机 ----------
export interface ResolvedCamera {
  position: Vec3
  target: Vec3
  projection: Projection
}

export const DEFAULT_CAMERA: ResolvedCamera = { position: [5, 4, 6], target: [0, 0, 0], projection: 'perspective' }

function resolveCamera(c: CameraSpec | undefined, fallback: ResolvedCamera): ResolvedCamera {
  if (!c) return fallback
  // projection 与 position / target 一样属于相机规格：写了 camera 就整体替换，没写 projection 即透视
  return { position: [...c.position] as Vec3, target: [...(c.target ?? [0, 0, 0])] as Vec3, projection: c.projection ?? 'perspective' }
}

/** 每一步生效的相机：本步没写 camera 则沿用之前最近一次指定的（最初为 scene.camera 或默认值） */
export function computeCameras(problem: Problem): ResolvedCamera[] {
  let cur = resolveCamera(problem.scene.camera, DEFAULT_CAMERA)
  return problem.steps.map((s) => {
    cur = resolveCamera(s.camera, cur)
    return cur
  })
}
