/**
 * bench.ts —— 「板凳模型」(Bench) 的纯逻辑：状态、动作、校验、布局。
 *
 * 一个 Bench = 老师板书里的一行：若干「份」(slot)，每份装一些东西，行尾有「多 / 少」。
 * 这里不依赖 three / React：状态折叠、token 身份(id)、省略号、布局坐标都在这里算，渲染层只负责画。
 *
 * 关键设计：
 * - 状态是不可变快照；每个 token（球、小人…）有稳定 id（"t0"、"t1"…），由 bench.nextId 单调递增生成。
 *   transfer 把 token 从一份搬到另一份时 id 不变 —— 渲染层按 id 作 React key，位置阻尼插值，就能「飞过去」。
 * - fill 改写一份时，会尽量沿用这份里已有的同形状 token（按顺序复用 id，只补/删多出来的），
 *   所以 5 个球变成「3 蓝 + 2 橙」是原地变色，而不是全部消失再出现。
 * - 份的下标一律 1 起、闭区间。
 */
import type { Action, BenchDef, Container, Range, Remainder, Segment, TokenShape } from '../schema/problem'
import { HIGHLIGHT_COLOR, resolveColor } from './colors'
import { ProblemError } from './errors'
import { textPx } from './textSize'

// ---------- 常量 ----------
/** 相邻两份的中心间距 */
export const SPACING = 1.3
export const MAX_SLOTS = 1000
/** 同时显示的份数上限（含 show 省略后）：再多画面放不下，也拖慢渲染 */
export const MAX_VISIBLE = 24
/** 一份里同一个 token 段的 count 上限 */
export const MAX_SEG_COUNT = 12
/** 一份里所有东西（token + block）的总数上限 */
export const MAX_SLOT_ITEMS = 24
/** 行尾 remainder 里东西的总数上限 */
export const MAX_REMAINDER_ITEMS = 40

export const BENCH_RED = '#e5484d'
export const REMAINDER_COLOR = { extra: '#1a7f37', short: '#cf222e' } as const

/** 各形状的默认颜色（明快但不艳） */
const SHAPE_COLOR: Record<TokenShape | 'block', string> = {
  ball: '#f2994a',
  disc: '#e9b949',
  cube: '#5b8def',
  person: '#4c9f70',
  cup: '#4fb3bf',
  flower: '#e8739a',
  block: '#dce6f7',
}
/** 同一份里出现第二个、第三个同形状且没写 color 的段时，依次换这些颜色 */
const ALT_COLORS = ['#5b8def', '#4c9f70', '#c05bb8', '#e9b949', '#4fb3bf']

/** 每种 token 一层的高度（世界单位）；也用于堆叠布局 */
export const SHAPE_H: Record<TokenShape, number> = { ball: 0.3, disc: 0.1, cube: 0.29, person: 0.54, cup: 0.33, flower: 0.38 }
export const TOKEN_W = 0.3
const PITCH = 0.36
const PER_LAYER = 3
/** block 的 height=1 对应的世界高度 */
export const BLOCK_UNIT = 0.45
export const BLOCK_W = 0.9
export const BLOCK_D = 0.5

/** 竖线文字与行尾“多 / 少”文字水平距离小于它（世界单位）就算会重叠 */
export const DIVIDER_REMAINDER_CLEAR = 2.6
/** 重叠时竖线加高多少（世界单位） */
export const DIVIDER_LIFT = 0.45
/**
 * 竖线文字要整个抬到“上方大括号”文字之上时，竖线加高多少（世界单位，约 38px/单位）。
 * 大括号文字中心 = aboveY + 2r + 0.27（r ≤ 0.16，见 Bench3D 的 BraceMesh；字 16px×1.1 + 内边距 2px ≈ 19.6px），
 * 竖线文字中心 = y1 + 0.25 = aboveY + 0.35 + 抬高（DividerMesh；字 14px×1.1 ≈ 15.4px）。
 * 两段文字不垂直重叠需要中心相差 ≥ (19.6 + 15.4) / 2 / 38 ≈ 0.46：0.35 + 抬高 − 0.59 ≥ 0.46 → 抬高 ≥ 0.70。取 2 × DIVIDER_LIFT = 0.9（留约 7px 空隙）。
 */
export const DIVIDER_BRACE_LIFT = 2 * DIVIDER_LIFT

/**
 * 行尾“多 / 少”文字大致占多宽（世界单位）：字号 18px + 左右内边距，按“屏幕上大约 38px 一个世界单位”折算。
 * 文字是固定像素大小，窄屏时文字和世界单位一起缩小（见 fit.ts 的 textScale），所以这个比值各种屏幕上都大致成立。
 */
export function remainderTextWidth(text: string): number {
  return (textPx(text, 18) + 16) / 38
}

export const CONTAINER_TOP: Record<Container, number> = { seat: 0, plate: 0, person: 1.05, box: 0.22, none: 0 }
/**
 * 每份里的 token 从多高开始往上摆。箱子（box）的前壁高 0.22，球若落在箱底（0）会被前壁挡掉大半（只露出一个小红点），
 * 所以抬到 0.14：球心在前壁上沿以上，大约 3/4 露在外面，看起来仍是“放在箱子里”。其它容器不变。
 */
export const TOKEN_BASE: Record<Container, number> = { seat: 0, plate: 0, person: 0, box: 0.14, none: 0 }
export const CAPTION_Y: Record<Container, number> = { seat: -0.52, plate: -0.28, person: -0.26, box: -0.28, none: -0.28 }

// ---------- 状态类型 ----------
export type ItemShape = TokenShape | 'block'
export type MarkStyle = 'highlight' | 'cross' | 'ghost' | 'dim'
/** tint 只在 highlight 上有意义：'container' = 只给容器上色，物品保持原色；不写 = 'all'（容器和物品都染） */
export interface MarkEntry {
  color: string | null
  tint?: 'container'
}
export type Marks = Partial<Record<MarkStyle, MarkEntry>>

/** 一段东西：token 段 = 若干同形状同色的 token（ids 即各自的稳定身份）；block 段 = 一个带字的方块（ids 长度 1） */
export interface SegState {
  shape: ItemShape
  /** 规范成 #rrggbb */
  color: string
  name?: string
  /** block 的文字 */
  text?: string
  /** block 的高度倍数 */
  height?: number
  ids: string[]
}

export interface SlotState {
  segs: SegState[]
  /** fill 的 countText 覆盖；null = 自动 */
  countText: string | null
  marks: Marks
}

export interface RemainderState {
  type: 'extra' | 'short'
  text: string
  /** 被划掉的旧文字；null = 没有 */
  was: string | null
  segs: SegState[]
}

export interface BraceNote {
  from: number
  to: number
  text: string
  side: 'above' | 'below'
}
export interface DividerNote {
  after: number
  text: string | null
}

export interface BenchState {
  label: string | null
  slots: number
  /** 规范化后的显示区间（已排序、合并）；null = 全部显示 */
  show: Range[] | null
  /**
   * 窄屏（compact）时用的显示区间（规范化后）。undefined = 没写，窄屏也用 show；null = 写了但覆盖全部（全部显示）。
   * 优先级：compact 模式下 compactShow（有）> show；桌面永远用 show。
   */
  compactShow?: Range[] | null
  container: Container
  caption: string | null
  countLabel: boolean
  /** 新增的份默认装什么（= 初始 fill，被 fill slots:"all" 改写） */
  defaultFill: Segment[]
  /** 下标 i 对应第 i+1 份 */
  slotStates: SlotState[]
  remainder: RemainderState | null
  braces: BraceNote[]
  dividers: DividerNote[]
  /** 下一个 token id 的序号（单调递增，reset 也不回退，保证 id 不会撞车） */
  nextId: number
}

// ---------- 校验辅助（返回错误信息，不抛） ----------
export interface FieldError {
  field: string
  message: string
}
const fe = (field: string, message: string): FieldError => ({ field, message })

/** 区间 [a,b] 是否合法（起点≥1、起点≤终点、终点≤份数）。name 用于消息，如 "slots" */
export function rangeError(r: readonly number[], slots: number, field: string, id: string): FieldError | null {
  const [a, b] = r as [number, number]
  const txt = `${field}=[${a}, ${b}]`
  if (a < 1) return fe(field, `${txt} 不对：份的下标从 1 起（第 1 份是 1，不是 0）`)
  if (a > b) return fe(field, `${txt} 不对：起点不能比终点大（应写成 [${b}, ${a}]？）`)
  if (b > slots) return fe(field, `${txt} 超出范围：对象 "${id}" 现在只有 ${slots} 份（下标 1~${slots}）`)
  return null
}

function countVisible(show: readonly Range[] | null | undefined, slots: number): number {
  if (!show) return slots
  return show.reduce((n, [a, b]) => n + (b - a + 1), 0)
}

/** show 区间检查：每个区间合法，且显示的份数不超过 MAX_VISIBLE */
export function showError(show: readonly Range[] | null | undefined, slots: number, field: string, id: string): FieldError | null {
  const key = field.replace(/\[\d+\]$/, '')
  if (show) {
    for (let i = 0; i < show.length; i++) {
      const e = rangeError(show[i]!, slots, `${field}[${i}]`, id)
      if (e) return e
    }
  }
  const n = normalizeShow(show, slots)
  const visible = countVisible(n, slots)
  if (visible > MAX_VISIBLE) {
    // 按“有没有写”判断，而不是看规范化结果：写满 [[1, slots]] 时 normalizeShow 返回 null，但这仍然是写了 show / compactShow
    const given = !!show && show.length > 0
    return fe(
      field,
      given
        ? `${key} 一共显示 ${visible} 份，太多了（最多 ${MAX_VISIBLE} 份）。请缩小显示区间，如 [[1, 3], [${slots - 1}, ${slots}]]`
        : `一共有 ${slots} 份，全部显示太多了（最多同时显示 ${MAX_VISIBLE} 份）。请加 show 省略中间，如 "show": [[1, 3], [${Math.max(4, slots - 1)}, ${slots}]]`,
    )
  }
  return null
}

function segTotal(specs: readonly Segment[]): number {
  return specs.reduce((n, s) => n + (s.kind === 'token' ? s.count : 1), 0)
}

/** 一组 Segment 的检查。perSegMax：单个 token 段的 count 上限；maxTotal：总数上限 */
function specErrors(specs: readonly Segment[], field: string, perSegMax: number, maxTotal: number, what: string): FieldError[] {
  const errs: FieldError[] = []
  specs.forEach((s, j) => {
    if (s.kind === 'token' && s.count > perSegMax) {
      errs.push(
        fe(
          `${field}[${j}].count`,
          `count=${s.count} 太多：${what}同一种东西最多 ${perSegMax} 个。数很大时请改用 block，如 {"kind": "block", "text": "${s.count}"}`,
        ),
      )
    }
  })
  const total = segTotal(specs)
  if (total > maxTotal) errs.push(fe(field, `${what}一共 ${total} 个东西，超过上限 ${maxTotal}`))
  return errs
}

/** Bench 对象定义本身的检查（scene.objects 里的写法）。field 相对于该对象 */
export function validateBenchDef(def: BenchDef): FieldError[] {
  const errs: FieldError[] = []
  const e = showError(def.show, def.slots, 'show', def.id)
  if (e) errs.push(e)
  if (def.compactShow) {
    const ec = showError(def.compactShow, def.slots, 'compactShow', def.id)
    if (ec) errs.push(ec)
  }
  if (def.fill) errs.push(...specErrors(def.fill, 'fill', MAX_SEG_COUNT, MAX_SLOT_ITEMS, '每份里'))
  if (def.remainder?.items) {
    errs.push(...specErrors(def.remainder.items, 'remainder.items', MAX_REMAINDER_ITEMS, MAX_REMAINDER_ITEMS, '行尾'))
  }
  return errs
}

// ---------- 显示区间 / 省略号 ----------
/** 排序、合并（相邻也合并）、裁到 1~slots；覆盖全部或为空时返回 null（= 全部显示） */
export function normalizeShow(show: readonly Range[] | null | undefined, slots: number): Range[] | null {
  if (!show || show.length === 0) return null
  const rs = show
    .map(([a, b]) => [Math.max(1, a), Math.min(slots, b)] as Range)
    .filter(([a, b]) => a <= b)
    .sort((p, q) => p[0] - q[0])
  const out: Range[] = []
  for (const r of rs) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  if (out.length === 0 || (out.length === 1 && out[0]![0] === 1 && out[0]![1] === slots)) return null
  return out
}

export type Entry = { kind: 'slot'; index: number } | { kind: 'gap'; key: string }

/** 显示出来的一排：份 与 「…」（不连续处）。每个条目占一个份的位置 */
export function visibleEntries(slots: number, show: readonly Range[] | null | undefined): Entry[] {
  const n = normalizeShow(show, slots)
  const out: Entry[] = []
  if (!n) {
    for (let i = 1; i <= slots; i++) out.push({ kind: 'slot', index: i })
    return out
  }
  n.forEach(([a, b], k) => {
    if (k > 0) out.push({ kind: 'gap', key: `g${k}` })
    for (let i = a; i <= b; i++) out.push({ kind: 'slot', index: i })
  })
  return out
}

/** 实际生效的显示区间：compact（窄屏）且写了 compactShow 时用 compactShow，否则用 show */
export function effectiveShow(b: Pick<BenchState, 'show' | 'compactShow'>, compact: boolean): Range[] | null {
  return compact && b.compactShow !== undefined ? b.compactShow : b.show
}

/** 显示出来的份的下标（升序） */
export function visibleSlots(slots: number, show: readonly Range[] | null | undefined): number[] {
  return visibleEntries(slots, show).flatMap((e) => (e.kind === 'slot' ? [e.index] : []))
}

// ---------- 构建 ----------
type IdGen = () => string

function defaultColor(shape: ItemShape, nth: number): string {
  return nth === 0 ? SHAPE_COLOR[shape] : ALT_COLORS[(nth - 1) % ALT_COLORS.length]!
}

/**
 * 按 specs 生成一组段，尽量沿用 old 里同形状的 token id（按出现顺序），不够再生成新 id。
 * 这样 fill 只让「多出来 / 少掉」的 token 淡入淡出，其余原地变色或不动。
 */
export function buildSegs(old: readonly SegState[], specs: readonly Segment[], gen: IdGen): SegState[] {
  const pool = new Map<ItemShape, string[]>()
  for (const s of old) {
    const list = pool.get(s.shape) ?? []
    list.push(...s.ids)
    pool.set(s.shape, list)
  }
  const used = new Map<ItemShape, number>()
  const take = (shape: ItemShape): string => pool.get(shape)?.shift() ?? gen()
  return specs.map((sp): SegState => {
    if (sp.kind === 'block') {
      const nth = used.get('block') ?? 0
      used.set('block', nth + 1)
      return {
        shape: 'block',
        color: resolveColor(sp.color ?? '') ?? defaultColor('block', nth),
        text: sp.text,
        height: sp.height ?? 1,
        ids: [take('block')],
      }
    }
    const nth = used.get(sp.shape) ?? 0
    used.set(sp.shape, nth + 1)
    const ids: string[] = []
    for (let k = 0; k < sp.count; k++) ids.push(take(sp.shape))
    return {
      shape: sp.shape,
      color: (sp.color !== undefined ? resolveColor(sp.color) : null) ?? defaultColor(sp.shape, nth),
      ...(sp.name !== undefined ? { name: sp.name } : {}),
      ids,
    }
  })
}

function makeGen(b: { nextId: number }): { gen: IdGen; done: () => number } {
  let n = b.nextId
  return { gen: () => `t${n++}`, done: () => n }
}

/** 由定义生成初始状态（定义已通过 validateBenchDef 的前提下） */
export function initialBench(def: BenchDef): BenchState {
  const fill = def.fill ?? []
  const counter = { nextId: 0 }
  const { gen, done } = makeGen(counter)
  const slotStates: SlotState[] = []
  for (let i = 0; i < def.slots; i++) slotStates.push({ segs: buildSegs([], fill, gen), countText: null, marks: {} })
  let remainder: RemainderState | null = null
  if (def.remainder) {
    remainder = { type: def.remainder.type, text: def.remainder.text, was: def.remainder.was ?? null, segs: buildSegs([], def.remainder.items ?? [], gen) }
  }
  return {
    label: def.label ?? null,
    slots: def.slots,
    show: normalizeShow(def.show, def.slots),
    ...(def.compactShow ? { compactShow: normalizeShow(def.compactShow, def.slots) } : {}),
    container: def.container ?? 'seat',
    caption: def.caption ?? null,
    countLabel: def.countLabel ?? true,
    defaultFill: fill.map((s) => ({ ...s })),
    slotStates,
    remainder,
    braces: [],
    dividers: [],
    nextId: done(),
  }
}

// ---------- 文字 ----------
/** 自动数字标签：单段 token → "3"；单个 block → 它的 text；多段 → 各段 count+name / text 拼接（"5桃3瓜"、"玻+10"） */
export function autoCountText(segs: readonly SegState[]): string {
  if (segs.length === 0) return ''
  if (segs.length === 1) {
    const s = segs[0]!
    return s.shape === 'block' ? (s.text ?? '') : String(s.ids.length)
  }
  const parts = segs.map((s) => (s.shape === 'block' ? (s.text ?? '') : `${s.ids.length}${s.name ?? ''}`))
  let out = parts[0]!
  for (let i = 1; i < parts.length; i++) {
    // 两个数字直接相连会读成一个数（"3" "2" → "32"），中间补 "+"
    out += /\d$/.test(out) && /^\d/.test(parts[i]!) ? '+' : ''
    out += parts[i]!
  }
  return out
}

export function slotCountText(s: SlotState): string {
  return s.countText ?? autoCountText(s.segs)
}

export function slotItemCount(s: Pick<SlotState, 'segs'>): number {
  return s.segs.reduce((n, g) => n + g.ids.length, 0)
}

// ---------- 动作 ----------
export type BenchActionName = 'fill' | 'setSlots' | 'mark' | 'unmark' | 'remainder' | 'transfer' | 'brace' | 'divider' | 'clearNotes'
export type BenchAction = Extract<Action, { do: BenchActionName }>
export const BENCH_ACTIONS: readonly BenchActionName[] = ['fill', 'setSlots', 'mark', 'unmark', 'remainder', 'transfer', 'brace', 'divider', 'clearNotes']

const fail = (e: FieldError): never => {
  throw new ProblemError({ field: e.field, message: e.message })
}
const failMsg = (field: string, message: string): never => fail(fe(field, message))

function replaceSlots(b: BenchState, from: number, to: number, f: (s: SlotState, i: number) => SlotState): SlotState[] {
  const next = b.slotStates.slice()
  for (let i = from; i <= to; i++) next[i - 1] = f(next[i - 1]!, i)
  return next
}

/** 去掉标记。省略 range = 全部 */
function unmarkSlots(b: BenchState, range: Range | null): BenchState {
  const [a, z] = range ?? [1, b.slots]
  return { ...b, slotStates: replaceSlots(b, a, z, (s) => (Object.keys(s.marks).length ? { ...s, marks: {} } : s)) }
}

/** 清除所有 mark（通用动作 clear 对 Bench 的含义） */
export function clearMarks(b: BenchState): BenchState {
  return unmarkSlots(b, null)
}

function sameKind(a: SegState, b: SegState): boolean {
  return a.shape === b.shape && a.color === b.color && a.name === b.name
}

/** 应用一个 Bench 专用动作。出错抛 ProblemError（field 相对于动作本身，如 "slots"） */
export function applyBenchAction(id: string, b: BenchState, a: BenchAction): BenchState {
  switch (a.do) {
    case 'fill': {
      let from = 1
      let to = b.slots
      if (a.slots !== undefined && a.slots !== 'all') {
        const e = rangeError(a.slots, b.slots, 'slots', id)
        if (e) fail(e)
        ;[from, to] = a.slots
      }
      const errs = specErrors(a.segments, 'segments', MAX_SEG_COUNT, MAX_SLOT_ITEMS, '每份里')
      if (errs[0]) fail(errs[0])
      const { gen, done } = makeGen(b)
      const slotStates = replaceSlots(b, from, to, (s) => ({ ...s, segs: buildSegs(s.segs, a.segments, gen), countText: a.countText ?? null }))
      return { ...b, slotStates, defaultFill: a.slots === undefined || a.slots === 'all' ? a.segments.map((s) => ({ ...s })) : b.defaultFill, nextId: done() }
    }
    case 'setSlots': {
      const e = showError(a.show, a.slots, 'show', id)
      if (e) fail(e)
      if (a.compactShow) {
        const ec = showError(a.compactShow, a.slots, 'compactShow', id)
        if (ec) fail(ec)
      }
      const nextShow = normalizeShow(a.show, a.slots)
      const nextCompact = a.compactShow ? normalizeShow(a.compactShow, a.slots) : undefined
      // 留下来的大括号 / 竖线在新的 show 与 compactShow 下都要还能看到，否则会在布局里悄悄消失（或竖线画在“…”正中）
      for (const n of b.braces) {
        if (n.to > a.slots) continue
        const miss = blindView(nextShow, nextCompact, a.slots, braceSeen(n.from, n.to))
        if (miss) {
          fail(blindError(miss.compact ? 'compactShow' : 'show', `已有的大括号 [${n.from}, ${n.to}]（"${n.text}"）`, '画不出大括号', miss, a.slots, '请先 clearNotes，或调整 show / compactShow 让它能看到'))
        }
      }
      for (const n of b.dividers) {
        if (n.after > a.slots) continue
        const miss = blindView(nextShow, nextCompact, a.slots, dividerSeen(n.after))
        if (miss) {
          fail(blindError(miss.compact ? 'compactShow' : 'show', `已有的竖线 after=${n.after}（第 ${n.after}、${n.after + 1} 份）`, '竖线会画在“…”正中间', miss, a.slots, '请先 clearNotes，或调整 show / compactShow 让它旁边至少有一份能看到'))
        }
      }
      const { gen, done } = makeGen(b)
      let slotStates = b.slotStates.slice(0, a.slots)
      for (let i = slotStates.length; i < a.slots; i++) slotStates.push({ segs: buildSegs([], b.defaultFill, gen), countText: null, marks: {} })
      slotStates = slotStates.slice()
      return {
        ...b,
        slots: a.slots,
        show: nextShow,
        // setSlots 总是整体改写显示区间：compactShow 没写 = 窄屏也用 show（不沿用旧的 compactShow，它可能对不上新份数）
        compactShow: nextCompact,
        slotStates,
        // 指向已被删掉的份的标注一并去掉
        braces: b.braces.filter((n) => n.to <= a.slots),
        dividers: b.dividers.filter((n) => n.after <= a.slots),
        nextId: done(),
      }
    }
    case 'mark': {
      const e = rangeError(a.slots, b.slots, 'slots', id)
      if (e) fail(e)
      const color = a.color !== undefined ? resolveColor(a.color) : null
      if (a.color !== undefined && color === null) failMsg('color', `颜色 "${a.color}" 不认识`)
      // 和 brace 一样：桌面和窄屏都要有一份能看到，否则那个屏幕上这个标记凭空没了
      const missMark = blindView(b.show, b.compactShow, b.slots, braceSeen(a.slots[0], a.slots[1]))
      if (missMark) {
        fail(blindError('slots', `slots=[${a.slots[0]}, ${a.slots[1]}] 这几份`, `“${a.style}”标记画不出来`, missMark, b.slots, missMark.compact ? '请换一个桌面和窄屏都能看到的区间，或改 compactShow' : '请换一个能看到的区间，或先 setSlots 改 show'))
      }
      if (a.tint !== undefined && a.style !== 'highlight') failMsg('tint', `tint 只能用于 style="highlight"，但这里是 "${a.style}"`)
      const tintContainer = a.tint === 'container'
      if (tintContainer && b.container === 'none') {
        failMsg('tint', `对象 "${id}" 的 container 是 none（没有盘 / 座 / 箱子），tint="container" 没有东西可染。请去掉 tint，或换有容器的 Bench`)
      }
      const entry: MarkEntry = tintContainer ? { color, tint: 'container' } : { color }
      return { ...b, slotStates: replaceSlots(b, a.slots[0], a.slots[1], (s) => ({ ...s, marks: { ...s.marks, [a.style]: entry } })) }
    }
    case 'unmark': {
      if (a.slots) {
        const e = rangeError(a.slots, b.slots, 'slots', id)
        if (e) fail(e)
      }
      return unmarkSlots(b, a.slots ?? null)
    }
    case 'remainder': {
      if (a.value === null) return { ...b, remainder: null }
      return { ...b, ...setRemainder(b, a.value) }
    }
    case 'transfer':
      return transfer(id, b, a)
    case 'brace': {
      const e = rangeError(a.slots, b.slots, 'slots', id)
      if (e) fail(e)
      // 桌面和窄屏（compact）两种显示都要能看到：任何一种把这几份全藏进省略号，那个屏幕上大括号就消失了
      const miss = blindView(b.show, b.compactShow, b.slots, braceSeen(a.slots[0], a.slots[1]))
      if (miss) {
        fail(blindError('slots', `slots=[${a.slots[0]}, ${a.slots[1]}] 这几份`, '画不出大括号', miss, b.slots, miss.compact ? '请换一个桌面和窄屏都能看到的区间，或改 compactShow' : '请换一个能看到的区间，或先 setSlots 改 show'))
      }
      const note: BraceNote = { from: a.slots[0], to: a.slots[1], text: a.text, side: a.side ?? 'below' }
      const same = (n: BraceNote) => n.from === note.from && n.to === note.to && n.side === note.side && n.text === note.text
      return { ...b, braces: [...b.braces.filter((n) => !same(n)), note] }
    }
    case 'divider': {
      if (a.after < 1 || a.after > b.slots) {
        failMsg('after', `after=${a.after} 超出范围：竖线画在第 after 份之后，对象 "${id}" 现在有 ${b.slots} 份，after 应在 1~${b.slots}`)
      }
      // 竖线画在第 after 份和第 after+1 份之间：两边都被省略号藏起来时，线会画在“…”正中间，所以每种显示下至少要有一边看得见
      const missDiv = blindView(b.show, b.compactShow, b.slots, dividerSeen(a.after))
      if (missDiv) {
        fail(blindError('after', `after=${a.after}（第 ${a.after}、${a.after + 1} 份）`, '竖线会画在“…”正中间', missDiv, b.slots, missDiv.compact ? '请换一个桌面和窄屏下旁边都有份显示的 after，或改 compactShow' : '请换一个旁边有份显示的 after，或先 setSlots 改 show'))
      }
      const note: DividerNote = { after: a.after, text: a.text ?? null }
      return { ...b, dividers: [...b.dividers.filter((n) => n.after !== a.after), note] }
    }
    case 'clearNotes':
      return { ...b, braces: [], dividers: [] }
  }
}

function describeShow(show: readonly Range[] | null, slots: number): string {
  return show ? show.map(([x, y]) => (x === y ? `${x}` : `${x}~${y}`)).join('、') : `1~${slots}（全部）`
}

/** 区间 [from, to] 里至少有一份显示着 */
const braceSeen = (from: number, to: number) => (vis: readonly number[]) => vis.some((i) => i >= from && i <= to)
/** 竖线 after（第 after 份与第 after+1 份之间）至少有一侧显示着 */
const dividerSeen = (after: number) => (vis: readonly number[]) => vis.includes(after) || vis.includes(after + 1)

/**
 * 按桌面（show）和窄屏（compactShow；undefined = 窄屏跟桌面一样，不用再查）两种显示依次检查 seen(可见份下标)。
 * 返回第一个不满足的显示方式（连同它的 show，用来写错误信息）；都满足返回 null。
 */
function blindView(
  show: readonly Range[] | null,
  compactShow: readonly Range[] | null | undefined,
  slots: number,
  seen: (visible: readonly number[]) => boolean,
): { compact: boolean; show: readonly Range[] | null } | null {
  if (!seen(visibleSlots(slots, show))) return { compact: false, show }
  if (compactShow !== undefined && !seen(visibleSlots(slots, compactShow))) return { compact: true, show: compactShow }
  return null
}

/** “这些东西在某种显示下一份都看不到”的错误。what = 主语，consequence = 后果，fix = 怎么改 */
function blindError(field: string, what: string, consequence: string, v: { compact: boolean; show: readonly Range[] | null }, slots: number, fix: string): FieldError {
  return v.compact
    ? fe(field, `${what}在窄屏（compactShow）下都被省略号藏起来了（窄屏显示的份：${describeShow(v.show, slots)}），手机上${consequence}。${fix}`)
    : fe(field, `${what}现在都被省略号藏起来了（当前显示的份：${describeShow(v.show, slots)}），${consequence}。${fix}`)
}

function setRemainder(b: BenchState, v: Remainder): Pick<BenchState, 'remainder' | 'nextId'> {
  const items = v.items ?? []
  const errs = specErrors(items, 'value.items', MAX_REMAINDER_ITEMS, MAX_REMAINDER_ITEMS, '行尾')
  if (errs[0]) fail(errs[0])
  const { gen, done } = makeGen(b)
  return { remainder: { type: v.type, text: v.text, was: v.was ?? null, segs: buildSegs(b.remainder?.segs ?? [], items, gen) }, nextId: done() }
}

function transfer(id: string, b: BenchState, a: Extract<BenchAction, { do: 'transfer' }>): BenchState {
  for (const k of ['from', 'to'] as const) {
    const e = rangeError(a[k], b.slots, k, id)
    if (e) fail(e)
  }
  const [f0, f1] = a.from
  const [t0, t1] = a.to
  if (f1 - f0 !== t1 - t0) {
    failMsg('to', `份数对不上：from=[${f0}, ${f1}] 有 ${f1 - f0 + 1} 份，to=[${t0}, ${t1}] 有 ${t1 - t0 + 1} 份，必须一样多（一份对一份）`)
  }
  if (f0 <= t1 && t0 <= f1) {
    failMsg('to', `from=[${f0}, ${f1}] 和 to=[${t0}, ${t1}] 有重叠，搬运的两边不能是同一份`)
  }
  const si = a.segment ?? 0
  const slotStates = b.slotStates.slice()
  for (let k = 0; k <= f1 - f0; k++) {
    const src = f0 + k
    const dst = t0 + k
    const from = slotStates[src - 1]!
    const seg = from.segs[si]
    if (!seg) {
      failMsg('segment', `第 ${src} 份只有 ${from.segs.length} 段东西，没有第 ${si} 段（segment 从 0 起；不写就是第 0 段）`)
    }
    const s = seg!
    if (s.shape === 'block') failMsg('segment', `第 ${src} 份的第 ${si} 段是 block（方块），transfer 只能搬 token（球、小人等）`)
    if (s.ids.length < a.count) {
      failMsg('count', `第 ${src} 份的第 ${si} 段只有 ${s.ids.length} 个，不够拿 ${a.count} 个`)
    }
    const moved = s.ids.slice(s.ids.length - a.count)
    const rest = s.ids.slice(0, s.ids.length - a.count)
    const srcSegs = from.segs.map((g, j) => (j === si ? { ...g, ids: rest } : g)).filter((g) => g.ids.length > 0)
    slotStates[src - 1] = { ...from, segs: srcSegs, countText: null }

    const to = slotStates[dst - 1]!
    const idx = to.segs.findIndex((g) => sameKind(g, s))
    const dstSegs =
      idx >= 0
        ? to.segs.map((g, j) => (j === idx ? { ...g, ids: [...g.ids, ...moved] } : g))
        : [...to.segs, { ...s, ids: moved }]
    const dstSlot = { ...to, segs: dstSegs, countText: null }
    if (slotItemCount(dstSlot) > MAX_SLOT_ITEMS) {
      failMsg('to', `搬完后第 ${dst} 份会有 ${slotItemCount(dstSlot)} 个东西，超过每份上限 ${MAX_SLOT_ITEMS}`)
    }
    slotStates[dst - 1] = dstSlot
  }
  return { ...b, slotStates }
}

// ---------- 布局 ----------
export interface LayoutItem {
  id: string
  shape: ItemShape
  /** 已应用 highlight 标记后的颜色 */
  color: string
  /** block 的文字 */
  text: string | null
  /** 这一件的高度（block = 世界高度；token = 形状高度） */
  h: number
  /** 所属份；0 = 行尾 remainder */
  slot: number
  x: number
  y: number
  z: number
  /** 虚影：虚线描边的颜色；null = 实体 */
  ghost: string | null
  dim: boolean
}

export interface LayoutSlot {
  index: number
  x: number
  container: Container
  highlight: string | null
  cross: string | null
  dim: boolean
  /** 数字标签文字（countLabel 为 false 或没有内容时为 ''） */
  count: string
  caption: string | null
}

export interface LayoutBrace {
  key: string
  x0: number
  x1: number
  side: 'above' | 'below'
  /** 大括号的基线 y（贴着份的一侧） */
  y: number
  text: string
}
export interface LayoutDivider {
  key: string
  x: number
  y0: number
  y1: number
  text: string | null
}

export interface BenchLayout {
  entries: ({ kind: 'slot'; index: number; x: number } | { kind: 'gap'; key: string; x: number })[]
  slots: LayoutSlot[]
  gaps: { key: string; x: number }[]
  items: LayoutItem[]
  /** 份区域左右边界 */
  xL: number
  xR: number
  /** 行首 label 的位置；没有 label 为 null */
  label: { text: string; x: number } | null
  /** 数字标签所在高度（所有份对齐） */
  countY: number
  /** was = 被划掉的旧文字（在新文字正上方 wasY 处）；没有为 null */
  remainder: { type: 'extra' | 'short'; text: string; x: number; y: number; was: string | null; wasY: number } | null
  braces: LayoutBrace[]
  dividers: LayoutDivider[]
  /** 局部坐标包围盒（相对 position） */
  bounds: { min: [number, number, number]; max: [number, number, number] }
}

/** 堆叠一份（或行尾）的东西：从 baseY 往上，token 每层最多 3 个，block 单独一层 */
function stackSegs(segs: readonly SegState[], cx: number, z: number, baseY: number): { items: Omit<LayoutItem, 'slot' | 'ghost' | 'dim'>[]; top: number } {
  const items: Omit<LayoutItem, 'slot' | 'ghost' | 'dim'>[] = []
  let cursor = baseY
  for (const s of segs) {
    if (s.shape === 'block') {
      const h = BLOCK_UNIT * (s.height ?? 1)
      items.push({ id: s.ids[0]!, shape: 'block', color: s.color, text: s.text ?? '', h, x: cx, y: cursor + h / 2, z })
      cursor += h
      continue
    }
    const h = SHAPE_H[s.shape]
    const n = s.ids.length
    s.ids.forEach((tid, j) => {
      const layer = Math.floor(j / PER_LAYER)
      const k = Math.min(PER_LAYER, n - layer * PER_LAYER)
      const col = j % PER_LAYER
      items.push({ id: tid, shape: s.shape, color: s.color, text: null, h, x: cx + (col - (k - 1) / 2) * PITCH, y: cursor + layer * h + h / 2, z })
    })
    cursor += Math.ceil(n / PER_LAYER) * h
  }
  return { items, top: cursor }
}

/**
 * 行尾的一堆：token 排成正对观众的紧凑小方阵（cols = ⌈√n⌉ 列，从下往上、从左往右摆，16 个 = 4×4，一眼能数清），
 * block 竖着叠在上面。
 */
function heapSegs(segs: readonly SegState[], cx: number): { items: Omit<LayoutItem, 'slot' | 'ghost' | 'dim'>[]; top: number; width: number } {
  const tokens = segs.filter((s) => s.shape !== 'block').flatMap((s) => s.ids.map((tid) => ({ tid, s })))
  const blocks = segs.filter((s) => s.shape === 'block')
  const items: Omit<LayoutItem, 'slot' | 'ghost' | 'dim'>[] = []
  let width = 0
  let cursor = 0
  const n = tokens.length
  if (n > 0) {
    const cols = Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    const h = Math.max(...tokens.map((t) => SHAPE_H[t.s.shape as TokenShape]))
    width = cols * PITCH
    tokens.forEach(({ tid, s }, t) => {
      const row = Math.floor(t / cols)
      const col = t % cols
      items.push({
        id: tid,
        shape: s.shape,
        color: s.color,
        text: null,
        h: SHAPE_H[s.shape as TokenShape],
        x: cx + (col - (cols - 1) / 2) * PITCH,
        y: row * h + h / 2,
        z: 0,
      })
    })
    cursor = rows * h
  }
  for (const s of blocks) {
    const h = BLOCK_UNIT * (s.height ?? 1)
    items.push({ id: s.ids[0]!, shape: 'block', color: s.color, text: s.text ?? '', h, x: cx, y: cursor + h / 2, z: 0 })
    cursor += h
    width = Math.max(width, BLOCK_W)
  }
  return { items, top: cursor, width }
}

/**
 * 大括号的折线点（局部坐标，基线 y=0，x 从 -width/2 到 width/2）。
 * below：两端向上翻（朝向份），中间尖向下；above 相反。由 4 段 1/4 圆弧 + 2 条直线组成。
 */
export function bracePoints(width: number, side: 'above' | 'below', seg = 8): [number, number, number][] {
  const w = Math.max(width, 0.4)
  const r = Math.min(0.16, w / 5)
  const pts: [number, number][] = []
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const t = a0 + ((a1 - a0) * i) / seg
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
    }
  }
  const h = w / 2
  arc(-h + r, r, Math.PI, 1.5 * Math.PI) // 左端翻起 -> 基线
  arc(-r, -r, 0.5 * Math.PI, 0) // 基线 -> 中间尖
  arc(r, -r, Math.PI, 0.5 * Math.PI) // 中间尖 -> 基线
  arc(h - r, r, 1.5 * Math.PI, 2 * Math.PI) // 基线 -> 右端翻起
  const sign = side === 'below' ? 1 : -1
  return pts.map(([x, y]) => [x, sign * y, 0])
}

/** 旧文字（划掉的）字号，和 styles.css 的 .bench-was 一致 */
export const WAS_FONT_PX = 15
/** 旧文字中心比新文字中心高多少（世界单位）：约 38px/单位，18px 的新字和 15px 的旧字上下留一点空隙 */
export const WAS_LIFT = 0.58

const layoutCache = new WeakMap<BenchState, BenchLayout>()
const compactLayoutCache = new WeakMap<BenchState, BenchLayout>()

/**
 * 把状态变成一排坐标（局部坐标，份区域以 x=0 为中心）。同一个状态对象只算一次。
 * compact=true（窄屏）时用 compactShow 代替 show（没写 compactShow 就跟桌面一样，直接复用桌面的布局）。
 */
export function layoutBench(b: BenchState, compact = false): BenchLayout {
  if (compact && b.compactShow === undefined) compact = false
  const cache = compact ? compactLayoutCache : layoutCache
  const hit = cache.get(b)
  if (hit) return hit
  const out = computeLayout(b, compact)
  cache.set(b, out)
  return out
}

function computeLayout(b: BenchState, compact: boolean): BenchLayout {
  const raw = visibleEntries(b.slots, effectiveShow(b, compact))
  const E = raw.length
  const xOf = (i: number) => (i - (E - 1) / 2) * SPACING
  const entries = raw.map((e, i) => ({ ...e, x: xOf(i) }))
  const xL = (-E * SPACING) / 2
  const xR = (E * SPACING) / 2
  const slotX = new Map<number, number>()
  const gaps: { key: string; x: number }[] = []
  for (const e of entries) {
    if (e.kind === 'slot') slotX.set(e.index, e.x)
    else gaps.push({ key: e.key, x: e.x })
  }

  const items: LayoutItem[] = []
  const slots: LayoutSlot[] = []
  const zTok = b.container === 'person' ? 0.3 : 0
  let rowTop = 0.3
  for (const e of entries) {
    if (e.kind !== 'slot') continue
    const st = b.slotStates[e.index - 1]!
    const hl = st.marks.highlight ? (st.marks.highlight.color ?? HIGHLIGHT_COLOR) : null
    // tint=container：只染容器（slot.highlight），里面的物品保持原色
    const itemHl = st.marks.highlight?.tint === 'container' ? null : hl
    const ghost = st.marks.ghost ? (st.marks.ghost.color ?? BENCH_RED) : null
    const dim = !!st.marks.dim
    const { items: its, top } = stackSegs(st.segs, e.x, zTok, TOKEN_BASE[b.container])
    for (const it of its) items.push({ ...it, color: itemHl ?? it.color, slot: e.index, ghost, dim })
    rowTop = Math.max(rowTop, top, CONTAINER_TOP[b.container])
    slots.push({
      index: e.index,
      x: e.x,
      container: b.container,
      highlight: hl,
      cross: st.marks.cross ? (st.marks.cross.color ?? BENCH_RED) : null,
      dim,
      count: b.countLabel ? slotCountText(st) : '',
      caption: b.caption,
    })
  }
  const countY = rowTop + 0.3

  // 行尾 remainder
  let remainder: BenchLayout['remainder'] = null
  let right = xR
  let remTop = 0
  if (b.remainder) {
    const heap0 = heapSegs(b.remainder.segs, 0)
    // 行尾文字居中在这堆东西上方：文字比这堆东西还宽时，会向左伸出去压住最后一份的数字，所以按文字宽度把整堆往右让
    // 划掉的旧文字在新文字正上方，也不能向左伸出去压住最后一份
    const wasW = b.remainder.was ? (textPx(b.remainder.was, WAS_FONT_PX) + 16) / 38 : 0
    const w = Math.max(heap0.items.length > 0 ? heap0.width : 1.0, remainderTextWidth(b.remainder.text), wasW)
    const cx = xR + 0.3 + w / 2
    const heap = heapSegs(b.remainder.segs, cx)
    const ghost = b.remainder.type === 'short' ? BENCH_RED : null
    for (const it of heap.items) items.push({ ...it, slot: 0, ghost, dim: false })
    remTop = heap.top
    right = cx + Math.max(w, 1.0) / 2
    const remY = Math.max(remTop, rowTop) + 0.3
    remainder = { type: b.remainder.type, text: b.remainder.text, x: cx, y: remY, was: b.remainder.was, wasY: remY + WAS_LIFT }
  }

  // 大括号 / 竖线
  const belowY = CAPTION_Y[b.container] - (b.caption ? 0.38 : 0.12)
  const aboveY = rowTop + (b.countLabel ? 0.62 : 0.3)
  const braces: LayoutBrace[] = []
  for (const n of b.braces) {
    const xs = [...slotX.entries()].filter(([i]) => i >= n.from && i <= n.to).map(([, x]) => x)
    if (xs.length === 0) continue
    braces.push({
      key: `${n.from}-${n.to}-${n.side}-${n.text}`,
      x0: Math.min(...xs) - 0.5,
      x1: Math.max(...xs) + 0.5,
      side: n.side,
      y: n.side === 'below' ? belowY : aboveY,
      text: n.text,
    })
  }
  const dividerX = (after: number): number => {
    const here = slotX.get(after)
    if (here !== undefined) return here + SPACING / 2
    const next = slotX.get(after + 1)
    if (next !== undefined) return next - SPACING / 2
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!
      if (e.kind !== 'gap') continue
      const prev = entries[i - 1]
      const nx = entries[i + 1]
      if (prev?.kind === 'slot' && nx?.kind === 'slot' && after > prev.index && after + 1 < nx.index) return e.x
    }
    const first = entries.find((e) => e.kind === 'slot')
    return first && first.kind === 'slot' && after < first.index ? xL : xR
  }
  const dividers: LayoutDivider[] = b.dividers.map((n) => {
    const x = dividerX(n.after)
    // 竖线贴着行尾（“准时到校”线在最后一份旁边）时，它顶上的文字会压在行尾“多 / 少”文字上：把线加高一截，文字抬到上面
    const nearRemainder = !!n.text && !!remainder && Math.abs(x - remainder.x) < DIVIDER_REMAINDER_CLEAR
    // 线顶上的文字和“上方大括号”的文字水平方向上会压在一起（窄屏 compactShow 把份挤在一起时很容易出现）：抬到大括号文字之上（DIVIDER_BRACE_LIFT，已经够高，不再叠加 nearRemainder 的抬高）
    const dw = n.text ? (textPx(n.text, 14) + 4) / 38 : 0
    const hitsBrace =
      !!n.text &&
      braces.some((br) => br.side === 'above' && Math.abs(x - (br.x0 + br.x1) / 2) < ((textPx(br.text, 16) + 12) / 38 + dw) / 2 + 0.1)
    return {
      key: `d${n.after}`,
      x,
      y0: belowY - 0.15,
      y1: aboveY + 0.1 + (hitsBrace ? DIVIDER_BRACE_LIFT : nearRemainder ? DIVIDER_LIFT : 0),
      text: n.text,
    }
  })

  const hasAbove = braces.some((x) => x.side === 'above')
  const hasBelow = braces.some((x) => x.side === 'below')
  const labelX = xL - 0.6
  const label = b.label ? { text: b.label, x: labelX } : null
  const bounds = {
    min: [Math.min(xL, label ? labelX - 0.3 : xL), Math.min(CAPTION_Y[b.container] - 0.3, hasBelow ? belowY - 0.8 : 0, dividers.length ? belowY - 0.3 : 0), -0.6] as [number, number, number],
    max: [Math.max(xR, right), Math.max(countY + 0.3, remainder ? (remainder.was ? remainder.wasY : remainder.y) + 0.3 : 0, hasAbove ? aboveY + 0.8 : 0, dividers.length ? Math.max(...dividers.map((d) => d.y1)) + 0.3 : 0), 0.7 + (b.remainder && remTop > 0 ? 0.4 : 0)] as [number, number, number],
  }
  return { entries, slots, gaps, items, xL, xR, label, countY, remainder, braces, dividers, bounds }
}
