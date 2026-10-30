import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sliderValues } from '../src/engine/validate'
import { ActionSchema } from '../src/schema/problem'
import { computeStates } from '../src/engine/state'
import { content, loadContent, validateProblemData, validateProblemText } from '../src/content'

const dir = resolve(__dirname, '../content/problems')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

describe('content/problems 下所有 JSON 都能通过校验', () => {
  it('至少有两道样例题', () => {
    expect(files).toContain('cube-paint-3.json')
    expect(files).toContain('count-blocks.json')
  })

  for (const f of files) {
    it(`${f} 通过 schema + 引擎语义校验`, () => {
      const r = validateProblemText(f, readFileSync(resolve(dir, f), 'utf8'))
      expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([])
      expect(r.problem).toBeDefined()
    })
  }

  it('content.ts 的 import.meta.glob 加载结果：全部题目可用、没有错误', () => {
    expect(content.errors).toEqual([])
    expect(content.problems.map((p) => p.problem.id).sort()).toEqual(files.map((f) => f.replace(/\.json$/, '')).sort())
  })

  it('文件名与 id 一致，id 不重复', () => {
    const ids = content.problems.map((p) => p.problem.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of content.problems) expect(p.file).toBe(`${p.problem.id}.json`)
  })
})

describe('docs/AUTHORING.md', () => {
  const md = readFileSync(resolve(__dirname, '../docs/AUTHORING.md'), 'utf8')

  it('“最小可复制模板”本身能通过校验', () => {
    const m = /## 最小可复制模板[\s\S]*?```json\n([\s\S]*?)```/.exec(md)
    expect(m).not.toBeNull()
    const r = validateProblemText('template.json', m![1]!)
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([])
  })

  it('“最小 Bench 模板”本身能通过校验，并且每一步都能试算', () => {
    const m = /### 最小 Bench 模板[\s\S]*?```json\n([\s\S]*?)```/.exec(md)
    expect(m).not.toBeNull()
    const r = validateProblemText('bench-template.json', m![1]!)
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([])
    expect(r.problem!.series).toBe('我的系列')
    expect(computeStates(r.problem!)).toHaveLength(3)
  })

  it('“全部动作示例”能通过校验，且用到了每一个 Bench 动作和 Arrow 的通用动作', () => {
    const m = /### 全部动作示例[\s\S]*?```json\n([\s\S]*?)```/.exec(md)
    expect(m).not.toBeNull()
    const r = validateProblemText('bench-all.json', m![1]!)
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([])
    const used = new Set(r.problem!.steps.flatMap((s) => s.actions ?? []).map((a) => a.do))
    for (const d of ['fill', 'setSlots', 'mark', 'unmark', 'remainder', 'transfer', 'brace', 'divider', 'clearNotes', 'show', 'hide', 'move', 'reset', 'clear', 'setText']) {
      expect(used.has(d as never), `示例里没有用到 ${d}`).toBe(true)
    }
  })

  it('文档里提到了所有动作名、对象类型和分组字段', () => {
    const names = ActionSchema.options.map((o) => o.shape.do.value as string)
    expect(names.length).toBeGreaterThanOrEqual(19)
    for (const n of names) expect(md, `文档没有提到动作 ${n}`).toContain(`\`${n}\``)
    for (const w of ['Bench', 'Arrow', 'series', 'order', 'section', 'countText', 'remainder', 'container', 'caption', 'countLabel']) {
      expect(md).toContain(w)
    }
  })

  it('文档里的 TOC 链接都有对应的标题', () => {
    const heads = new Set([...md.matchAll(/^#{2,4} (.+)$/gm)].map((h) => h[1]!.trim().toLowerCase().replace(/[\s]+/g, '-').replace(/[（）()：:、，,。.“”"'`→/]/g, '')))
    const toc = [...md.slice(0, md.indexOf('---')).matchAll(/\]\(#([^)]+)\)/g)].map((t) => decodeURIComponent(t[1]!))
    expect(toc.length).toBeGreaterThan(8)
    for (const t of toc) {
      const norm = t.toLowerCase().replace(/[（）()：:、，,。.“”"'`→/]/g, '')
      expect(heads.has(norm), `TOC 链接 #${t} 找不到标题`).toBe(true)
    }
  })

  it('文档中的 explore 示例能通过校验', () => {
    const m = /## 探索题 explore[\s\S]*?```json\n([\s\S]*?)```/.exec(md)
    expect(m).not.toBeNull()
    const step = JSON.parse(m![1]!)
    const r = validateProblemData('x.json', {
      id: 'x',
      title: 'x',
      problem: 'p',
      scene: { objects: [{ id: 'cube', type: 'CubeGrid', size: [3, 3, 3], paint: 'surface' }] },
      steps: [step],
    })
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([])
  })

  it('文档中的 quiz 示例能通过校验', () => {
    const m = /## 选择题 quiz[\s\S]*?```json\n([\s\S]*?)```/.exec(md)
    expect(m).not.toBeNull()
    const r = validateProblemData('x.json', {
      id: 'x',
      title: 'x',
      problem: 'p',
      scene: { objects: [{ id: 'cube', type: 'CubeGrid', size: [3, 3, 3] }] },
      steps: [JSON.parse(m![1]!)],
    })
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([])
  })
})

// ---------- 反例：出错时给出 文件 / 步骤 / 字段 / 信息 ----------
const base = () => ({
  id: 'x',
  title: 'x',
  problem: 'p',
  scene: { objects: [{ id: 'c', type: 'CubeGrid', size: [3, 3, 3], paint: 'surface' }] },
  steps: [{ title: 's1' }, { title: 's2' }],
})
const withStep = (step: unknown) => {
  const b = base()
  b.steps[1] = step as never
  return b
}

describe('错误报告', () => {
  it('JSON 语法错误：不抛异常，报告文件名', () => {
    const r = validateProblemText('broken.json', '{ "id": "x", }')
    expect(r.problem).toBeUndefined()
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ file: 'broken.json', field: '(JSON 语法)' })
  })

  it('target 不存在：指出第几步、哪个字段，并列出可用对象', () => {
    const r = validateProblemData('a.json', withStep({ title: 'bad', actions: [{ do: 'highlight', target: 'cub' }] }))
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ file: 'a.json', step: 1, field: 'actions[0].target' })
    expect(r.errors[0]!.message).toContain('cub')
    expect(r.errors[0]!.message).toContain('c')
  })

  it('动作与对象类型不匹配', () => {
    const b = base()
    b.scene.objects.push({ id: 'lab', type: 'Label', text: 'a', position: [0, 0, 0] } as never)
    b.steps[1] = { title: 'bad', actions: [{ do: 'fade', target: 'lab', opacity: 0.5 }] } as never
    const r = validateProblemData('a.json', b)
    expect(r.errors[0]).toMatchObject({ step: 1, field: 'actions[0].target' })
    expect(r.errors[0]!.message).toMatch(/Label/)
  })

  it('字段名拼错（strict）：提示不认识的字段', () => {
    const r = validateProblemData('a.json', withStep({ title: 'bad', narraton: 'oops' }))
    expect(r.errors[0]).toMatchObject({ step: 1 })
    expect(r.errors[0]!.message).toContain('narraton')
  })

  it('未知的动作名', () => {
    const r = validateProblemData('a.json', withStep({ title: 'bad', actions: [{ do: 'explod', target: 'c' }] }))
    expect(r.errors[0]).toMatchObject({ step: 1, field: 'actions[0].do' })
    expect(r.errors[0]!.message).toContain('explode')
  })

  it('缺少必填字段 / 类型错误', () => {
    const r = validateProblemData('a.json', withStep({ title: 'bad', actions: [{ do: 'fade', target: 'c' }] }))
    expect(r.errors[0]).toMatchObject({ step: 1, field: 'actions[0].opacity' })
    const r2 = validateProblemData('a.json', { ...base(), title: 123 })
    expect(r2.errors[0]).toMatchObject({ field: 'title' })
    expect(r2.errors[0]!.step).toBeUndefined()
  })

  it('quiz：answer 下标越界 / 缺少 options', () => {
    const r = validateProblemData('a.json', withStep({ title: 'q', type: 'quiz', question: 'q?', options: ['a', 'b'], answer: 2 }))
    expect(r.errors[0]).toMatchObject({ step: 1, field: 'answer' })
    const r2 = validateProblemData('a.json', withStep({ title: 'q', type: 'quiz', question: 'q?', answer: 0 }))
    expect(r2.errors.map((e) => e.field)).toContain('options')
    const ok = validateProblemData('a.json', withStep({ title: 'q', type: 'quiz', question: 'q?', options: ['a', 'b'], answer: 1 }))
    expect(ok.errors).toEqual([])
  })

  it('忘了写 type 却写了 quiz / explore 字段', () => {
    const r = validateProblemData('a.json', withStep({ title: 'q', question: 'q?' }))
    expect(r.errors[0]).toMatchObject({ step: 1, field: 'question' })
  })

  const explore = (control: object, extra: object = {}) =>
    withStep({
      title: 'e',
      type: 'explore',
      control: { param: 'n', min: 2, max: 5, default: 3, bind: [{ target: 'c', prop: 'size', value: ['n', 'n', 'n'] }], ...control },
      ...extra,
    })

  it('explore：合法配置通过', () => {
    expect(validateProblemData('a.json', explore({}, { formulaTemplate: '{{n^3}}' })).errors).toEqual([])
  })

  it('explore：bind 表达式不可解析 / 含未定义变量 / 结果不是正整数', () => {
    const bad = (value: string[]) => validateProblemData('a.json', explore({ bind: [{ target: 'c', prop: 'size', value }] }))
    expect(bad(['n', 'n', 'alert(1)']).errors[0]).toMatchObject({ step: 1, field: 'control.bind[0].value[2]' })
    expect(bad(['n', 'm', 'n']).errors[0]!.message).toContain('m')
    expect(bad(['n/2', 'n', 'n']).errors[0]!.message).toMatch(/整数/)
    expect(bad(['n-2', 'n', 'n']).errors[0]!.message).toMatch(/n=2/) // n=2 时边长 0
  })

  it('explore：bind 的 target 不存在 / 不是 CubeGrid', () => {
    const r = validateProblemData('a.json', explore({ bind: [{ target: 'zzz', prop: 'size', value: ['n', 'n', 'n'] }] }))
    expect(r.errors[0]).toMatchObject({ step: 1, field: 'control.bind[0].target' })
    const b = base()
    b.scene.objects.push({ id: 's', type: 'CubeStack', heights: [[1]] } as never)
    b.steps[1] = { title: 'e', type: 'explore', control: { param: 'n', min: 1, max: 3, default: 2, bind: [{ target: 's', prop: 'size', value: ['n', 'n', 'n'] }] } } as never
    expect(validateProblemData('a.json', b).errors[0]!.message).toMatch(/CubeGrid/)
  })

  it('explore：min/max/default 不合理', () => {
    expect(validateProblemData('a.json', explore({ min: 5, max: 2 })).errors[0]).toMatchObject({ field: 'control.max' })
    expect(validateProblemData('a.json', explore({ default: 9 })).errors[0]).toMatchObject({ field: 'control.default' })
  })

  it('explore：formulaTemplate 里的表达式非法 / 变量未定义', () => {
    const r = validateProblemData('a.json', explore({}, { formulaTemplate: 'x={{1/(n-3)}}' }))
    expect(r.errors[0]).toMatchObject({ step: 1, field: 'formulaTemplate' })
    expect(r.errors[0]!.message).toMatch(/n=3/)
    const r2 = validateProblemData('a.json', explore({}, { formulaTemplate: '{{k+1}}' }))
    expect(r2.errors[0]!.message).toContain('k')
    const r3 = validateProblemData('a.json', explore({}, { formulaTemplate: '{{process.exit()}}' }))
    expect(r3.errors[0]).toMatchObject({ field: 'formulaTemplate' })
  })

  it('explore：滑块步数超过 1000 直接报错；正好 1000 格没问题', () => {
    const r = validateProblemData('a.json', explore({ min: 1, max: 5, step: 0.001, default: 3, bind: [{ target: 'c', prop: 'size', value: ['2', '2', '2'] }] }))
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ step: 1, field: 'control.step' })
    expect(r.errors[0]!.message).toContain('滑块步数过多')
    const ok = validateProblemData('a.json', explore({ min: 1, max: 2, step: 0.001, default: 1.5, bind: [{ target: 'c', prop: 'size', value: ['2', '2', '2'] }] }))
    expect(ok.errors).toEqual([])
  })

  it('sliderValues：一定包含 min / max / default（max 不在刻度上也要检查）', () => {
    expect(sliderValues({ min: 2, max: 5, step: 1, default: 3 })).toEqual([2, 3, 4, 5])
    expect(sliderValues({ min: 0, max: 10, step: 3, default: 3 })).toEqual([0, 3, 6, 9, 10])
    expect(sliderValues({ min: 0, max: 1, step: 0.1, default: 0.5 }).at(-1)).toBe(1)
    expect(sliderValues({ min: 1, max: 5, default: 3 })).toEqual([1, 2, 3, 4, 5])
  })

  it('explore：max 不在刻度上时，仍检查 max 处的表达式结果', () => {
    // step=4：刻度 n=1,5,9 时 10-n=9,5,1 都合法；max=10 不在刻度上，只有 n=10 时结果为 0
    const r = validateProblemData('a.json', explore({ min: 1, max: 10, step: 4, default: 5, bind: [{ target: 'c', prop: 'size', value: ['10-n', '2', '2'] }] }))
    expect(r.errors[0]!.message).toMatch(/n=10/)
  })

  it('camera：step.camera 和 scene.camera 的 position 与 target 重合都报错', () => {
    const s = validateProblemData('a.json', withStep({ title: 'x', camera: { position: [1, 2, 3], target: [1, 2, 3] } }))
    expect(s.errors[0]!.message).toContain('不能是同一个点')
    expect(s.errors[0]).toMatchObject({ step: 1 })
    const b = base() as Record<string, unknown> & { scene: Record<string, unknown> }
    b.scene.camera = { position: [0, 0, 0] } // target 缺省 = 原点
    const r = validateProblemData('a.json', b)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]!.message).toContain('不能是同一个点')
    expect(r.errors[0]!.field).toContain('scene.camera')
    b.scene.camera = { position: [0, 0, 5] }
    expect(validateProblemData('a.json', b).errors).toEqual([])
  })

  it('camera.projection：接受 perspective / orthographic / 不写；拒绝其他值，错误指向字段', () => {
    for (const projection of ['perspective', 'orthographic']) {
      expect(validateProblemData('a.json', withStep({ title: 'x', camera: { position: [0, 0, 11], projection } })).errors).toEqual([])
    }
    expect(validateProblemData('a.json', withStep({ title: 'x', camera: { position: [0, 0, 11] } })).errors).toEqual([])
    const bad = validateProblemData('a.json', withStep({ title: 'x', camera: { position: [0, 0, 11], projection: 'ortho' } }))
    expect(bad.errors).toHaveLength(1)
    expect(bad.errors[0]!.field).toContain('projection')
    expect(bad.errors[0]).toMatchObject({ step: 1 })
    // scene.camera 同样支持 / 同样校验
    const b = base() as Record<string, unknown> & { scene: Record<string, unknown> }
    b.scene.camera = { position: [0, 0, 5], projection: 'orthographic' }
    expect(validateProblemData('a.json', b).errors).toEqual([])
    b.scene.camera = { position: [0, 0, 5], projection: 'fisheye' }
    expect(validateProblemData('a.json', b).errors[0]!.field).toContain('scene.camera')
  })

  it('CubeStack：行长度不一致 / 全是 0', () => {
    const mk = (heights: number[][]) => ({ ...base(), scene: { objects: [{ id: 's', type: 'CubeStack', heights }] } })
    expect(validateProblemData('a.json', mk([[1, 2], [1]])).errors[0]!.field).toBe('scene.objects[0].heights')
    expect(validateProblemData('a.json', mk([[0, 0]])).errors[0]!.field).toBe('scene.objects[0].heights')
  })

  it('对象 id 重复', () => {
    const b = base()
    b.scene.objects.push({ id: 'c', type: 'CubeGrid', size: [1, 1, 1] } as never)
    expect(validateProblemData('a.json', b).errors[0]).toMatchObject({ field: 'scene.objects[1].id' })
  })

  it('loadContent：一个坏文件不影响其他题目；重复的题目 id 被报告', () => {
    const good = JSON.stringify(base())
    const r = loadContent({
      '/content/problems/a.json': good,
      '/content/problems/b.json': '{ nope',
      '/content/problems/c.json': good,
    })
    expect(r.problems.map((p) => p.file)).toEqual(['a.json'])
    expect(r.errors.map((e) => e.file).sort()).toEqual(['b.json', 'c.json'])
    expect(r.errors.find((e) => e.file === 'c.json')!.message).toContain('a.json')
  })
})
