import { z } from 'zod'
import { resolveColor } from '../engine/colors'

/**
 * 题目 JSON 的 zod schema（DESIGN.md §3）。
 * 所有对象都用 strictObject：字段名拼错会直接报「不认识的字段」，而不是被悄悄忽略。
 * 与「引用关系」有关的语义校验（target 是否存在等）在 engine/validate.ts。
 */

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
export type Vec3 = z.infer<typeof Vec3Schema>

/** 相机投影：perspective 透视（默认，近大远小）；orthographic 正交（三视图 / 平面观察，不近大远小） */
export const ProjectionSchema = z.enum(['perspective', 'orthographic'])
export type Projection = z.infer<typeof ProjectionSchema>

export const CameraSpecSchema = z
  .strictObject({
    position: Vec3Schema,
    target: Vec3Schema.optional(),
    projection: ProjectionSchema.optional(),
  })
  .superRefine((c, ctx) => {
    const p = c.position
    const q = c.target ?? [0, 0, 0]
    if (p[0] === q[0] && p[1] === q[1] && p[2] === q[2]) {
      ctx.addIssue({ code: 'custom', message: 'camera 的 position 和 target 不能是同一个点' })
    }
  })
export type CameraSpec = z.infer<typeof CameraSpecSchema>

// ---------- 场景对象 ----------
const id = z.string().min(1)
const dim = z.number().int().min(1).max(20)

export const CubeGridSchema = z.strictObject({
  id,
  type: z.literal('CubeGrid'),
  size: z.tuple([dim, dim, dim]),
  paint: z.enum(['surface', 'none']).optional(),
  visible: z.boolean().optional(),
  position: Vec3Schema.optional(),
})

export const CubeStackSchema = z.strictObject({
  id,
  type: z.literal('CubeStack'),
  heights: z.array(z.array(z.number().int().min(0).max(20)).min(1)).min(1),
  visible: z.boolean().optional(),
  position: Vec3Schema.optional(),
})

export const LabelSchema = z.strictObject({
  id,
  type: z.literal('Label'),
  text: z.string(),
  position: Vec3Schema,
  visible: z.boolean().optional(),
})

// ---------- Bench（分配行 / 板凳模型）与 Arrow ----------
/** 颜色：颜色名或 #rgb / #rrggbb */
const colorStr = z
  .string()
  .min(1)
  .refine((c) => resolveColor(c) !== null, {
    message: '颜色不认识。请写 #rrggbb（如 "#f5b301"），或 yellow / red / blue / green / purple / orange / pink / teal / gray',
  })

/** 闭区间 [from, to]，份的下标从 1 起（是否越界在语义校验里按当前份数检查） */
export const RangeSchema = z.tuple([z.int(), z.int()], { error: '区间要写成两个整数 [起点, 终点]，如 [1, 3]（份从 1 起数，包含两端）' })
export type Range = z.infer<typeof RangeSchema>

export const TokenShapeSchema = z.enum(['ball', 'disc', 'cube', 'person', 'cup', 'flower'])
export type TokenShape = z.infer<typeof TokenShapeSchema>

export const SegmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('token'),
    shape: TokenShapeSchema,
    count: z.int().min(1).max(40),
    color: colorStr.optional(),
    name: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('block'),
    text: z.string().min(1),
    height: z.number().min(0.3).max(4).optional(),
    color: colorStr.optional(),
  }),
])
export type Segment = z.infer<typeof SegmentSchema>

export const RemainderSchema = z.strictObject({
  type: z.enum(['extra', 'short']),
  text: z.string().min(1),
  /** 旧文字：老师划掉的那一行（灰色 + 红色删除线，显示在新文字上方）；不写 = 没有划掉的旧文字 */
  was: z.string().min(1).optional(),
  items: z.array(SegmentSchema).optional(),
})
export type Remainder = z.infer<typeof RemainderSchema>

export const BENCH_CONTAINERS = ['seat', 'plate', 'person', 'box', 'none'] as const
export const ContainerSchema = z.enum(BENCH_CONTAINERS)
export type Container = z.infer<typeof ContainerSchema>

export const BenchSchema = z.strictObject({
  id,
  type: z.literal('Bench'),
  position: Vec3Schema.optional(),
  label: z.string().optional(),
  slots: z.int().min(1).max(1000),
  show: z.array(RangeSchema).min(1).optional(),
  /** 窄屏（画布宽度 < 600px，见 fit.ts 的 COMPACT_WIDTH）时用它代替 show：显示更少的份，文字才能大一点 */
  compactShow: z.array(RangeSchema).min(1).optional(),
  container: ContainerSchema.optional(),
  caption: z.string().optional(),
  fill: z.array(SegmentSchema).optional(),
  countLabel: z.boolean().optional(),
  remainder: RemainderSchema.nullable().optional(),
  visible: z.boolean().optional(),
})
export type BenchDef = z.infer<typeof BenchSchema>

export const ArrowSchema = z.strictObject({
  id,
  type: z.literal('Arrow'),
  from: Vec3Schema,
  to: Vec3Schema,
  text: z.string().optional(),
  /** 文字沿箭身的位置：start 靠起点 / mid 中间（默认）/ end 靠箭头 */
  textAt: z.enum(['start', 'mid', 'end']).optional(),
  /** 文字在箭身哪一侧：auto（默认：竖箭放侧面、横箭放上方）/ left / right / above / below */
  textSide: z.enum(['auto', 'left', 'right', 'above', 'below']).optional(),
  /** 窄屏 compact 模式（见 Bench 的 compactShow）下，整个箭头（起点和终点）平移的量；省略 = 不动 */
  compactOffset: Vec3Schema.optional(),
  color: colorStr.optional(),
  visible: z.boolean().optional(),
})

export const SceneObjectSchema = z.discriminatedUnion('type', [
  CubeGridSchema,
  CubeStackSchema,
  LabelSchema,
  BenchSchema,
  ArrowSchema,
])
export type SceneObject = z.infer<typeof SceneObjectSchema>
export type SceneObjectType = SceneObject['type']

// ---------- Filter ----------
const IntOrList = z.union([z.number().int(), z.array(z.number().int()).min(1)])
const RegionEnum = z.enum(['corner', 'edge', 'face', 'inner'])

export const FilterSchema = z.strictObject({
  x: IntOrList.optional(),
  y: IntOrList.optional(),
  z: IntOrList.optional(),
  layer: IntOrList.optional(),
  paintedFaces: IntOrList.optional(),
  exposedFaces: IntOrList.optional(),
  region: z.union([RegionEnum, z.array(RegionEnum).min(1)]).optional(),
})
export type Filter = z.infer<typeof FilterSchema>

// ---------- Action ----------
const target = z.string().min(1)
const color = z.string().min(1)

export const ActionSchema = z.discriminatedUnion('do', [
  z.strictObject({ do: z.literal('show'), target }),
  z.strictObject({ do: z.literal('hide'), target }),
  z.strictObject({ do: z.literal('explode'), target, gap: z.number().min(0).max(5).optional() }),
  z.strictObject({
    do: z.literal('highlight'),
    target,
    filter: FilterSchema.optional(),
    color: color.optional(),
  }),
  z.strictObject({
    do: z.literal('fade'),
    target,
    filter: FilterSchema.optional(),
    opacity: z.number().min(0).max(1),
  }),
  z.strictObject({ do: z.literal('number'), target, filter: FilterSchema.optional() }),
  z.strictObject({ do: z.literal('clear'), target }),
  z.strictObject({ do: z.literal('reset'), target }),
  z.strictObject({ do: z.literal('setText'), target, text: z.string() }),
  z.strictObject({ do: z.literal('move'), target, position: Vec3Schema }),
  // ---- Bench 专用 ----
  z.strictObject({
    do: z.literal('fill'),
    target,
    slots: z.union([z.literal('all'), RangeSchema]).optional(),
    segments: z.array(SegmentSchema),
    countText: z.string().optional(),
  }),
  z.strictObject({
    do: z.literal('setSlots'),
    target,
    slots: z.int().min(1).max(1000),
    show: z.array(RangeSchema).min(1).optional(),
    compactShow: z.array(RangeSchema).min(1).optional(),
  }),
  z.strictObject({
    do: z.literal('mark'),
    target,
    slots: RangeSchema,
    style: z.enum(['highlight', 'cross', 'ghost', 'dim']),
    color: colorStr.optional(),
    /** 仅 highlight："all"（默认）容器和里面的东西都变高亮色；"container" 只给容器上色，物品保持原色 */
    tint: z.enum(['all', 'container']).optional(),
  }),
  z.strictObject({ do: z.literal('unmark'), target, slots: RangeSchema.optional() }),
  z.strictObject({ do: z.literal('remainder'), target, value: RemainderSchema.nullable() }),
  z.strictObject({
    do: z.literal('transfer'),
    target,
    from: RangeSchema,
    to: RangeSchema,
    count: z.int().min(1),
    segment: z.int().min(0).optional(),
  }),
  z.strictObject({
    do: z.literal('brace'),
    target,
    slots: RangeSchema,
    text: z.string().min(1),
    side: z.enum(['above', 'below']).optional(),
  }),
  z.strictObject({ do: z.literal('divider'), target, after: z.int(), text: z.string().optional() }),
  z.strictObject({ do: z.literal('clearNotes'), target }),
])
export type Action = z.infer<typeof ActionSchema>
export type ActionName = Action['do']

// ---------- Step ----------
export const ControlSchema = z.strictObject({
  param: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, '参数名只能由字母/数字/下划线组成，且不能以数字开头'),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().optional(),
  default: z.number(),
  bind: z
    .array(
      z.strictObject({
        target: z.string().min(1),
        prop: z.literal('size'),
        value: z.array(z.string().min(1)).length(3),
      }),
    )
    .min(1),
})
export type Control = z.infer<typeof ControlSchema>

export const StepSchema = z
  .strictObject({
    title: z.string().min(1),
    type: z.enum(['normal', 'quiz', 'explore']).optional(),
    narration: z.string().optional(),
    formula: z.string().optional(),
    image: z.string().optional(),
    camera: CameraSpecSchema.optional(),
    autoRotate: z.boolean().optional(),
    actions: z.array(ActionSchema).optional(),
    // quiz
    question: z.string().optional(),
    options: z.array(z.string().min(1)).min(2).optional(),
    answer: z.number().int().optional(),
    explanation: z.string().optional(),
    // explore
    control: ControlSchema.optional(),
    formulaTemplate: z.string().optional(),
  })
  .superRefine((s, ctx) => {
    const t = s.type ?? 'normal'
    const bad = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    if (t === 'quiz') {
      if (!s.question) bad('question', 'quiz 步骤必须写 question（题目）')
      if (!s.options) bad('options', 'quiz 步骤必须写 options（至少 2 个选项）')
      if (s.answer === undefined) bad('answer', 'quiz 步骤必须写 answer（正确选项的编号，从 0 开始）')
      else if (s.options && (s.answer < 0 || s.answer >= s.options.length)) {
        bad('answer', `answer=${s.answer} 超出范围：options 只有 ${s.options.length} 项，answer 应在 0~${s.options.length - 1}`)
      }
    } else {
      for (const k of ['question', 'options', 'answer', 'explanation'] as const) {
        if (s[k] !== undefined) bad(k, `只有 "type": "quiz" 的步骤才能写 ${k}（是不是忘了写 type？）`)
      }
    }
    if (t === 'explore') {
      if (!s.control) bad('control', 'explore 步骤必须写 control（滑块参数）')
    } else {
      for (const k of ['control', 'formulaTemplate'] as const) {
        if (s[k] !== undefined) bad(k, `只有 "type": "explore" 的步骤才能写 ${k}（是不是忘了写 type？）`)
      }
    }
  })
export type Step = z.infer<typeof StepSchema>
export type StepType = NonNullable<Step['type']>

// ---------- Problem ----------
export const ProblemSchema = z
  .strictObject({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'id 只能用字母、数字、- 和 _（会出现在网址里）'),
    title: z.string().min(1),
    grade: z.array(z.number().int()).optional(),
    tags: z.array(z.string()).optional(),
    problem: z.string().min(1),
    answer: z.string().optional(),
    /** 系列名（首页按它分组），如 "三秋 S06 · 盈亏进阶"；不写则归入"其他" */
    series: z.string().min(1).optional(),
    /** 在系列内的排序（小的在前） */
    order: z.number().optional(),
    /** 小节标签，如 "思维锦囊1"、"小试牛刀2" */
    section: z.string().min(1).optional(),
    scene: z.strictObject({
      objects: z.array(SceneObjectSchema),
      camera: CameraSpecSchema.optional(),
    }),
    steps: z.array(StepSchema).min(1, 'steps 至少要有 1 步'),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>()
    p.scene.objects.forEach((o, i) => {
      if (seen.has(o.id)) {
        ctx.addIssue({ code: 'custom', path: ['scene', 'objects', i, 'id'], message: `对象 id "${o.id}" 重复了` })
      }
      seen.add(o.id)
    })
  })
export type Problem = z.infer<typeof ProblemSchema>
