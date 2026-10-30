import { describe, expect, it } from 'vitest'
import { ARROW_GAP_PX, arrowLabelPlacement, TEXT_AT_T } from '../src/engine/arrowLabel'
import { adaptiveTextScale, fitCamera, LABEL_PITCH_RATIO, MIN_ADAPT_TEXT_SCALE, MIN_TEXT_SCALE, sceneFit, sceneFitInfo, scaleFitPads, textScale, type FitRect } from '../src/engine/fit'
import { SPACING } from '../src/engine/bench'
import { computeStates } from '../src/engine/state'
import { textPx } from '../src/engine/textSize'
import { ProblemSchema } from '../src/schema/problem'

const mk = (objects: unknown[], actions: unknown[] = []) =>
  computeStates(ProblemSchema.parse({ id: 't', title: 't', problem: 'p', scene: { objects }, steps: [{ title: 's', actions }] }))[0]!
const bench = (extra: object = {}) => ({ id: 'b', type: 'Bench', slots: 4, fill: [{ kind: 'token', shape: 'ball', count: 3 }], ...extra })

describe('textPx 文字像素宽度估算', () => {
  it('汉字 = 1em，数字 / 字母 = 0.6em，空串 = 0', () => {
    expect(textPx('', 16)).toBe(0)
    expect(textPx('多18朵', 10)).toBeCloseTo(10 + 6 + 6 + 10)
    expect(textPx('ab', 20)).toBeCloseTo(24)
  })
  it('全角标点按 1em，半角符号 < 1em，随字号线性增长', () => {
    expect(textPx('，', 10)).toBe(10)
    expect(textPx('+', 10)).toBeLessThan(10)
    expect(textPx('每份差2', 30)).toBeCloseTo(textPx('每份差2', 10) * 3)
  })
})

describe('arrowLabelPlacement 文字摆放', () => {
  it('textAt 决定沿箭身的位置', () => {
    for (const at of ['start', 'mid', 'end'] as const) {
      expect(arrowLabelPlacement([0, 0, 0], [10, 0, 0], at).point[0]).toBeCloseTo(10 * TEXT_AT_T[at])
    }
    expect(TEXT_AT_T.start).toBeLessThan(TEXT_AT_T.mid)
    expect(TEXT_AT_T.mid).toBeLessThan(TEXT_AT_T.end)
  })
  it('auto：横箭在上方；竖箭在侧面——箭在右半边放左侧（文字框在锚点左边 = anchor right），否则放右侧', () => {
    expect(arrowLabelPlacement([0, 0, 0], [3, 0, 0]).anchor).toBe('above')
    expect(arrowLabelPlacement([2, 1, 0], [2, -1, 0]).anchor).toBe('right')
    expect(arrowLabelPlacement([-2, 1, 0], [-2, -1, 0]).anchor).toBe('left')
  })
  it('显式 textSide 覆盖 auto：left → 文字在左边（anchor right），above / below 同名', () => {
    const f = (s: 'left' | 'right' | 'above' | 'below') => arrowLabelPlacement([0, 1, 0], [0, -1, 0], 'mid', s).anchor
    expect(f('left')).toBe('right')
    expect(f('right')).toBe('left')
    expect(f('above')).toBe('above')
    expect(f('below')).toBe('below')
  })
  it('斜箭（不够竖）按横箭处理', () => {
    expect(arrowLabelPlacement([0, 0, 0], [3, 2, 0]).anchor).toBe('above')
  })
})

describe('fitCamera 取景', () => {
  const opt = { width: 1280, height: 800, fov: 40 }
  const box = (x0: number, x1: number, y0 = -1, y1 = 1, pad?: FitRect['pad']): FitRect => ({ min: [x0, y0, 0], max: [x1, y1, 0], pad })

  it('目标点是内容中心；内容刚好装进画面（留白之内）', () => {
    const r = fitCamera([box(0, 10)], { ...opt, minDist: 1, maxDist: 100 })
    expect(r.center[0]).toBeCloseTo(5, 1)
    expect(r.center[1]).toBeCloseTo(0, 1)
    const ppu = 400 / (r.dist * Math.tan((40 * Math.PI) / 360))
    expect(5 * ppu).toBeLessThanOrEqual(640 - 24 + 0.5)
    expect(5 * ppu).toBeGreaterThan(640 - 24 - 5) // 贴边而不是缩得很小
  })
  it('内容越宽距离越大；窄屏（手机）比宽屏离得更远', () => {
    const o = { ...opt, minDist: 1, maxDist: 200 }
    expect(fitCamera([box(0, 20)], o).dist).toBeGreaterThan(fitCamera([box(0, 10)], o).dist)
    expect(fitCamera([box(0, 10)], { ...o, width: 390, height: 844 }).dist).toBeGreaterThan(fitCamera([box(0, 10)], o).dist)
  })
  it('文字像素留白：一侧伸出很多像素时，目标点往那一侧挪；距离变大', () => {
    const o = { ...opt, minDist: 1, maxDist: 200 }
    const plain = fitCamera([box(0, 10)], o)
    const padded = fitCamera([box(0, 10, -1, 1, [0, 200, 0, 0])], o)
    expect(padded.center[0]).toBeGreaterThan(plain.center[0])
    expect(padded.dist).toBeGreaterThan(plain.dist)
  })
  it('minDist / maxDist 夹住结果', () => {
    expect(fitCamera([box(0, 0.1)], { ...opt, minDist: 6.5 }).dist).toBe(6.5)
    expect(fitCamera([box(0, 1e5)], { ...opt, maxDist: 45 }).dist).toBe(45)
  })
  it('上下方向也会撑开距离（高而窄的内容）', () => {
    const o = { ...opt, minDist: 1, maxDist: 200 }
    expect(fitCamera([box(0, 1, 0, 20)], o).dist).toBeGreaterThan(fitCamera([box(0, 1, 0, 2)], o).dist)
  })
})

describe('sceneFit 取景内容', () => {
  it('没有 Bench 的场景（方块 / 标签 / 只有箭头）返回 null', () => {
    expect(sceneFit(mk([{ id: 'c', type: 'CubeGrid', size: [2, 2, 2] }]))).toBeNull()
    expect(sceneFit(mk([{ id: 'a', type: 'Arrow', from: [0, 0, 0], to: [1, 0, 0] }]))).toBeNull()
    expect(sceneFit(mk([{ id: 'l', type: 'Label', text: 'x', position: [0, 0, 0] }]))).toBeNull()
  })
  it('Bench + Arrow：有 Bench 才取景，Arrow 文字计入；隐藏的对象不计入', () => {
    const arrow = { id: 'a', type: 'Arrow', from: [0, 0, 0], to: [0, -2, 0], text: '每份差 2' }
    const withArrow = sceneFit(mk([bench(), arrow]))!
    const without = sceneFit(mk([bench(), { ...arrow, visible: false }]))!
    expect(withArrow.length).toBeGreaterThan(without.length)
    expect(sceneFit(mk([bench({ visible: false })]))).toBeNull()
  })
  it('Bench 与方块同时可见时不取景', () => {
    expect(sceneFit(mk([bench(), { id: 'c', type: 'CubeGrid', size: [2, 2, 2] }]))).toBeNull()
  })
  it('箭头文字的留白方向跟 textSide 一致，间距含 ARROW_GAP_PX', () => {
    const f = (textSide: string) => {
      const r = sceneFit(mk([bench(), { id: 'a', type: 'Arrow', from: [0, 0, 0], to: [0, -2, 0], text: '差', textSide }]))!
      return r[r.length - 1]!.pad!
    }
    const left = f('left')
    expect(left[0]).toBeGreaterThan(ARROW_GAP_PX) // 向左伸
    expect(left[1]).toBe(0)
    const right = f('right')
    expect(right[1]).toBeGreaterThan(ARROW_GAP_PX)
    expect(right[0]).toBe(0)
    expect(f('above')[2]).toBeGreaterThan(f('above')[3]!)
    expect(f('below')[3]).toBeGreaterThan(f('below')[2]!)
  })
})

describe('textScale / scaleFitPads 窄屏文字缩放', () => {
  it('桌面（≥ 830px）按原大小；窄屏线性缩小；有下限', () => {
    expect(textScale(1280)).toBe(1)
    expect(textScale(830)).toBe(1)
    expect(textScale(600)).toBeCloseTo(0.72, 2)
    expect(textScale(390)).toBe(MIN_TEXT_SCALE)
    expect(textScale(0)).toBe(MIN_TEXT_SCALE)
  })
  it('只缩 pad，不动世界坐标；系数 1 原样返回', () => {
    const r: FitRect[] = [{ min: [0, 0, 0], max: [1, 1, 0], pad: [10, 20, 30, 40] }, { min: [0, 0, 0], max: [1, 1, 0] }]
    expect(scaleFitPads(r, 1)).toEqual(r)
    const s = scaleFitPads(r, 0.5)
    expect(s[0]).toEqual({ min: [0, 0, 0], max: [1, 1, 0], pad: [5, 10, 15, 20] })
    expect(s[1]).toEqual(r[1])
    expect(r[0]!.pad).toEqual([10, 20, 30, 40]) // 不改原数组
  })
  it('文字缩小后同样的内容可以取景得更近', () => {
    const o = { width: 390, height: 844, fov: 40, minDist: 1, maxDist: 200 }
    const rect: FitRect[] = [{ min: [0, 0, 0], max: [10, 1, 0], pad: [60, 60, 20, 20] }]
    expect(fitCamera(scaleFitPads(rect, MIN_TEXT_SCALE), o).dist).toBeLessThan(fitCamera(rect, o).dist)
  })
})

describe('sceneFitInfo / adaptiveTextScale 文字自适应缩放', () => {
  const wide = (extra: object = {}) =>
    mk([bench({ slots: 24, fill: [{ kind: 'block', text: '50米' }], caption: '分钟', countLabel: false, remainder: { type: 'extra', text: '多150米' }, ...extra })])
  const opt = (width: number, height = 390) => ({ width, height, fov: 40, minDist: 6.5, maxDist: 45 })

  it('sceneFitInfo：rects 与 sceneFit 相同；labelPx = 每份上方最宽的字（数字标签 / 方块上的字）', () => {
    const st = mk([bench({ fill: [{ kind: 'block', text: '50米' }] })])
    const info = sceneFitInfo(st)!
    expect(info.rects).toEqual(sceneFit(st))
    expect(info.labelPx).toBeCloseTo(Math.max(textPx('50米', 15), textPx('50米', 18) + 12)) // 数字标签（18px + 内边距）与方块字都算
    expect(sceneFitInfo(mk([{ id: 'l', type: 'Label', text: 'x', position: [0, 0, 0] }]))).toBeNull()
  })
  it('数字标签长了字号变小（> 4 字 15px、> 7 字 12px），labelPx 跟着算', () => {
    const lp = (text: string) => sceneFitInfo(mk([bench({ slots: 2 })], [{ do: 'fill', target: 'b', countText: text, segments: [{ kind: 'token', shape: 'ball', count: 1 }] }]))!.labelPx
    expect(lp('一二三四五')).toBeCloseTo(textPx('一二三四五', 15) + 12)
    expect(lp('一二三四五六七八')).toBeCloseTo(textPx('一二三四五六七八', 12) + 12)
  })
  it('labelPx = 0（没文字）时原样返回 base；桌面宽度、短行不缩', () => {
    const rects = sceneFit(wide())!
    expect(adaptiveTextScale(rects, 0, opt(390), 0.7)).toBe(0.7)
    const short = mk([bench({ slots: 4, fill: [{ kind: 'block', text: '酸' }] })])
    const info = sceneFitInfo(short)!
    expect(adaptiveTextScale(info.rects, info.labelPx, opt(830), 1)).toBe(1)
    expect(adaptiveTextScale(info.rects, info.labelPx, opt(390), textScale(390))).toBe(textScale(390))
  })
  it('长行 + 窄屏：文字比 base 更小、不低于下限；缩完之后相邻两份的字不再互相压住', () => {
    const info = sceneFitInfo(wide({ slots: 14 }))!
    const o = opt(390, 390)
    const base = textScale(390)
    const s = adaptiveTextScale(info.rects, info.labelPx, o, base)
    expect(s).toBeLessThan(base)
    expect(s).toBeGreaterThanOrEqual(MIN_ADAPT_TEXT_SCALE)
    const dist = fitCamera(scaleFitPads(info.rects, s), o).dist
    const pitch = SPACING * (o.height / 2 / (dist * Math.tan((o.fov * Math.PI) / 360)))
    if (s > MIN_ADAPT_TEXT_SCALE) expect(s * info.labelPx).toBeLessThanOrEqual(pitch * LABEL_PITCH_RATIO + 1e-6)
  })
  it('compactShow 联动：同一个状态用 sceneFitInfo(s, true) / (s, false) 分别算，窄屏显示的份少 → 文字缩放系数更大', () => {
    const st = wide({ slots: 14, compactShow: [[1, 1], [14, 14]] })
    const o = opt(390, 390)
    const base = textScale(390)
    const scaleOf = (compact: boolean) => {
      const info = sceneFitInfo(st, compact)!
      return adaptiveTextScale(info.rects, info.labelPx, o, base)
    }
    const desktop = scaleOf(false)
    const compact = scaleOf(true)
    expect(desktop).toBeLessThan(base) // 14 份全显示时文字被压小
    expect(compact).toBeGreaterThan(desktop) // 窄屏只显示 3 个位置，系数更大
    expect(compact).toBeLessThanOrEqual(base)
    expect(sceneFitInfo(st, true)!.rects).not.toEqual(sceneFitInfo(st, false)!.rects)
    // 没写 compactShow：两者完全一样
    const plain = wide({ slots: 14 })
    expect(sceneFitInfo(plain, true)).toEqual(sceneFitInfo(plain, false))
  })
  it('行越长，文字越小（单调）', () => {
    const sc = (slots: number) => {
      const i = sceneFitInfo(wide({ slots }))!
      return adaptiveTextScale(i.rects, i.labelPx, opt(390, 390), textScale(390))
    }
    expect(sc(14)).toBeLessThanOrEqual(sc(10))
    expect(sc(10)).toBeLessThanOrEqual(sc(6))
    expect(sc(14)).toBeLessThan(sc(6))
  })
})
