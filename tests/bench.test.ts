import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateProblemData } from '../src/content'
import {
  DIVIDER_BRACE_LIFT,
  DIVIDER_LIFT,
  CONTAINER_TOP,
  MAX_VISIBLE,
  TOKEN_BASE,
  WAS_LIFT,
  autoCountText,
  bracePoints,
  effectiveShow,
  initialBench,
  layoutBench,
  normalizeShow,
  remainderTextWidth,
  visibleEntries,
  visibleSlots,
  type BenchState,
  type SegState,
} from '../src/engine/bench'
import { arrowEnds, computeStates, initialState, sceneRadius, sceneRadiusAt, type SceneState } from '../src/engine/state'
import { COMPACT_WIDTH, isCompactWidth, sceneFit, sceneFitInfo } from '../src/engine/fit'
import { ProblemError } from '../src/engine/validate'
import { ProblemSchema, type Problem } from '../src/schema/problem'
import { groupBySeries, seriesNeighbors, OTHER_SERIES } from '../src/catalog'

const ball3 = { kind: 'token', shape: 'ball', count: 3 }
const benchDef = (extra: object = {}) => ({ id: 'b', type: 'Bench', slots: 4, fill: [ball3], ...extra })

function mk(steps: unknown[], objects: unknown[] = [benchDef()]): Problem {
  return ProblemSchema.parse({ id: 't', title: 't', problem: 'p', scene: { objects }, steps })
}
const run = (actions: unknown[], objects?: unknown[]) => computeStates(mk([{ title: 's', actions }], objects))[0]!
const B = (s: SceneState, id = 'b'): BenchState => s.objects[id]!.bench!
const ids = (b: BenchState, slot: number): string[] => b.slotStates[slot - 1]!.segs.flatMap((g) => g.ids)
const allIds = (b: BenchState): string[] => b.slotStates.flatMap((_, i) => ids(b, i + 1))

describe('Bench 初始状态', () => {
  it('每份按 fill 生成 token，id 全局唯一且稳定（t0, t1, …）', () => {
    const b = initialBench(benchDef() as never)
    expect(b.slots).toBe(4)
    expect(b.container).toBe('seat')
    expect(b.countLabel).toBe(true)
    expect(ids(b, 1)).toEqual(['t0', 't1', 't2'])
    expect(ids(b, 4)).toEqual(['t9', 't10', 't11'])
    expect(new Set(allIds(b)).size).toBe(12)
    expect(b.nextId).toBe(12)
    expect(b.slotStates[0]!.segs[0]).toMatchObject({ shape: 'ball', color: '#f2994a' })
  })

  it('remainder 的 token 也有 id，接在份之后', () => {
    const b = initialBench(benchDef({ remainder: { type: 'extra', text: '多16颗', items: [{ kind: 'token', shape: 'ball', count: 16 }] } }) as never)
    expect(b.remainder!.segs[0]!.ids).toHaveLength(16)
    expect(b.remainder!.segs[0]!.ids[0]).toBe('t12')
    expect(b.nextId).toBe(28)
  })

  it('同一份里第二个同形状且没写颜色的段会换颜色', () => {
    const b = initialBench(benchDef({ fill: [ball3, ball3] }) as never)
    const [a, c] = b.slotStates[0]!.segs
    expect(a!.color).not.toBe(c!.color)
  })

  it('id 相同、状态不可变：computeStates 重复计算结果完全相同', () => {
    const p = mk([{ title: 'a', actions: [{ do: 'fill', target: 'b', slots: [1, 2], segments: [{ kind: 'token', shape: 'ball', count: 5 }] }] }])
    expect(computeStates(p)).toEqual(computeStates(p))
  })
})

describe('fill', () => {
  const five = { kind: 'token', shape: 'ball', count: 5 }

  it('只改指定区间；沿用同形状 token 的 id，只补新的（3→5：前 3 个 id 不变）', () => {
    const s = run([{ do: 'fill', target: 'b', slots: [1, 2], segments: [five] }])
    const b = B(s)
    expect(ids(b, 1)).toEqual(['t0', 't1', 't2', 't12', 't13'])
    expect(ids(b, 2)).toEqual(['t3', 't4', 't5', 't14', 't15'])
    expect(ids(b, 3)).toEqual(['t6', 't7', 't8'])
  })

  it('变少：保留前面的 id，多出来的 id 消失', () => {
    const s = run([{ do: 'fill', target: 'b', slots: [1, 1], segments: [{ kind: 'token', shape: 'ball', count: 1 }] }])
    expect(ids(B(s), 1)).toEqual(['t0'])
  })

  it('形状变了：全部换成新 id（旧的消失、新的出现）', () => {
    const s = run([{ do: 'fill', target: 'b', slots: [1, 1], segments: [{ kind: 'token', shape: 'cube', count: 3 }] }])
    expect(ids(B(s), 1)).toEqual(['t12', 't13', 't14'])
  })

  it('5 个球 → "3 个 + 2 个蓝色"：id 都不变，只是后两个原地变色', () => {
    const p = mk([
      { title: 'a', actions: [{ do: 'fill', target: 'b', segments: [five] }] },
      { title: 'b', actions: [{ do: 'fill', target: 'b', slots: [1, 4], segments: [ball3, { kind: 'token', shape: 'ball', count: 2, color: 'blue' }], countText: '5' }] },
    ])
    const [s0, s1] = computeStates(p)
    expect(ids(B(s1!), 1)).toEqual(ids(B(s0!), 1))
    expect(B(s1!).slotStates[0]!.segs.map((g) => g.color)).toEqual(['#f2994a', '#2f6feb'])
    expect(B(s1!).slotStates[0]!.countText).toBe('5')
    expect(B(s0!).slotStates[0]!.countText).toBeNull() // 前一步的快照没被改
  })

  it('slots 省略 / "all" = 全部，并把默认填充（新增份用）改成这个；区间 fill 不改默认', () => {
    const s = run([
      { do: 'fill', target: 'b', segments: [five] },
      { do: 'fill', target: 'b', slots: [1, 1], segments: [] },
    ])
    expect(B(s).defaultFill).toEqual([five])
    expect(B(s).slotStates.map((x) => x.segs.length)).toEqual([0, 1, 1, 1])
  })

  it('segments: [] 清空；countText 覆盖自动数字；下一次不写 countText 就恢复自动', () => {
    const p = mk([
      { title: 'a', actions: [{ do: 'fill', target: 'b', slots: [2, 2], segments: [], countText: '0' }] },
      { title: 'b', actions: [{ do: 'fill', target: 'b', slots: [2, 2], segments: [ball3] }] },
    ])
    const [s0, s1] = computeStates(p)
    expect(B(s0!).slotStates[1]).toMatchObject({ segs: [], countText: '0' })
    expect(B(s1!).slotStates[1]!.countText).toBeNull()
  })

  it('block：id 也稳定，文字可原地改变', () => {
    const p = mk([
      { title: 'a', actions: [{ do: 'fill', target: 'b', segments: [{ kind: 'block', text: '28元' }] }] },
      { title: 'b', actions: [{ do: 'fill', target: 'b', segments: [{ kind: 'block', text: '30元', height: 2 }] }] },
    ])
    const [s0, s1] = computeStates(p)
    expect(ids(B(s1!), 1)).toEqual(ids(B(s0!), 1))
    expect(B(s1!).slotStates[0]!.segs[0]).toMatchObject({ shape: 'block', text: '30元', height: 2 })
  })
})

describe('自动数字标签 autoCountText', () => {
  const seg = (o: Partial<SegState> & { n?: number }): SegState => ({ shape: 'ball', color: '#000000', ids: Array.from({ length: o.n ?? 0 }, (_, i) => `x${i}`), ...o })
  it('单个 token 段 = 数量；单个 block = 文字', () => {
    expect(autoCountText([seg({ n: 3 })])).toBe('3')
    expect(autoCountText([seg({ n: 3, name: '桃' })])).toBe('3')
    expect(autoCountText([seg({ shape: 'block', text: '28元', ids: ['b'] })])).toBe('28元')
  })
  it('多段：count+name 拼接；block 拼 text；两个数字相连补 "+"；空 = ""', () => {
    expect(autoCountText([seg({ n: 5, name: '桃' }), seg({ n: 3, name: '瓜' })])).toBe('5桃3瓜')
    expect(autoCountText([seg({ shape: 'block', text: '玻', ids: ['a'] }), seg({ shape: 'block', text: '+10', ids: ['b'] })])).toBe('玻+10')
    expect(autoCountText([seg({ n: 3 }), seg({ n: 2 })])).toBe('3+2')
    expect(autoCountText([])).toBe('')
  })
})

describe('setSlots / show / 省略号', () => {
  it('normalizeShow：排序、合并相邻/重叠、裁剪；覆盖全部 = null', () => {
    expect(normalizeShow([[12, 13], [1, 3]], 13)).toEqual([[1, 3], [12, 13]])
    expect(normalizeShow([[1, 3], [4, 6]], 13)).toEqual([[1, 6]])
    expect(normalizeShow([[1, 5], [3, 8]], 13)).toEqual([[1, 8]])
    expect(normalizeShow([[1, 99]], 6)).toBeNull()
    expect(normalizeShow(undefined, 6)).toBeNull()
  })

  it('visibleEntries：区间不连续处出现一个 "…"（占一个份的位置）；首尾不加', () => {
    const e = visibleEntries(13, [[1, 3], [12, 13]])
    expect(e.map((x) => (x.kind === 'slot' ? x.index : '…'))).toEqual([1, 2, 3, '…', 12, 13])
    const e2 = visibleEntries(100, [[1, 1], [50, 51], [100, 100]])
    expect(e2.map((x) => (x.kind === 'slot' ? x.index : '…'))).toEqual([1, '…', 50, 51, '…', 100])
    expect(visibleEntries(3, undefined).map((x) => x.kind)).toEqual(['slot', 'slot', 'slot'])
    expect(visibleSlots(13, [[1, 3], [12, 13]])).toEqual([1, 2, 3, 12, 13])
    expect(visibleEntries(10, [[3, 5]]).map((x) => (x.kind === 'slot' ? x.index : '…'))).toEqual([3, 4, 5])
  })

  it('份数可以很大（100），内部状态完整，但布局只有可见的几份', () => {
    const s = run([], [benchDef({ slots: 100, show: [[1, 3], [99, 100]] })])
    const b = B(s)
    expect(b.slotStates).toHaveLength(100)
    const lay = layoutBench(b)
    expect(lay.entries).toHaveLength(6)
    expect(lay.slots.map((x) => x.index)).toEqual([1, 2, 3, 99, 100])
    expect(lay.items).toHaveLength(15) // 只有可见份里的 token
  })

  it('箱子里的球抬到前壁上沿之上（不被前壁挡成小红点）；板凳 / 盘子 / 小人的 token 仍从 0 起', () => {
    const lowest = (container: string) => {
      const lay = layoutBench(B(run([], [benchDef({ container, slots: 2, fill: [{ kind: 'token', shape: 'ball', count: 1, color: 'red' }, { kind: 'token', shape: 'ball', count: 3, color: 'white' }] })])))
      return Math.min(...lay.items.map((i) => i.y - i.h / 2))
    }
    expect(lowest('box')).toBeCloseTo(TOKEN_BASE.box, 9)
    // 球心在箱子前壁上沿之上：至少一半露在外面
    expect(TOKEN_BASE.box + 0.3 / 2).toBeGreaterThan(CONTAINER_TOP.box)
    for (const c of ['seat', 'plate', 'person', 'none']) expect(lowest(c)).toBeCloseTo(0, 9)
  })

  it('setSlots 增加：新份用默认填充，新 id，旧 id 不变；减少：删掉末尾，指向被删份的 brace/divider 一并去掉', () => {
    const p = mk([
      { title: 'a', actions: [{ do: 'brace', target: 'b', slots: [1, 4], text: 'x' }, { do: 'divider', target: 'b', after: 1 }, { do: 'divider', target: 'b', after: 3 }] },
      { title: 'b', actions: [{ do: 'setSlots', target: 'b', slots: 6 }] },
      { title: 'c', actions: [{ do: 'setSlots', target: 'b', slots: 2 }] },
    ])
    const [, s1, s2] = computeStates(p)
    const b1 = B(s1!)
    expect(b1.slots).toBe(6)
    expect(ids(b1, 5)).toEqual(['t12', 't13', 't14'])
    expect(ids(b1, 6)).toEqual(['t15', 't16', 't17'])
    expect(ids(b1, 1)).toEqual(['t0', 't1', 't2'])
    const b2 = B(s2!)
    expect(b2.slots).toBe(2)
    expect(b2.slotStates).toHaveLength(2)
    expect(b2.braces).toEqual([])
    expect(b2.dividers.map((d) => d.after)).toEqual([1])
  })

  it('setSlots 的 show：改显示区间；省略 show = 全部显示', () => {
    const p = mk([
      { title: 'a', actions: [{ do: 'setSlots', target: 'b', slots: 30, show: [[1, 2], [29, 30]] }] },
      { title: 'b', actions: [{ do: 'setSlots', target: 'b', slots: 5 }] },
    ])
    const [s0, s1] = computeStates(p)
    expect(B(s0!).show).toEqual([[1, 2], [29, 30]])
    expect(B(s1!).show).toBeNull()
  })

  it('行变长 / 变短时份的位置随之变化（整排以份区域中心对齐）', () => {
    const p = mk([{ title: 'a', actions: [{ do: 'setSlots', target: 'b', slots: 3 }] }])
    const xs = (b: BenchState) => layoutBench(b).slots.map((x) => x.x)
    const [s0] = computeStates(p)
    expect(xs(initialBench(benchDef() as never))).toEqual([-1.95, -0.65, 0.65, 1.95].map((v) => expect.closeTo(v, 9)))
    expect(xs(B(s0!))).toEqual([-1.3, 0, 1.3].map((v) => expect.closeTo(v, 9)))
  })
})

describe('mark / unmark / clear', () => {
  const marked = [
    { do: 'mark', target: 'b', slots: [1, 2], style: 'highlight', color: 'red' },
    { do: 'mark', target: 'b', slots: [2, 3], style: 'cross' },
    { do: 'mark', target: 'b', slots: [4, 4], style: 'ghost' },
    { do: 'mark', target: 'b', slots: [4, 4], style: 'dim' },
  ]
  it('mark 写入各份；同一份可叠加不同样式；color 规范成 #rrggbb', () => {
    const b = B(run(marked))
    expect(b.slotStates[0]!.marks).toEqual({ highlight: { color: '#e5484d' } })
    expect(b.slotStates[1]!.marks).toEqual({ highlight: { color: '#e5484d' }, cross: { color: null } })
    expect(b.slotStates[3]!.marks).toEqual({ ghost: { color: null }, dim: { color: null } })
  })
  it('unmark 去掉区间内全部标记；省略 slots = 全部；clear 对 Bench = 清 mark', () => {
    const b1 = B(run([...marked, { do: 'unmark', target: 'b', slots: [2, 4] }]))
    expect(b1.slotStates.map((s) => Object.keys(s.marks).length)).toEqual([1, 0, 0, 0])
    expect(B(run([...marked, { do: 'unmark', target: 'b' }])).slotStates.every((s) => Object.keys(s.marks).length === 0)).toBe(true)
    const withNotes = B(run([...marked, { do: 'brace', target: 'b', slots: [1, 2], text: 'x' }, { do: 'clear', target: 'b' }]))
    expect(withNotes.slotStates.every((s) => Object.keys(s.marks).length === 0)).toBe(true)
    expect(withNotes.braces).toHaveLength(1) // clear 不动 brace / divider
  })
  it('布局里体现：highlight 改 token 颜色，ghost 出虚线描边颜色，cross / dim 标在份上', () => {
    const lay = layoutBench(B(run(marked)))
    const slot = (i: number) => lay.slots.find((x) => x.index === i)!
    expect(slot(1).highlight).toBe('#e5484d')
    expect(slot(2).cross).toBe('#e5484d')
    expect(slot(4).dim).toBe(true)
    expect(lay.items.filter((i) => i.slot === 1).every((i) => i.color === '#e5484d')).toBe(true)
    expect(lay.items.filter((i) => i.slot === 4).every((i) => i.ghost !== null && i.dim)).toBe(true)
    expect(lay.items.filter((i) => i.slot === 3).every((i) => i.ghost === null && !i.dim)).toBe(true)
  })
})

describe('remainder', () => {
  const rem = (type: string, n: number) => ({ do: 'remainder', target: 'b', value: { type, text: `${type}${n}`, items: [{ kind: 'token', shape: 'ball', count: n }] } })
  it('设置 / 改写（沿用 token id）/ 清除', () => {
    const p = mk([{ title: 'a', actions: [rem('extra', 16)] }, { title: 'b', actions: [rem('short', 10)] }, { title: 'c', actions: [{ do: 'remainder', target: 'b', value: null }] }])
    const [s0, s1, s2] = computeStates(p)
    expect(B(s0!).remainder!.segs[0]!.ids).toHaveLength(16)
    expect(B(s1!).remainder!.type).toBe('short')
    expect(B(s1!).remainder!.segs[0]!.ids).toEqual(B(s0!).remainder!.segs[0]!.ids.slice(0, 10))
    expect(B(s2!).remainder).toBeNull()
  })
  it('布局：extra 实体、short 全是虚影（红色虚线）；16 个排成 4×4 小方阵，文字在堆上方；位置在行尾', () => {
    const lay = layoutBench(B(run([rem('extra', 16)])))
    const heap = lay.items.filter((i) => i.slot === 0)
    expect(heap).toHaveLength(16)
    expect(heap.every((i) => i.ghost === null)).toBe(true)
    expect(new Set(heap.map((i) => i.x)).size).toBe(4)
    expect(new Set(heap.map((i) => i.y)).size).toBe(4)
    expect(Math.min(...heap.map((i) => i.x))).toBeGreaterThan(lay.xR)
    expect(lay.remainder!.y).toBeGreaterThan(Math.max(...heap.map((i) => i.y)))
    const shortLay = layoutBench(B(run([rem('short', 10)])))
    expect(shortLay.items.filter((i) => i.slot === 0).every((i) => i.ghost === '#e5484d')).toBe(true)
    // 没有 items 的 remainder 只有文字
    const textOnly = layoutBench(B(run([{ do: 'remainder', target: 'b', value: { type: 'short', text: '少一点' } }])))
    expect(textOnly.items.filter((i) => i.slot === 0)).toHaveLength(0)
    expect(textOnly.remainder!.text).toBe('少一点')
  })
  it('行尾文字比那堆东西还宽时整堆往右让：文字左缘不压住最后一份的数字；短文字不变', () => {
    const textAt = (text: string) => layoutBench(B(run([{ do: 'remainder', target: 'b', value: { type: 'extra', text } }]))).remainder!
    const short = textAt('多')
    const long = textAt('共☆−24×2共☆−24×2')
    expect(short.x).toBeCloseTo(layoutBench(B(run([]))).xR + 0.3 + 0.5, 9) // 短文字：还是按原来最小宽度 1.0 排
    expect(long.x).toBeGreaterThan(short.x)
    expect(long.x - remainderTextWidth('共☆−24×2共☆−24×2') / 2).toBeCloseTo(layoutBench(B(run([]))).xR + 0.3, 9) // 文字左缘贴着最后一份右边 0.3
    // 包围盒要装得下
    const lay = layoutBench(B(run([{ do: 'remainder', target: 'b', value: { type: 'extra', text: '共☆−24×2共☆−24×2' } }])))
    expect(lay.bounds.max[0]).toBeGreaterThanOrEqual(long.x + remainderTextWidth('共☆−24×2共☆−24×2') / 2 - 1e-9)
  })
})

describe('transfer', () => {
  const boats = [benchDef({ slots: 4, fill: [{ kind: 'token', shape: 'person', count: 3 }] })]
  const tr = (o: object) => ({ do: 'transfer', target: 'b', from: [1, 2], to: [3, 4], count: 1, ...o })

  it('token 保持 id，从 from 每份拿 count 个，一一对应放到 to 的份里；来源/目标的自动数字更新', () => {
    const p = mk([{ title: 'a', actions: [tr({})] }], boats)
    const before = initialState(p).objects['b']!.bench!
    const b = B(computeStates(p)[0]!)
    // 取的是每份最上面的那个 token
    expect(ids(b, 1)).toEqual(['t0', 't1'])
    expect(ids(b, 2)).toEqual(['t3', 't4'])
    expect(ids(b, 3)).toEqual(['t6', 't7', 't8', 't2'])
    expect(ids(b, 4)).toEqual(['t9', 't10', 't11', 't5'])
    // 全部 id 不多不少、没有变化
    expect([...allIds(b)].sort()).toEqual([...allIds(before)].sort())
    expect(layoutBench(b).slots.map((s) => s.count)).toEqual(['2', '2', '4', '4'])
  })

  it('布局里同一个 id 的位置从一份移到另一份（渲染层按 id 做 key，阻尼插值即"飞过去"）', () => {
    const p = mk([{ title: 'a' }, { title: 'b', actions: [tr({ from: [1, 1], to: [4, 4] })] }], boats)
    const [s0, s1] = computeStates(p)
    const pos = (s: SceneState) => layoutBench(B(s)).items.find((i) => i.id === 't2')!
    expect(pos(s0!).slot).toBe(1)
    expect(pos(s1!).slot).toBe(4)
    expect(pos(s1!).x).toBeGreaterThan(pos(s0!).x)
  })

  it('目标份里已有同类段则并入，否则新开一段；多次搬运保持守恒', () => {
    const objs = [benchDef({ slots: 2, fill: [{ kind: 'token', shape: 'person', count: 4 }] })]
    const p = mk([
      { title: 'a', actions: [{ do: 'fill', target: 'b', slots: [2, 2], segments: [{ kind: 'token', shape: 'person', count: 2, color: 'red' }] }, tr({ from: [1, 1], to: [2, 2] })] },
      { title: 'b', actions: [tr({ from: [2, 2], to: [1, 1], segment: 1 })] },
    ], objs)
    const [s0, s1] = computeStates(p)
    expect(B(s0!).slotStates[1]!.segs.map((g) => g.ids.length)).toEqual([2, 1]) // 颜色不同 → 新段
    expect(B(s1!).slotStates[1]!.segs.map((g) => g.ids.length)).toEqual([2])
    expect(ids(B(s1!), 1)).toHaveLength(4)
  })

  it('来源段被搬空时，这一段消失', () => {
    const objs = [benchDef({ slots: 2, fill: [{ kind: 'token', shape: 'person', count: 1 }] })]
    const b = B(run([tr({ from: [1, 1], to: [2, 2] })], objs))
    expect(b.slotStates[0]!.segs).toEqual([])
    expect(ids(b, 2)).toHaveLength(2)
  })
})

describe('brace / divider / clearNotes', () => {
  const big = [benchDef({ slots: 13, show: [[1, 3], [12, 13]] })]
  it('brace：区间跨越"…"时按可见部分的首尾画；同样的 brace 不重复', () => {
    const s = run([{ do: 'brace', target: 'b', slots: [1, 13], text: '13人' }, { do: 'brace', target: 'b', slots: [1, 13], text: '13人' }, { do: 'brace', target: 'b', slots: [2, 12], text: 'x', side: 'above' }], big)
    expect(B(s).braces).toHaveLength(2)
    const lay = layoutBench(B(s))
    expect(lay.braces).toHaveLength(2)
    const below = lay.braces.find((x) => x.side === 'below')!
    expect(below.x0).toBeCloseTo(-3.75, 9) // 第 1 份左缘
    expect(below.x1).toBeCloseTo(3.75, 9) // 第 13 份右缘
    const above = lay.braces.find((x) => x.side === 'above')!
    expect(above.x0).toBeCloseTo(-1.95 - 0.5, 9) // 可见的第 2 份
    expect(above.x1).toBeCloseTo(1.95 + 0.5, 9) // 可见的第 12 份
    expect(above.y).toBeGreaterThan(below.y)
  })
  it('divider：画在第 k 份之后；k 被省略但 k+1 可见时落在 k+1 的左缘；同一个 after 后写的覆盖', () => {
    const s = run([{ do: 'divider', target: 'b', after: 3, text: '准时' }, { do: 'divider', target: 'b', after: 11 }, { do: 'divider', target: 'b', after: 3, text: '新' }], big)
    const lay = layoutBench(B(s))
    expect(lay.dividers.map((d) => d.text)).toEqual([null, '新']) // 顺序：11, 3（后写的覆盖并移到最后）
    const x = (after: number) => lay.dividers.find((d) => d.key === `d${after}`)!.x
    expect(x(3)).toBeCloseTo(0, 9) // 第 3 份右缘（也就是 "…" 的左缘）
    expect(x(11)).toBeCloseTo(1.3, 9) // 第 12 份左缘
    // after=7：第 7、8 份都在 "…" 里 → 不再允许（线会画在 "…" 正中）
    expect(() => run([{ do: 'divider', target: 'b', after: 7 }], big)).toThrow(/after=7.*省略号/)
  })
  it('divider 文字紧贴行尾“多 / 少”文字时线加高一截（文字不互压）；离得远 / 没文字 / 没行尾时不变', () => {
    const rem = { do: 'remainder', target: 'b', value: { type: 'short', text: '少480米' } }
    const y1 = (actions: unknown[], after: number) => layoutBench(B(run(actions, big))).dividers.find((d) => d.key === `d${after}`)!.y1
    const base = y1([{ do: 'divider', target: 'b', after: 13, text: '准时到校' }], 13) // 没有行尾：原高度
    // 贴着行尾 + 有文字：抬高
    expect(y1([rem, { do: 'divider', target: 'b', after: 13, text: '准时到校' }], 13)).toBeCloseTo(base + DIVIDER_LIFT, 9)
    // 贴着行尾但没文字：不抬
    expect(y1([rem, { do: 'divider', target: 'b', after: 13 }], 13)).toBeCloseTo(base, 9)
    // 离行尾远（第 3 份之后，与行尾水平距离 > DIVIDER_REMAINDER_CLEAR）：不抬
    expect(y1([rem, { do: 'divider', target: 'b', after: 3, text: '准时到校' }], 3)).toBeCloseTo(base, 9)
    // 包围盒把抬高后的文字算进去
    const lay = layoutBench(B(run([rem, { do: 'divider', target: 'b', after: 13, text: '准时到校' }], big)))
    expect(lay.bounds.max[1]).toBeGreaterThanOrEqual(lay.dividers[0]!.y1 + 0.3 - 1e-9)
  })
  it('clearNotes 清掉 brace 和 divider，不动 mark', () => {
    const b = B(run([{ do: 'mark', target: 'b', slots: [1, 1], style: 'dim' }, { do: 'brace', target: 'b', slots: [1, 2], text: 'x' }, { do: 'divider', target: 'b', after: 1 }, { do: 'clearNotes', target: 'b' }], big))
    expect(b.braces).toEqual([])
    expect(b.dividers).toEqual([])
    expect(b.slotStates[0]!.marks.dim).toBeDefined()
  })
  it('bracePoints：左右对称，两端朝向份；below / above 上下镜像', () => {
    const below = bracePoints(4, 'below')
    expect(below).toHaveLength(4 * 9)
    expect(below[0]![0]).toBeCloseTo(-2, 9)
    expect(below.at(-1)![0]).toBeCloseTo(2, 9)
    expect(below[0]![1]).toBeCloseTo(below.at(-1)![1], 9)
    expect(below[0]![1]).toBeGreaterThan(0) // 两端翘向上（份在上面）
    expect(Math.min(...below.map((p) => p[1]))).toBeLessThan(0) // 中间尖向下
    const above = bracePoints(4, 'above')
    expect(above.map((p) => p[1])).toEqual(below.map((p) => -p[1]))
  })
})

describe('通用动作 show / hide / move / reset / clear 对 Bench、Arrow', () => {
  const objs = [benchDef({ visible: false, position: [1, 2, 3] }), { id: 'a', type: 'Arrow', from: [0, 0, 0], to: [0, 2, 0], text: '差', visible: false }]
  it('show / hide / move', () => {
    const p = mk([
      { title: 'a', actions: [{ do: 'show', target: 'b' }, { do: 'show', target: 'a' }, { do: 'move', target: 'b', position: [0, 5, 0] }] },
      { title: 'b', actions: [{ do: 'hide', target: 'a' }] },
    ], objs)
    const [s0, s1] = computeStates(p)
    expect(s0!.objects['b']).toMatchObject({ visible: true, position: [0, 5, 0] })
    expect(s0!.objects['a']!.visible).toBe(true)
    expect(s1!.objects['a']!.visible).toBe(false)
  })
  it('Arrow：起点 = position，move 时终点跟着平移；setText 改文字；clear 是空操作', () => {
    const s = run([{ do: 'move', target: 'a', position: [1, 1, 0] }, { do: 'setText', target: 'a', text: '新' }, { do: 'clear', target: 'a' }], objs)
    expect(s.objects['a']).toMatchObject({ position: [1, 1, 0], text: '新', arrow: { to: [1, 3, 0] } })
  })
  it('reset：恢复初始定义（含 token）；token id 计数器不回退，之后新生成的 id 不会与旧 id 撞车', () => {
    const p = mk([
      { title: 'a', actions: [{ do: 'fill', target: 'b', segments: [{ kind: 'token', shape: 'ball', count: 5 }] }, { do: 'mark', target: 'b', slots: [1, 1], style: 'dim' }, { do: 'brace', target: 'b', slots: [1, 2], text: 'x' }, { do: 'move', target: 'a', position: [5, 5, 5] }] },
      { title: 'b', actions: [{ do: 'reset', target: 'b' }, { do: 'reset', target: 'a' }] },
      { title: 'c', actions: [{ do: 'fill', target: 'b', slots: [1, 1], segments: [{ kind: 'token', shape: 'cube', count: 2 }] }] },
    ], [benchDef(), objs[1]])
    const [s0, s1, s2] = computeStates(p)
    expect(B(s0!).slotStates[0]!.segs[0]!.ids).toHaveLength(5)
    expect(ids(B(s1!), 1)).toEqual(['t0', 't1', 't2'])
    expect(B(s1!).braces).toEqual([])
    expect(B(s1!).slotStates[0]!.marks).toEqual({})
    expect(s1!.objects['a']).toMatchObject({ position: [0, 0, 0], arrow: { to: [0, 2, 0] }, visible: false })
    expect(B(s1!).nextId).toBe(B(s0!).nextId)
    // reset 之后新生成的 token id 没有出现在此前任何一步里
    const seen = new Set([...allIds(B(s0!))])
    expect(ids(B(s2!), 1).every((id) => !seen.has(id) || ['t0', 't1', 't2'].includes(id))).toBe(true)
    expect(ids(B(s2!), 1)).toEqual(['t20', 't21'])
  })
})

describe('sceneRadius 计入 Bench / Arrow', () => {
  it('Bench 变长、出现行尾多少、Arrow 出现 → 半径变大；隐藏 → 0', () => {
    const p = mk([
      { title: 'a' },
      { title: 'b', actions: [{ do: 'setSlots', target: 'b', slots: 8 }] },
      { title: 'c', actions: [{ do: 'remainder', target: 'b', value: { type: 'extra', text: '多', items: [{ kind: 'token', shape: 'ball', count: 16 }] } }] },
      { title: 'd', actions: [{ do: 'show', target: 'a' }] },
      { title: 'e', actions: [{ do: 'hide', target: 'a' }, { do: 'hide', target: 'b' }] },
    ], [benchDef(), { id: 'a', type: 'Arrow', from: [0, 0, 0], to: [20, 0, 0], visible: false }])
    const r = computeStates(p).map(sceneRadius)
    expect(r[0]).toBeGreaterThan(0)
    expect(r[1]).toBeGreaterThan(r[0]!)
    expect(r[2]).toBeGreaterThan(r[1]!)
    expect(r[3]).toBeGreaterThan(r[2]!)
    expect(r[4]).toBe(0)
  })
})

// ---------- 校验报错 ----------
const prob = (steps: unknown[], objects: unknown[] = [benchDef(), { id: 'g', type: 'CubeGrid', size: [2, 2, 2] }]) => ({
  id: 'x',
  title: 'x',
  problem: 'p',
  scene: { objects },
  steps,
})
const err = (actions: unknown[], objects?: unknown[]) => {
  const r = validateProblemData('a.json', prob([{ title: 's1' }, { title: 's2', actions }], objects))
  expect(r.errors.length).toBeGreaterThan(0)
  return r.errors[0]!
}

describe('Bench 动作的语义校验（文件 / 第几步 / 字段 / 原因）', () => {
  it('份下标越界 / 从 0 起 / from>to', () => {
    const e1 = err([{ do: 'mark', target: 'b', slots: [3, 5], style: 'dim' }])
    expect(e1).toMatchObject({ file: 'a.json', step: 1, field: 'actions[0].slots' })
    expect(e1.message).toMatch(/超出范围.*只有 4 份/)
    expect(err([{ do: 'mark', target: 'b', slots: [0, 2], style: 'dim' }]).message).toMatch(/从 1 起/)
    expect(err([{ do: 'unmark', target: 'b', slots: [3, 2] }]).message).toMatch(/起点不能比终点大/)
    expect(err([{ do: 'fill', target: 'b', slots: [1, 9], segments: [] }])).toMatchObject({ field: 'actions[0].slots' })
    expect(err([{ do: 'brace', target: 'b', slots: [2, 9], text: 'x' }])).toMatchObject({ field: 'actions[0].slots' })
  })

  it('fill：count 超过 12 / 一份东西太多', () => {
    const e = err([{ do: 'fill', target: 'b', segments: [{ kind: 'token', shape: 'ball', count: 13 }] }])
    expect(e.field).toBe('actions[0].segments[0].count')
    expect(e.message).toMatch(/最多 12.*block/)
    const e2 = err([{ do: 'fill', target: 'b', segments: [{ kind: 'token', shape: 'ball', count: 12 }, { kind: 'token', shape: 'cube', count: 12 }, { kind: 'token', shape: 'cup', count: 1 }] }])
    expect(e2.field).toBe('actions[0].segments')
    expect(e2.message).toMatch(/25/)
  })

  it('transfer：份数对不上 / 区间重叠 / 不够拿 / 没有这一段 / block 不能搬', () => {
    const e1 = err([{ do: 'transfer', target: 'b', from: [1, 2], to: [3, 3], count: 1 }])
    expect(e1).toMatchObject({ step: 1, field: 'actions[0].to' })
    expect(e1.message).toMatch(/from.*2 份.*to.*1 份/)
    expect(err([{ do: 'transfer', target: 'b', from: [1, 2], to: [2, 3], count: 1 }]).message).toMatch(/重叠/)
    const e3 = err([{ do: 'transfer', target: 'b', from: [1, 1], to: [2, 2], count: 4 }])
    expect(e3).toMatchObject({ field: 'actions[0].count' })
    expect(e3.message).toMatch(/第 1 份.*只有 3 个.*不够拿 4 个/)
    expect(err([{ do: 'transfer', target: 'b', from: [1, 1], to: [2, 2], count: 1, segment: 2 }])).toMatchObject({ field: 'actions[0].segment' })
    expect(err([{ do: 'transfer', target: 'b', from: [1, 1], to: [2, 2], count: 1 }], [benchDef({ fill: [{ kind: 'block', text: '5' }] })]).message).toMatch(/block/)
    expect(err([{ do: 'transfer', target: 'b', from: [1, 1], to: [5, 5], count: 1 }]).field).toBe('actions[0].to')
  })

  it('transfer：搬完目标份会超过上限也报错', () => {
    const e = err([{ do: 'transfer', target: 'b', from: [1, 1], to: [2, 2], count: 3 }], [benchDef({ slots: 2, fill: [{ kind: 'token', shape: 'ball', count: 12 }, { kind: 'token', shape: 'cube', count: 10 }] })])
    expect(e.message).toMatch(/上限 24/)
  })

  it('brace：区间都被省略号藏起来了；divider：after 越界', () => {
    const objs = [benchDef({ slots: 13, show: [[1, 3], [12, 13]] })]
    const e = err([{ do: 'brace', target: 'b', slots: [5, 10], text: 'x' }], objs)
    expect(e).toMatchObject({ step: 1, field: 'actions[0].slots' })
    expect(e.message).toMatch(/省略号/)
    expect(err([{ do: 'divider', target: 'b', after: 14 }], objs)).toMatchObject({ field: 'actions[0].after' })
    expect(err([{ do: 'divider', target: 'b', after: 0 }], objs).message).toMatch(/after=0/)
  })

  describe('mark / divider / setSlots：桌面和窄屏下都要能看到', () => {
    // 桌面显示 1~3、12~13；窄屏显示 1、13
    const objs = [benchDef({ slots: 13, show: [[1, 3], [12, 13]], compactShow: [[1, 1], [13, 13]] })]
    const ok = (actions: unknown[]) => expect(validateProblemData('a.json', prob([{ title: 's1' }, { title: 's2', actions }], objs)).errors).toEqual([])

    it('mark：整段都被省略号藏起来 → 报错；区分桌面 / 窄屏', () => {
      const desktop = err([{ do: 'mark', target: 'b', slots: [5, 10], style: 'cross' }], objs)
      expect(desktop).toMatchObject({ step: 1, field: 'actions[0].slots' })
      expect(desktop.message).toMatch(/省略号/)
      expect(desktop.message).not.toMatch(/窄屏/)
      const compact = err([{ do: 'mark', target: 'b', slots: [2, 3], style: 'ghost' }], objs) // 桌面看得见，窄屏看不见
      expect(compact).toMatchObject({ step: 1, field: 'actions[0].slots' })
      expect(compact.message).toMatch(/窄屏.*compactShow/)
      expect(compact.message).toMatch(/ghost/)
      ok([{ do: 'mark', target: 'b', slots: [1, 1], style: 'cross' }, { do: 'mark', target: 'b', slots: [2, 13], style: 'dim' }, { do: 'mark', target: 'b', slots: [13, 13], style: 'highlight' }])
    })
    it('mark：没写 compactShow 的 Bench 只检查桌面 show', () => {
      const plain = [benchDef({ slots: 13, show: [[1, 3], [12, 13]] })]
      expect(validateProblemData('a.json', prob([{ title: 's', actions: [{ do: 'mark', target: 'b', slots: [2, 3], style: 'dim' }] }], plain)).errors).toEqual([])
      expect(validateProblemData('a.json', prob([{ title: 's', actions: [{ do: 'mark', target: 'b', slots: [5, 6], style: 'dim' }] }], plain)).errors[0]).toMatchObject({ field: 'actions[0].slots' })
    })
    it('divider：after 和 after+1 在某种显示下都被省略 → 报错；一侧可见即可', () => {
      const desktop = err([{ do: 'divider', target: 'b', after: 7 }], objs)
      expect(desktop).toMatchObject({ step: 1, field: 'actions[0].after' })
      expect(desktop.message).toMatch(/after=7.*省略号/)
      expect(desktop.message).not.toMatch(/窄屏/)
      const compact = err([{ do: 'divider', target: 'b', after: 3 }], objs) // 桌面：3 可见；窄屏：3、4 都藏起来
      expect(compact).toMatchObject({ step: 1, field: 'actions[0].after' })
      expect(compact.message).toMatch(/窄屏.*compactShow/)
      ok([{ do: 'divider', target: 'b', after: 1 }, { do: 'divider', target: 'b', after: 12, text: 'x' }, { do: 'divider', target: 'b', after: 13 }])
    })
    it('setSlots：留下的大括号 / 竖线在新的 show 或 compactShow 下一份都看不到 → 报错（提示 clearNotes）', () => {
      const check = (notes: unknown[], setSlots: object, withClear = false) =>
        validateProblemData(
          'a.json',
          prob([{ title: 'n', actions: notes }, { title: 'set', actions: [...(withClear ? [{ do: 'clearNotes', target: 'b' }] : []), { do: 'setSlots', target: 'b', slots: 13, ...setSlots }] }], objs),
        )
      const brace = [{ do: 'brace', target: 'b', slots: [1, 3], text: 'x' }]
      const div = [{ do: 'divider', target: 'b', after: 1 }]
      const sameShow = { show: [[1, 3], [12, 13]], compactShow: [[1, 3], [13, 13]] }
      expect(check(brace, sameShow).errors).toEqual([]) // 仍然都能看到
      expect(check(div, { show: [[1, 3], [12, 13]], compactShow: [[1, 4], [13, 13]] }).errors).toEqual([])
      // 桌面 show 把大括号的 1~3 全藏了
      const e1 = check(brace, { show: [[10, 13]] }).errors[0]!
      expect(e1).toMatchObject({ step: 1, field: 'actions[0].show' })
      expect(e1.message).toMatch(/已有的大括号 \[1, 3\].*clearNotes/)
      // 窄屏 compactShow 把大括号藏了（桌面还能看到）
      const e2 = check(brace, { show: [[1, 3], [12, 13]], compactShow: [[12, 13]] }).errors[0]!
      expect(e2).toMatchObject({ step: 1, field: 'actions[0].compactShow' })
      expect(e2.message).toMatch(/窄屏.*clearNotes/)
      // 竖线：after=1 在新 show 下第 1、2 份都藏了
      const e3 = check(div, { show: [[3, 13]] }).errors[0]!
      expect(e3).toMatchObject({ step: 1, field: 'actions[0].show' })
      expect(e3.message).toMatch(/after=1.*clearNotes/)
      // 没写 compactShow = 窄屏跟新 show 一样，不再沿用旧 compactShow
      expect(check(brace, { show: [[1, 3], [12, 13]] }).errors).toEqual([])
      // 先 clearNotes 再 setSlots：通过
      expect(check(brace, { show: [[10, 13]] }, true).errors).toEqual([])
      // 被 setSlots 删掉的份上的大括号 / 竖线按原来的规则直接去掉，不报错
      const shrink = validateProblemData('a.json', prob([{ title: 'n', actions: [...brace, ...div] }, { title: 'set', actions: [{ do: 'setSlots', target: 'b', slots: 2 }] }], objs))
      expect(shrink.errors).toEqual([])
    })
  })

  it('show / compactShow 写满 [[1, slots]] 且太多：按“写了”报「缩小显示区间」，不再误报成“加 show”', () => {
    const e = objErr2(benchDef({ slots: 30, show: [[1, 3], [29, 30]], compactShow: [[1, 30]] }))
    expect(e).toMatchObject({ field: 'scene.objects[0].compactShow' })
    expect(e.message).toMatch(/compactShow 一共显示 30 份/)
    expect(e.message).not.toMatch(/加 show/)
    const s = objErr2(benchDef({ slots: 30, show: [[1, 30]] }))
    expect(s.message).toMatch(/show 一共显示 30 份/)
    // 真的没写 show：仍提示“加 show”
    expect(objErr2(benchDef({ slots: 30 })).message).toMatch(/加 show/)
    expect(err([{ do: 'setSlots', target: 'b', slots: 30, show: [[1, 3], [29, 30]], compactShow: [[1, 30]] }]).message).toMatch(/compactShow 一共显示 30 份/)
  })

  it('setSlots：show 越界 / 没写 show 但份数太多', () => {
    expect(err([{ do: 'setSlots', target: 'b', slots: 10, show: [[1, 3], [9, 11]] }])).toMatchObject({ field: 'actions[0].show[1]' })
    const e = err([{ do: 'setSlots', target: 'b', slots: 100 }])
    expect(e).toMatchObject({ field: 'actions[0].show' })
    expect(e.message).toMatch(/show/)
    expect(err([{ do: 'setSlots', target: 'b', slots: 100, show: [[1, 30]] }]).message).toMatch(/太多/)
  })

  it('remainder：items 太多', () => {
    const e = err([{ do: 'remainder', target: 'b', value: { type: 'extra', text: 'x', items: [{ kind: 'token', shape: 'ball', count: 41 }] } }])
    expect(e.field).toMatch(/^actions\[0\]\.(value\.items|value\.items\[0\]\.count)/)
  })

  it('动作与对象类型不匹配：给出指向正确动作的提示', () => {
    const e1 = err([{ do: 'highlight', target: 'b' }])
    expect(e1).toMatchObject({ step: 1, field: 'actions[0].target' })
    expect(e1.message).toMatch(/只能用于 CubeGrid \/ CubeStack.*Bench.*mark/)
    expect(err([{ do: 'number', target: 'b' }]).message).toMatch(/mark/)
    expect(err([{ do: 'fade', target: 'b', opacity: 0.5 }]).message).toMatch(/Bench/)
    const e2 = err([{ do: 'fill', target: 'g', segments: [] }])
    expect(e2.message).toMatch(/只能用于 Bench.*CubeGrid/)
    expect(err([{ do: 'transfer', target: 'g', from: [1, 1], to: [2, 2], count: 1 }]).message).toMatch(/Bench/)
    expect(err([{ do: 'highlight', target: 'a' }], [{ id: 'a', type: 'Arrow', from: [0, 0, 0], to: [1, 0, 0] }]).message).toMatch(/Arrow/)
    expect(err([{ do: 'setText', target: 'b', text: 'x' }]).message).toMatch(/Label/)
  })

  it('target 不存在时列出现有对象', () => {
    expect(err([{ do: 'fill', target: 'bb', segments: [] }]).message).toMatch(/找不到对象 "bb".*b、g/)
  })
})

describe('Bench / Arrow 定义本身的校验', () => {
  const objErr = (o: object) => {
    const r = validateProblemData('a.json', prob([{ title: 's' }], [o]))
    expect(r.errors.length).toBeGreaterThan(0)
    return r.errors[0]!
  }
  it('show 越界 / 太多份同时显示', () => {
    expect(objErr(benchDef({ show: [[1, 2], [3, 9]] }))).toMatchObject({ file: 'a.json', field: 'scene.objects[0].show[1]' })
    const e = objErr(benchDef({ slots: 100 }))
    expect(e.field).toBe('scene.objects[0].show')
    expect(e.message).toMatch(new RegExp(`最多同时显示 ${MAX_VISIBLE} 份`))
    expect(objErr(benchDef({ slots: 100, show: [[1, 30]] })).message).toMatch(/太多/)
    expect(validateProblemData('a.json', prob([{ title: 's' }], [benchDef({ slots: 100, show: [[1, 3], [99, 100]] })])).errors).toEqual([])
  })
  it('fill / remainder 的数量上限', () => {
    expect(objErr(benchDef({ fill: [{ kind: 'token', shape: 'ball', count: 13 }] })).field).toBe('scene.objects[0].fill[0].count')
    expect(objErr(benchDef({ remainder: { type: 'extra', text: 'x', items: [{ kind: 'token', shape: 'ball', count: 41 }] } })).file).toBe('a.json')
  })
  it('schema 层：不认识的 shape / kind / style、颜色、拼错字段、缺字段', () => {
    expect(objErr(benchDef({ fill: [{ kind: 'token', shape: 'apple', count: 1 }] })).message).toMatch(/ball/)
    expect(objErr(benchDef({ fill: [{ kind: 'tokens', shape: 'ball', count: 1 }] })).message).toMatch(/token、block/)
    expect(objErr(benchDef({ fill: [{ kind: 'token', shape: 'ball', count: 1, color: 'blu' }] })).message).toMatch(/颜色不认识/)
    expect(objErr(benchDef({ contaner: 'seat' })).message).toMatch(/contaner/)
    expect(objErr(benchDef({ container: 'chair' })).field).toBe('scene.objects[0].container')
    expect(objErr({ id: 'b', type: 'Bench' }).field).toBe('scene.objects[0].slots')
    expect(objErr(benchDef({ slots: 0 })).field).toBe('scene.objects[0].slots')
    const r = validateProblemData('a.json', prob([{ title: 's', actions: [{ do: 'mark', target: 'b', slots: [1, 2], style: 'blink' }] }]))
    expect(r.errors[0]).toMatchObject({ step: 0, field: 'actions[0].style' })
    const r2 = validateProblemData('a.json', prob([{ title: 's', actions: [{ do: 'mark', target: 'b', slots: [1], style: 'dim' }] }]))
    expect(r2.errors[0]).toMatchObject({ step: 0, field: 'actions[0].slots' })
    expect(r2.errors[0]!.message).toMatch(/两个整数 \[起点, 终点\]/)
    const r3 = validateProblemData('a.json', prob([{ title: 's', actions: [{ do: 'brace', target: 'b', slots: [1, 2] }] }]))
    expect(r3.errors[0]).toMatchObject({ step: 0, field: 'actions[0].text' })
  })
  it('Arrow：from 与 to 不能重合；缺字段', () => {
    expect(objErr({ id: 'a', type: 'Arrow', from: [1, 1, 1], to: [1, 1, 1] }).field).toBe('scene.objects[0].to')
    expect(objErr({ id: 'a', type: 'Arrow', from: [1, 1, 1] }).field).toBe('scene.objects[0].to')
    expect(validateProblemData('a.json', prob([{ title: 's' }], [{ id: 'a', type: 'Arrow', from: [0, 0, 0], to: [1, 0, 0], text: '差', color: 'red' }])).errors).toEqual([])
  })
  it('Arrow：textAt / textSide 只认枚举值，拼错报在对应字段', () => {
    const a = (extra: object) => ({ id: 'a', type: 'Arrow', from: [0, 0, 0], to: [1, 0, 0], ...extra })
    expect(objErr(a({ textAt: 'middle' })).field).toBe('scene.objects[0].textAt')
    expect(objErr(a({ textSide: 'top' })).field).toBe('scene.objects[0].textSide')
    expect(objErr(a({ textSide: 'top' })).message).toMatch(/auto/)
    for (const textAt of ['start', 'mid', 'end']) for (const textSide of ['auto', 'left', 'right', 'above', 'below']) {
      expect(validateProblemData('a.json', prob([{ title: 's' }], [a({ textAt, textSide })])).errors).toEqual([])
    }
  })
  it('Arrow：textAt / textSide 进入状态，默认 mid / auto', () => {
    const s = run([], [{ id: 'a', type: 'Arrow', from: [0, 0, 0], to: [0, 2, 0] }, { id: 'c', type: 'Arrow', from: [0, 0, 0], to: [2, 0, 0], textAt: 'end', textSide: 'below' }])
    expect(s.objects['a']!.arrow).toMatchObject({ textAt: 'mid', textSide: 'auto' })
    expect(s.objects['c']!.arrow).toMatchObject({ textAt: 'end', textSide: 'below' })
  })
  it('未经 validateProblem 直接 computeStates 也不会静默生成废数据', () => {
    const p = mk([{ title: 's' }], [benchDef({ slots: 100 })])
    expect(() => computeStates(p)).toThrow(ProblemError)
  })
})

describe('题目分组：series / order / section', () => {
  const P = (id: string, extra: object = {}) => ProblemSchema.parse({ id, title: id, problem: 'p', scene: { objects: [] }, steps: [{ title: 's' }], ...extra })
  const list = [P('c', { series: 'B系列', order: 2 }), P('a', { series: 'A系列', order: 2 }), P('z'), P('b', { series: 'A系列', order: 1, section: '思维锦囊1' }), P('n', { series: 'A系列' }), P('y', { series: 'B系列', order: 1 })]

  it('按 series 分组（系列按名称、没有 series 的归"其他"排最后），组内按 order，没写 order 的最后', () => {
    const g = groupBySeries(list)
    expect(g.map((x) => x.name)).toEqual(['A系列', 'B系列', OTHER_SERIES])
    expect(g[0]!.problems.map((p) => p.id)).toEqual(['b', 'a', 'n'])
    expect(g[1]!.problems.map((p) => p.id)).toEqual(['y', 'c'])
    expect(g[2]!.problems.map((p) => p.id)).toEqual(['z'])
  })
  it('上一题 / 下一题只在同系列内', () => {
    expect(seriesNeighbors(list, 'b')).toMatchObject({ prev: null, next: { id: 'a' } })
    expect(seriesNeighbors(list, 'a')).toMatchObject({ prev: { id: 'b' }, next: { id: 'n' } })
    expect(seriesNeighbors(list, 'n')).toMatchObject({ prev: { id: 'a' }, next: null })
    expect(seriesNeighbors(list, 'z')).toEqual({ prev: null, next: null })
    expect(seriesNeighbors(list, 'nope')).toEqual({ prev: null, next: null })
  })
  it('schema：series / order / section 可选；类型不对会报字段', () => {
    expect(P('q', { series: 'S', order: 1.5, section: '小试牛刀1' }).order).toBe(1.5)
    const r = validateProblemData('a.json', { ...prob([{ title: 's' }]), order: 'first' })
    expect(r.errors[0]).toMatchObject({ field: 'order' })
  })
})

describe('样板题 yk-01-yeguo', () => {
  const p = ProblemSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../content/problems/yk-01-yeguo.json'), 'utf8')))
  const st = computeStates(p)

  it('系列信息', () => {
    expect(p).toMatchObject({ series: '三秋 S06 · 盈亏进阶', order: 1, section: '承前启后' })
  })
  it('13 人用 show [[1,3],[12,13]] 省略，只显示 5 份 + "…"', () => {
    const lay = layoutBench(B(st[1]!, 'r1'))
    expect(B(st[1]!, 'r1').slots).toBe(13)
    expect(lay.entries.map((e) => (e.kind === 'slot' ? e.index : '…'))).toEqual([1, 2, 3, '…', 12, 13])
  })
  it('① 行：每人 3 颗 + 多 16 颗；② 行：每人 5 颗，最后两人空着，少 10 颗（虚影）', () => {
    const r1 = B(st[1]!, 'r1')
    expect(r1.slotStates.every((s) => s.segs[0]!.ids.length === 3)).toBe(true)
    expect(r1.remainder).toMatchObject({ type: 'extra', text: '多16颗' })
    expect(r1.remainder!.segs[0]!.ids).toHaveLength(16)
    const r2 = B(st[2]!, 'r2')
    expect(r2.slotStates.slice(0, 11).every((s) => s.segs[0]!.ids.length === 5)).toBe(true)
    expect(r2.slotStates.slice(11).every((s) => s.segs.length === 0)).toBe(true)
    expect(r2.slotStates[11]!.marks.highlight).toBeDefined()
    expect(B(st[3]!, 'r2').remainder).toBeNull() // quiz 步：还没转化
    const short = layoutBench(B(st[4]!, 'r2'))
    expect(B(st[4]!, 'r2').remainder).toMatchObject({ type: 'short' })
    expect(short.items.filter((i) => i.slot === 0)).toHaveLength(10)
    expect(short.items.filter((i) => i.slot === 0).every((i) => i.ghost)).toBe(true)
  })
  it('第 3 步是 quiz，答案"少了"', () => {
    expect(p.steps[3]).toMatchObject({ type: 'quiz', answer: 1 })
    expect(p.steps[3]!.options![1]).toBe('少了')
  })
  it('每人差 2：② 行每份 3 + 2（蓝），数字仍显示 5，ball id 与上一步相同（原地变色）', () => {
    const before = B(st[4]!, 'r2')
    const after = B(st[5]!, 'r2')
    expect(ids(after, 1)).toEqual(ids(before, 1))
    expect(after.slotStates[0]!.segs.map((g) => g.ids.length)).toEqual([3, 2])
    expect(layoutBench(after).slots[0]!.count).toBe('5')
    expect(st[5]!.objects['a1']!.visible).toBe(true)
  })
  it('总差、13 人、55 颗：大括号与算式一致', () => {
    expect(st[6]!.objects['a2']!.visible).toBe(true)
    expect(B(st[7]!, 'r2').braces).toEqual([{ from: 1, to: 13, text: '13 人', side: 'below' }])
    expect(B(st[8]!, 'r1').braces[0]).toMatchObject({ text: '13×3=39颗', side: 'above' })
    expect(16 + 10).toBe(26)
    expect(26 / (5 - 3)).toBe(13)
    expect(13 * 3 + 16).toBe(55)
    expect(13 * 5 - 10).toBe(55)
    expect(p.answer).toMatch(/13.*55/)
    expect(p.steps.at(-1)!.formula).toMatch(/份数/)
  })
  it('每一步的半径都 > 0（相机能正确估算）', () => {
    for (const s of st) expect(sceneRadius(s)).toBeGreaterThan(0)
  })
})

// ---------- 本轮新增：mark.tint / remainder.was / compactShow ----------
describe('mark 的 tint：只染容器 / 容器和物品都染', () => {
  const plate = [benchDef({ container: 'plate', slots: 3, fill: [{ kind: 'token', shape: 'ball', count: 2, color: 'green' }] })]
  const mark = (extra: object = {}) => ({ do: 'mark', target: 'b', slots: [2, 3], style: 'highlight', color: 'yellow', ...extra })
  const lay = (actions: unknown[]) => layoutBench(B(run(actions, plate)))

  it('默认（不写 / "all"）：容器和里面的物品都变高亮色；状态里不多存 tint（向后兼容）', () => {
    for (const extra of [{}, { tint: 'all' }]) {
      const s = run([mark(extra)], plate)
      expect(B(s).slotStates[1]!.marks).toEqual({ highlight: { color: '#f5b301' } })
      const l = layoutBench(B(s))
      expect(l.slots[1]!.highlight).toBe('#f5b301')
      expect(l.items.filter((i) => i.slot === 2).every((i) => i.color === '#f5b301')).toBe(true)
    }
  })
  it('tint:"container"：只有容器上高亮色，物品保持原色（没被标记的份当然也不变）', () => {
    const s = run([mark({ tint: 'container' })], plate)
    expect(B(s).slotStates[1]!.marks.highlight).toEqual({ color: '#f5b301', tint: 'container' })
    const l = layoutBench(B(s))
    expect(l.slots.map((x) => x.highlight)).toEqual([null, '#f5b301', '#f5b301'])
    const orig = lay([]).items.find((i) => i.slot === 2)!.color
    expect(l.items.filter((i) => i.slot === 2 || i.slot === 3).every((i) => i.color === orig)).toBe(true)
    expect(orig).not.toBe('#f5b301')
  })
  it('同一份后写的 highlight 覆盖先写的（container → all 会重新染物品）；unmark 清掉', () => {
    const l = lay([mark({ tint: 'container' }), mark()])
    expect(l.items.filter((i) => i.slot === 2).every((i) => i.color === '#f5b301')).toBe(true)
    const l2 = lay([mark({ tint: 'container' }), { do: 'unmark', target: 'b' }])
    expect(l2.slots.every((x) => x.highlight === null)).toBe(true)
  })
  it('tint 只能配 highlight；container 是 none 时没有东西可染——都报在 tint 字段', () => {
    const e1 = err([{ do: 'mark', target: 'b', slots: [1, 2], style: 'cross', tint: 'container' }])
    expect(e1).toMatchObject({ step: 1, field: 'actions[0].tint' })
    expect(e1.message).toMatch(/highlight/)
    const e2 = err([mark({ tint: 'container' })], [benchDef({ container: 'none' })])
    expect(e2).toMatchObject({ field: 'actions[0].tint' })
    expect(e2.message).toMatch(/none/)
    // container=none + 默认 tint 仍然合法
    expect(validateProblemData('a.json', prob([{ title: 's', actions: [mark()] }], [benchDef({ container: 'none' })])).errors).toEqual([])
  })
  it('schema：tint 只认 all / container', () => {
    const r = validateProblemData('a.json', prob([{ title: 's', actions: [mark({ tint: 'items' })] }]))
    expect(r.errors[0]).toMatchObject({ step: 0, field: 'actions[0].tint' })
  })
})

describe('remainder 的 was：划掉的旧文字', () => {
  const rem = (extra: object = {}) => ({ do: 'remainder', target: 'b', value: { type: 'short', text: '少18人', items: [{ kind: 'block', text: '18人' }], ...extra } })
  it('进入状态；再写一次不带 was 就撤掉；清除 remainder 时一起没了；初始定义里也能写', () => {
    const p = mk([{ title: 'a', actions: [rem({ was: '多6人' })] }, { title: 'b', actions: [rem()] }, { title: 'c', actions: [{ do: 'remainder', target: 'b', value: null }] }])
    const [s0, s1, s2] = computeStates(p)
    expect(B(s0!).remainder).toMatchObject({ text: '少18人', was: '多6人' })
    expect(B(s1!).remainder!.was).toBeNull()
    expect(B(s2!).remainder).toBeNull()
    const init = initialBench(benchDef({ remainder: { type: 'extra', text: '多1', was: '旧' } }) as never)
    expect(init.remainder!.was).toBe('旧')
    expect(initialBench(benchDef({ remainder: { type: 'extra', text: '多1' } }) as never).remainder!.was).toBeNull()
  })
  it('改写时 block 的 id 沿用（was 不影响物品）', () => {
    const p = mk([{ title: 'a', actions: [rem()] }, { title: 'b', actions: [rem({ was: '多6人' })] }])
    const [s0, s1] = computeStates(p)
    expect(B(s1!).remainder!.segs[0]!.ids).toEqual(B(s0!).remainder!.segs[0]!.ids)
  })
  it('布局：旧文字在新文字正上方 WAS_LIFT 处；没有 was 时为 null；包围盒装得下旧文字', () => {
    const l = layoutBench(B(run([rem({ was: '多6人' })])))
    expect(l.remainder!.was).toBe('多6人')
    expect(l.remainder!.wasY).toBeCloseTo(l.remainder!.y + WAS_LIFT, 9)
    expect(l.bounds.max[1]).toBeGreaterThanOrEqual(l.remainder!.wasY + 0.3 - 1e-9)
    const plain = layoutBench(B(run([rem()])))
    expect(plain.remainder!.was).toBeNull()
    expect(plain.bounds.max[1]).toBeLessThan(l.bounds.max[1])
  })
  it('旧文字比新文字还宽时整堆往右让（不压住最后一份）；没有 was 的 remainder 位置不变', () => {
    const at = (extra: object) => layoutBench(B(run([{ do: 'remainder', target: 'b', value: { type: 'extra', text: '多', ...extra } }]))).remainder!
    expect(at({ was: '这是一段很长很长的旧文字旧文字' }).x).toBeGreaterThan(at({}).x)
    expect(at({}).x).toBeCloseTo(layoutBench(B(run([]))).xR + 0.3 + 0.5, 9)
  })
  it('取景把旧文字算进去（包围盒变高 / 多一块文字留白）', () => {
    const obj = [benchDef()]
    const rects = (extra: object) => sceneFit(run([{ do: 'remainder', target: 'b', value: { type: 'extra', text: '多6人', ...extra } }], obj))!
    expect(rects({ was: '划掉的旧文字' }).length).toBe(rects({}).length + 1)
  })
  it('schema：was 不能是空串', () => {
    const r = validateProblemData('a.json', prob([{ title: 's', actions: [rem({ was: '' })] }]))
    expect(r.errors[0]).toMatchObject({ step: 0, field: 'actions[0].value.was' })
  })
})

describe('compactShow：窄屏用另一组显示区间', () => {
  const big = (extra: object = {}) => benchDef({ slots: 21, show: [[1, 3], [20, 21]], compactShow: [[1, 1], [21, 21]], ...extra })
  const entries = (b: BenchState, compact: boolean) => layoutBench(b, compact).entries.map((e) => (e.kind === 'slot' ? e.index : '…'))

  it('窄屏判定：画布宽度 < COMPACT_WIDTH（600）', () => {
    expect(COMPACT_WIDTH).toBe(600)
    expect(isCompactWidth(599)).toBe(true)
    expect(isCompactWidth(600)).toBe(false)
    expect(isCompactWidth(390)).toBe(true)
    expect(isCompactWidth(0)).toBe(false) // 还没量出宽度：按桌面
  })
  it('桌面永远用 show；compact 且写了 compactShow 才用 compactShow（规范化：排序 / 合并 / 覆盖全部 = null）', () => {
    const b = initialBench(big() as never)
    expect(b.compactShow).toEqual([[1, 1], [21, 21]])
    expect(effectiveShow(b, false)).toEqual([[1, 3], [20, 21]])
    expect(effectiveShow(b, true)).toEqual([[1, 1], [21, 21]])
    expect(entries(b, false)).toEqual([1, 2, 3, '…', 20, 21])
    expect(entries(b, true)).toEqual([1, '…', 21])
    expect(initialBench(big({ compactShow: [[10, 21], [1, 10]] }) as never).compactShow).toBeNull() // 覆盖全部 = 全部显示（不是“没写”）
    expect(entries(initialBench(big({ compactShow: [[1, 21]] }) as never), true)).toHaveLength(21)
  })
  it('没写 compactShow：窄屏和桌面完全一样（同一个布局对象），compactShow 字段为 undefined', () => {
    const b = initialBench(big({ compactShow: undefined }) as never)
    expect(b.compactShow).toBeUndefined()
    expect(effectiveShow(b, true)).toEqual(b.show)
    expect(layoutBench(b, true)).toBe(layoutBench(b, false))
    expect(layoutBench(initialBench(big() as never), true)).not.toBe(layoutBench(initialBench(big() as never), false))
  })
  it('桌面布局不受 compactShow 影响（逐项相同）', () => {
    const withC = layoutBench(initialBench(big() as never), false)
    const without = layoutBench(initialBench(big({ compactShow: undefined }) as never), false)
    expect(withC.slots.map((x) => x.x)).toEqual(without.slots.map((x) => x.x))
    expect(withC.bounds).toEqual(without.bounds)
  })
  it('setSlots：写了 compactShow 就改写；没写 = 窄屏回退到 show（不沿用旧的，旧的可能对不上新份数）', () => {
    const p = mk(
      [
        { title: 'a', actions: [{ do: 'setSlots', target: 'b', slots: 30, show: [[1, 3], [29, 30]], compactShow: [[1, 1], [30, 30]] }] },
        { title: 'b', actions: [{ do: 'setSlots', target: 'b', slots: 30, show: [[1, 3], [29, 30]] }] },
        { title: 'c', actions: [{ do: 'setSlots', target: 'b', slots: 5 }] },
      ],
      [big()],
    )
    const [s0, s1, s2] = computeStates(p)
    expect(B(s0!).compactShow).toEqual([[1, 1], [30, 30]])
    expect(entries(B(s0!), true)).toEqual([1, '…', 30])
    expect(B(s1!).compactShow).toBeUndefined()
    expect(entries(B(s1!), true)).toEqual([1, 2, 3, '…', 29, 30])
    expect(entries(B(s2!), true)).toEqual([1, 2, 3, 4, 5])
  })
  it('份的 x 坐标：窄屏下按可见条目居中；两行 E 差不变时 yk 式的错位对齐仍成立', () => {
    // 两行：上行 E=3、下行 E=3+3，下行整体右移 (6-3)/2*1.3 = 1.95 → 下行最后一份正好在上行最后一份的正下方
    const objs = [
      { ...benchDef({ id: 'u', slots: 21, show: [[1, 2], [18, 21]], compactShow: [[1, 1], [21, 21]] }), id: 'u', position: [-0.975, 0, 0] },
      { ...benchDef({ slots: 24, show: [[1, 2], [18, 24]], compactShow: [[1, 1], [21, 24]] }), id: 'd', position: [0.975, -2, 0] },
    ]
    const s = run([], objs)
    const abs = (id: string, compact: boolean, slot: number) => {
      const o = s.objects[id]!
      return layoutBench(o.bench!, compact).slots.find((x) => x.index === slot)!.x + o.position[0]
    }
    for (const compact of [false, true]) {
      expect(abs('u', compact, 21)).toBeCloseTo(abs('d', compact, 21), 9)
      expect(abs('u', compact, 1)).toBeCloseTo(abs('d', compact, 1), 9)
    }
  })
  it('divider：窄屏下 after 被省略但 after+1 可见时落在 after+1 的左缘；最右一份之后 = 最右缘', () => {
    const s = run([{ do: 'divider', target: 'b', after: 20, text: 'x' }, { do: 'divider', target: 'b', after: 21 }], [big()])
    const x = (compact: boolean, after: number) => layoutBench(B(s), compact).dividers.find((d) => d.key === `d${after}`)!.x
    // 窄屏 [1, …, 21]：第 20 份被省略、第 21 份在 x=1.3 → 线在第 21 份左缘 0.65；第 21 份之后 = 最右缘
    expect(x(true, 20)).toBeCloseTo(0.65, 9)
    expect(x(true, 21)).toBeCloseTo(1.95, 9)
    expect(x(false, 21)).toBeCloseTo(3.9, 9)
  })
  it('layoutBench 的兜底：绕过校验硬塞一条两侧都被省略的竖线时，仍落在 “…” 的位置（正常写法会在动作里被拒绝）', () => {
    const b = { ...B(run([], [big()])), dividers: [{ after: 10, text: null }] }
    expect(layoutBench(b, true).dividers[0]!.x).toBeCloseTo(0, 9)
  })
  it('brace：区间跨越“…”按可见部分画；窄屏同理', () => {
    const s = run([{ do: 'brace', target: 'b', slots: [1, 21], text: '21' }], [big()])
    const below = (c: boolean) => layoutBench(B(s), c).braces[0]!
    expect(below(false).x0).toBeCloseTo(-3.9 + 0.65 - 0.5 + 0.0, 1) // 桌面：第 1 份左缘（E=6，x(1)=-3.25）
    expect(below(true).x0).toBeCloseTo(-1.3 - 0.5, 9) // 窄屏 E=3：第 1 份在 -1.3
    expect(below(true).x1).toBeCloseTo(1.3 + 0.5, 9)
  })
  it('校验：compactShow 越界 / 太多份 / 拼错；setSlots 同样；brace 在窄屏全被藏起来也报错', () => {
    const e1 = objErr2(benchDef({ slots: 10, compactShow: [[1, 2], [9, 11]] }))
    expect(e1).toMatchObject({ field: 'scene.objects[0].compactShow[1]' })
    expect(objErr2(benchDef({ slots: 100, show: [[1, 3], [99, 100]], compactShow: [[1, 30]] })).message).toMatch(/compactShow.*太多/)
    const e2 = err([{ do: 'setSlots', target: 'b', slots: 10, compactShow: [[1, 3], [9, 11]] }])
    expect(e2).toMatchObject({ step: 1, field: 'actions[0].compactShow[1]' })
    const e3 = err([{ do: 'brace', target: 'b', slots: [5, 10], text: 'x' }], [big({ show: [[1, 3], [5, 10]] })])
    expect(e3).toMatchObject({ step: 1, field: 'actions[0].slots' })
    expect(e3.message).toMatch(/窄屏.*compactShow/)
    // 桌面 + 窄屏都能看到：合法
    const ok = validateProblemData('a.json', prob([{ title: 's', actions: [{ do: 'brace', target: 'b', slots: [1, 21], text: 'x' }] }], [big()]))
    expect(ok.errors).toEqual([])
    expect(validateProblemData('a.json', prob([{ title: 's' }], [benchDef({ compactShow: [] })])).errors[0]).toMatchObject({ field: 'scene.objects[0].compactShow' })
  })
  it('sceneFit / sceneRadiusAt 跟着 compact 走：窄屏显示的份少 → 内容更窄', () => {
    const s = run([], [big()])
    const w = (rects: ReturnType<typeof sceneFit>) => Math.max(...rects!.map((r) => r.max[0])) - Math.min(...rects!.map((r) => r.min[0]))
    expect(w(sceneFit(s, true))).toBeLessThan(w(sceneFit(s, false)))
    expect(w(sceneFit(s))).toBe(w(sceneFit(s, false)))
    expect(sceneRadiusAt(s, true)).toBeLessThan(sceneRadiusAt(s, false))
    expect(sceneRadiusAt(s, false)).toBe(sceneRadius(s))
    expect(sceneFitInfo(s, true)).not.toBeNull()
  })
})

describe('Arrow 的 compactOffset', () => {
  const arrow = (extra: object = {}) => ({ id: 'a', type: 'Arrow', from: [-6, 1, 0], to: [-6, -1, 0], ...extra })
  it('窄屏（compact）整个箭头平移；桌面不动；没写 = 不动；move 之后偏移仍然叠加', () => {
    const s = run([], [arrow({ compactOffset: [2.5, 0, 0.5] })])
    expect(s.objects['a']!.arrow!.compactOffset).toEqual([2.5, 0, 0.5])
    expect(arrowEnds(s.objects['a']!, false)).toEqual({ from: [-6, 1, 0], to: [-6, -1, 0] })
    expect(arrowEnds(s.objects['a']!, true)).toEqual({ from: [-3.5, 1, 0.5], to: [-3.5, -1, 0.5] })
    const plain = run([], [arrow()])
    expect(plain.objects['a']!.arrow!.compactOffset).toBeNull()
    expect(arrowEnds(plain.objects['a']!, true)).toEqual({ from: [-6, 1, 0], to: [-6, -1, 0] })
    const moved = run([{ do: 'move', target: 'a', position: [-5, 1, 0] }], [arrow({ compactOffset: [2, 0, 0] })])
    expect(arrowEnds(moved.objects['a']!, true)).toEqual({ from: [-3, 1, 0], to: [-3, -1, 0] }) // 起点 -5 → 终点跟着平移到 -5；再 +2
  })
  it('取景和半径用 compact 后的位置', () => {
    const s = run([], [benchDef(), arrow({ compactOffset: [10, 0, 0], text: '差' })])
    const maxX = (rs: ReturnType<typeof sceneFit>) => Math.max(...rs!.map((r) => r.max[0]))
    expect(maxX(sceneFit(s, true))).toBeGreaterThan(maxX(sceneFit(s, false)))
    const visible = run([{ do: 'show', target: 'a' }], [benchDef(), arrow({ compactOffset: [30, 0, 0], visible: false })])
    expect(sceneRadiusAt(visible, true)).toBeGreaterThan(sceneRadiusAt(visible, false))
  })
  it('schema：必须是 [x, y, z]', () => {
    const r = validateProblemData('a.json', prob([{ title: 's' }], [arrow({ compactOffset: [1, 2] })]))
    expect(r.errors[0]).toMatchObject({ field: 'scene.objects[0].compactOffset' })
  })
})

describe('竖线文字与上方大括号文字重叠时加高', () => {
  const objs = [benchDef({ slots: 3, fill: [] })]
  it('括号文字的水平范围盖住竖线文字 → 竖线再加高 DIVIDER_BRACE_LIFT；离得远 / 括号在下方 / 竖线没文字 → 不变', () => {
    const y1 = (actions: unknown[]) => layoutBench(B(run(actions, objs))).dividers[0]!.y1
    const base = y1([{ do: 'divider', target: 'b', after: 3, text: '准时到校' }])
    const brace = (over: object) => ({ do: 'brace', target: 'b', slots: [1, 3], text: '21×80=1680米', side: 'above', ...over })
    expect(DIVIDER_BRACE_LIFT).toBeGreaterThan(DIVIDER_LIFT)
    expect(y1([brace({ slots: [2, 3] }), { do: 'divider', target: 'b', after: 3, text: '准时到校' }])).toBeCloseTo(base + DIVIDER_BRACE_LIFT, 9)
    // 同时贴着行尾：不叠加（还是 DIVIDER_BRACE_LIFT，不是两个抬高相加）
    const rem = { do: 'remainder', target: 'b', value: { type: 'short', text: '少480米' } }
    expect(y1([rem, brace({ slots: [2, 3] }), { do: 'divider', target: 'b', after: 3, text: '准时到校' }])).toBeCloseTo(base + DIVIDER_BRACE_LIFT, 9)
    // 只贴行尾、没有上方括号：仍是 DIVIDER_LIFT
    expect(y1([rem, { do: 'divider', target: 'b', after: 3, text: '准时到校' }])).toBeCloseTo(base + DIVIDER_LIFT, 9)
    expect(y1([brace({ slots: [1, 1], text: 'a' }), { do: 'divider', target: 'b', after: 3, text: '准时到校' }])).toBeCloseTo(base, 9) // 离得远
    expect(y1([brace({ side: 'below' }), { do: 'divider', target: 'b', after: 3, text: '准时到校' }])).toBeCloseTo(base, 9)
    expect(y1([brace({ slots: [2, 3] }), { do: 'divider', target: 'b', after: 3 }])).toBeCloseTo(base, 9) // 竖线没文字
  })
  it('抬高后竖线文字在大括号文字正上方，两段文字不在垂直方向重叠（按 Bench3D 的实际文字高度算）', () => {
    // 大括号文字中心 = brace.y + 2r + 0.27（BraceMesh）；竖线文字中心 = y1 + 0.25（DividerMesh）
    // 文字高：.bench-note 16px×1.1 + 2px 内边距；.bench-divider 14px×1.1；约 38px / 世界单位
    const need = (16 * 1.1 + 2 + 14 * 1.1) / 2 / 38
    for (const slots of [[1, 3], [2, 3], [3, 3]] as const) {
      const lay = layoutBench(B(run([{ do: 'brace', target: 'b', slots, text: '21×80=1680米', side: 'above' }, { do: 'divider', target: 'b', after: 3, text: '准时到校' }], objs)))
      const br = lay.braces[0]!
      const r = Math.min(0.16, Math.max(br.x1 - br.x0, 0.4) / 5)
      const gap = lay.dividers[0]!.y1 + 0.25 - (br.y + 2 * r + 0.27)
      expect(gap, `slots=${slots}`).toBeGreaterThanOrEqual(need)
    }
  })
})

describe('yk-10 / yk-11 / yk-08 / yk-09：真实题目里的 compactShow', () => {
  const load = (f: string) => ProblemSchema.parse(JSON.parse(readFileSync(resolve(__dirname, `../content/problems/${f}.json`), 'utf8')))
  const abs = (s: SceneState, id: string, compact: boolean, slot: number) => {
    const o = s.objects[id]!
    return layoutBench(o.bench!, compact).slots.find((x) => x.index === slot)?.x! + o.position[0]
  }
  it('yk-10：两行的“准时到校”线（第 21 份）桌面和窄屏都上下对齐；窄屏显示 4 / 7 条目（差 3，第 20、21 份都看得见）', () => {
    const st = computeStates(load('yk-10-shangxue'))
    const s = st[5]! // 步 6：两行都在
    for (const compact of [false, true]) expect(abs(s, 'r1', compact, 21)).toBeCloseTo(abs(s, 'r2', compact, 21), 9)
    // 手机竖屏要看得见“最后 6 分钟”的那几份：① 行到第 20 份、② 行到第 24 份（位置数之差仍是 3，竖线才对得上）
    expect(layoutBench(B(s, 'r1'), true).entries.length).toBe(4)
    expect(layoutBench(B(s, 'r2'), true).entries.length).toBe(7)
    expect(layoutBench(B(s, 'r2'), false).entries.length).toBe(12)
    // 窄屏每一步都能取景，且文字不压：两条箭头在窄屏的 x 间隔 > 桌面上不重叠所需
    for (const x of st) expect(sceneFit(x, true)).not.toBeNull()
  })
  it('yk-10：窄屏下大括号 / 红叉 / 竖线都还在（没被省略号吞掉）', () => {
    const st = computeStates(load('yk-10-shangxue'))
    expect(layoutBench(B(st[5]!, 'r2'), true).slots.filter((x) => x.cross).map((x) => x.index)).toEqual([22, 23, 24])
    expect(layoutBench(B(st[10]!, 'r2'), true).braces).toHaveLength(1)
    expect(layoutBench(B(st[9]!, 'r1'), true).dividers[0]!.text).toBe('准时到校')
  })
  it('yk-08 / yk-09：setSlots 之后窄屏仍只显示首尾；两行入口对齐', () => {
    for (const [f, a, b, n] of [['yk-08-pingpan', 'p1', 'p2', 16], ['yk-09-hongbai', 'b1', 'b2', 100]] as const) {
      const st = computeStates(load(f))
      for (const step of [1, 2, 4, 5, 6, 10]) {
        const s = st[step]!
        const lay = (id: string) => layoutBench(B(s, id), true).entries.map((e) => (e.kind === 'slot' ? e.index : '…'))
        if (!s.objects[b]!.visible) continue
        expect(lay(a)).toEqual([1, '…', n])
        expect(lay(b)[0]).toBe(1)
        expect(lay(b).length).toBe(3)
      }
    }
  })
  it('yk-11：两行入口对齐（B 比 A 多 4 个条目 → B 右移 2.6）', () => {
    const st = computeStates(load('yk-11-yingbi'))
    const s = st[3]!
    for (const compact of [false, true]) expect(abs(s, 'rA', compact, 21)).toBeCloseTo(abs(s, 'rB', compact, 21), 9)
    expect(layoutBench(B(s, 'rB'), true).entries.length - layoutBench(B(s, 'rA'), true).entries.length).toBe(4)
  })
  it('yk-06 / yk-07：方块上已有“玻 / 酸”，上方标签不再重复；② 行标签是“保 / 纯”，换成全是玻 / 酸后清掉', () => {
    for (const [f, small, big] of [['yk-06-beizi', '玻', '保'], ['yk-07-niunai', '酸', '纯']] as const) {
      const st = computeStates(load(f))
      const counts = (s: SceneState, id: string) => layoutBench(B(s, id)).slots.map((x) => x.count)
      for (const s of st) expect(counts(s, 'r1').every((c) => c === '')).toBe(true) // ① 行从头到尾不重复
      expect(counts(st[1]!, 'r2').every((c) => c === big)).toBe(true) // 步 2：② 行 “保”
      expect(counts(st[8]!, 'r2').every((c) => c === big)).toBe(true) // 步 9：reset 之后还是 “保”
      expect(counts(st[9]!, 'r2').every((c) => c === '')).toBe(true) // 步 10：全是“玻”，不重复
      expect(layoutBench(B(st[9]!, 'r2')).items.some((i) => i.text === small)).toBe(true)
    }
  })
  it('yk-08 / yk-09 步 5：高亮只染盘 / 箱子，瓜 / 红球保持原色；步 6 起“划掉再改写”', () => {
    for (const [f, id, first] of [['yk-08-pingpan', 'p2', 13], ['yk-09-hongbai', 'b2', 51]] as const) {
      const st = computeStates(load(f))
      const lay = layoutBench(B(st[4]!, id))
      const hl = B(st[4]!, id).slotStates.slice(first - 1).map((x) => x.marks.highlight)
      expect(hl.every((m) => m?.tint === 'container')).toBe(true)
      const visibleHl = lay.slots.filter((x) => x.highlight)
      expect(visibleHl.length).toBeGreaterThan(0)
      for (const sl of visibleHl) expect(lay.items.filter((i) => i.slot === sl.index).every((i) => i.color !== '#f5b301')).toBe(true)
      expect(B(st[5]!, id).remainder!.was).toMatch(/^多/)
      expect(B(st[6]!, id).remainder!.was).toMatch(/^多/) // 步 7（只出现“每份差”箭头）旧文字还在
      expect(B(st[7]!, id).remainder!.was).toBeNull() // 步 8 总差箭头 a2 出现：撤掉，免得被 a2 的文字盖住
    }
  })
  it('yk-05：步 5 把“多6人”划掉改成“少8×3−6=18人”，步 7（总差箭头出现）撤掉', () => {
    const st = computeStates(load('yk-05-wufan'))
    expect(B(st[3]!, 'r2').remainder).toMatchObject({ type: 'extra', text: '多6人', was: null })
    expect(B(st[4]!, 'r2').remainder).toMatchObject({ type: 'short', text: '少8×3−6=18人', was: '多6人' })
    expect(B(st[5]!, 'r2').remainder!.was).toBe('多6人')
    expect(B(st[6]!, 'r2').remainder!.was).toBeNull()
  })
})

function objErr2(o: object) {
  const r = validateProblemData('a.json', prob([{ title: 's' }], [o]))
  expect(r.errors.length).toBeGreaterThan(0)
  return r.errors[0]!
}
