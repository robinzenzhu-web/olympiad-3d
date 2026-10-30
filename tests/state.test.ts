import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProblemSchema, type Problem } from '../src/schema/problem'
import {
  applyControl,
  baseSceneRadius,
  computeCameras,
  computeStates,
  DEFAULT_CAMERA,
  initialState,
  radiusScale,
  sceneRadius,
  type ObjectState,
} from '../src/engine/state'
import { ProblemError } from '../src/engine/validate'

function make(steps: unknown[], objects?: unknown[]): Problem {
  return ProblemSchema.parse({
    id: 't',
    title: 't',
    problem: 'p',
    scene: {
      objects: objects ?? [
        { id: 'cube', type: 'CubeGrid', size: [3, 3, 3], paint: 'surface' },
        { id: 'tip', type: 'Label', text: 'hi', position: [0, 3, 0], visible: false },
      ],
    },
    steps,
  })
}

const cube = (s: { objects: Record<string, ObjectState> }) => s.objects['cube']!
const count = (o: ObjectState, f: (c: ObjectState['cells'][number]) => boolean) => o.cells.filter(f).length

describe('computeStates 基本性质', () => {
  const p = make([
    { title: 'a', actions: [{ do: 'highlight', target: 'cube', filter: { paintedFaces: 3 }, color: 'yellow' }] },
    { title: 'b', actions: [{ do: 'explode', target: 'cube', gap: 0.5 }, { do: 'number', target: 'cube', filter: { paintedFaces: 3 } }] },
    { title: 'c', actions: [{ do: 'fade', target: 'cube', filter: { paintedFaces: 0 }, opacity: 0.1 }] },
  ])

  it('每步一个状态，第 i 项是第 i 步结束后的状态', () => {
    const states = computeStates(p)
    expect(states).toHaveLength(3)
    expect(cube(states[0]!).gap).toBe(0)
    expect(cube(states[1]!).gap).toBe(0.5)
  })

  it('状态是累积的：之前的 highlight 在后续步骤仍在', () => {
    const states = computeStates(p)
    for (const s of states) expect(count(cube(s), (c) => c.highlight === '#f5b301')).toBe(8)
    expect(count(cube(states[0]!), (c) => c.number !== null)).toBe(0)
    expect(count(cube(states[1]!), (c) => c.number !== null)).toBe(8)
    expect(count(cube(states[2]!), (c) => c.number !== null)).toBe(8)
    expect(count(cube(states[2]!), (c) => c.opacity === 0.1)).toBe(1)
    expect(cube(states[1]!).gap).toBe(0.5)
    expect(cube(states[2]!).gap).toBe(0.5)
  })

  it('不会修改之前的状态（不可变）', () => {
    const states = computeStates(p)
    expect(count(cube(states[1]!), (c) => c.opacity < 1)).toBe(0)
    expect(count(cube(states[2]!), (c) => c.opacity < 1)).toBe(1)
  })

  it('跳步确定性：重复计算结果完全相同', () => {
    expect(computeStates(p)).toEqual(computeStates(p))
    const a = computeStates(p)[2]!
    const b = computeStates(make(p.steps))[2]!
    expect(a).toEqual(b)
  })

  it('入参 problem 不被修改', () => {
    const before = JSON.stringify(p)
    computeStates(p)
    expect(JSON.stringify(p)).toBe(before)
  })
})

describe('动作语义', () => {
  it('number 按 y,z,x 排序编号 1..k', () => {
    const p = make([{ title: 'a', actions: [{ do: 'number', target: 'cube', filter: { layer: 0, paintedFaces: 3 } }] }])
    const o = cube(computeStates(p)[0]!)
    const numbered = o.cells.filter((c) => c.number !== null).sort((a, b) => a.number! - b.number!)
    expect(numbered.map((c) => c.number)).toEqual([1, 2, 3, 4])
    expect(numbered.map((c) => c.cell.key)).toEqual(['0,0,0', '2,0,0', '0,0,2', '2,0,2'])
  })

  it('同一 cell 再次 number 时后者覆盖', () => {
    const p = make([
      { title: 'a', actions: [{ do: 'number', target: 'cube', filter: { paintedFaces: 3 } }] },
      { title: 'b', actions: [{ do: 'number', target: 'cube', filter: { layer: 2 } }] },
    ])
    const o = cube(computeStates(p)[1]!)
    expect(o.cells.find((c) => c.cell.key === '2,2,2')!.number).toBe(9) // layer 2 共 9 块，(2,2,2) 排最后
    expect(o.cells.find((c) => c.cell.key === '0,0,0')!.number).toBe(1) // layer 0 的角：仍是第一次的编号
  })

  it('后面的 fade/highlight 覆盖前面的（同一 cell）', () => {
    const p = make([
      {
        title: 'a',
        actions: [
          { do: 'fade', target: 'cube', opacity: 0.08 },
          { do: 'fade', target: 'cube', filter: { paintedFaces: 0 }, opacity: 1 },
          { do: 'highlight', target: 'cube', filter: { paintedFaces: 0 }, color: '#F00' },
        ],
      },
    ])
    const o = cube(computeStates(p)[0]!)
    expect(count(o, (c) => c.opacity === 0.08)).toBe(26)
    const inner = o.cells.find((c) => c.cell.paintedFaces === 0)!
    expect(inner.opacity).toBe(1)
    expect(inner.highlight).toBe('#ff0000')
  })

  it('clear 清掉 highlight/fade/number，但不影响 explode 与 size', () => {
    const p = make([
      {
        title: 'a',
        actions: [
          { do: 'explode', target: 'cube', gap: 0.6 },
          { do: 'highlight', target: 'cube' },
          { do: 'fade', target: 'cube', opacity: 0.5 },
          { do: 'number', target: 'cube' },
        ],
      },
      { title: 'b', actions: [{ do: 'clear', target: 'cube' }] },
    ])
    const [s0, s1] = computeStates(p)
    expect(count(cube(s0!), (c) => c.highlight !== null && c.number !== null && c.opacity === 0.5)).toBe(27)
    const o = cube(s1!)
    expect(o.cells.every((c) => c.highlight === null && c.number === null && c.opacity === 1)).toBe(true)
    expect(o.rules).toEqual([])
    expect(o.gap).toBe(0.6)
    expect(o.size).toEqual([3, 3, 3])
  })

  it('reset 恢复初始定义（含可见性、位置、间距、标注文字）', () => {
    const p = make([
      {
        title: 'a',
        actions: [
          { do: 'explode', target: 'cube' },
          { do: 'move', target: 'cube', position: [2, 0, 0] },
          { do: 'hide', target: 'cube' },
          { do: 'highlight', target: 'cube' },
          { do: 'show', target: 'tip' },
          { do: 'setText', target: 'tip', text: 'changed' },
        ],
      },
      { title: 'b', actions: [{ do: 'reset', target: 'cube' }, { do: 'reset', target: 'tip' }] },
    ])
    const [s0, s1] = computeStates(p)
    expect(cube(s0!)).toMatchObject({ gap: 0.4, position: [2, 0, 0], visible: false })
    expect(s0!.objects['tip']).toMatchObject({ visible: true, text: 'changed' })
    expect(cube(s1!)).toMatchObject({ gap: 0, position: [0, 0, 0], visible: true, rules: [] })
    expect(s1!.objects['tip']).toMatchObject({ visible: false, text: 'hi' })
  })

  it('show / hide / move / setText', () => {
    const p = make([
      { title: 'a', actions: [{ do: 'hide', target: 'cube' }, { do: 'show', target: 'tip' }] },
      { title: 'b', actions: [{ do: 'show', target: 'cube' }, { do: 'move', target: 'tip', position: [1, 2, 3] }] },
    ])
    const [s0, s1] = computeStates(p)
    expect(cube(s0!).visible).toBe(false)
    expect(s0!.objects['tip']!.visible).toBe(true)
    expect(cube(s1!).visible).toBe(true)
    expect(s1!.objects['tip']!.position).toEqual([1, 2, 3])
  })

  it('explode 默认 gap = 0.4', () => {
    const p = make([{ title: 'a', actions: [{ do: 'explode', target: 'cube' }] }])
    expect(cube(computeStates(p)[0]!).gap).toBe(0.4)
  })
})

describe('错误处理', () => {
  const bad = (action: unknown) => make([{ title: 'ok' }, { title: 'bad', actions: [action] }])

  it('未知 target：抛 ProblemError，带步骤号和字段', () => {
    try {
      computeStates(bad({ do: 'highlight', target: 'nope' }))
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ProblemError)
      const issue = (e as ProblemError).issue
      expect(issue.step).toBe(1)
      expect(issue.field).toBe('actions[0].target')
      expect(issue.message).toContain('nope')
      expect((e as Error).message).toContain('第 2 步')
    }
  })

  it('动作与对象类型不匹配', () => {
    expect(() => computeStates(bad({ do: 'highlight', target: 'tip' }))).toThrow(/Label/)
    expect(() => computeStates(bad({ do: 'setText', target: 'cube', text: 'x' }))).toThrow(/Label/)
    expect(() => computeStates(bad({ do: 'explode', target: 'tip' }))).toThrow(ProblemError)
  })

  it('region 过滤器只能用于 CubeGrid', () => {
    const p = make([{ title: 's', actions: [{ do: 'highlight', target: 'st', filter: { region: 'corner' } }] }], [
      { id: 'st', type: 'CubeStack', heights: [[1]] },
    ])
    expect(() => computeStates(p)).toThrow(/region/)
  })

  it('不认识的颜色', () => {
    expect(() => computeStates(bad({ do: 'highlight', target: 'cube', color: 'rgb(1,2,3)' }))).toThrow(/颜色/)
  })
})

describe('explore / applyControl', () => {
  const p = make([
    { title: 'a', actions: [{ do: 'highlight', target: 'cube', filter: { paintedFaces: 3 }, color: 'yellow' }, { do: 'explode', target: 'cube', gap: 0.3 }] },
    {
      title: 'explore',
      type: 'explore',
      control: { param: 'n', min: 2, max: 6, default: 3, bind: [{ target: 'cube', prop: 'size', value: ['n', 'n', 'n'] }] },
    },
  ])
  const step = p.steps[1]!

  it('默认值下 size 不变，cell 数 27', () => {
    const s = computeStates(p)[1]!
    expect(cube(s).size).toEqual([3, 3, 3])
    expect(cube(s).cells).toHaveLength(27)
  })

  it('applyControl 改 size 并重建 cell，规则自动作用在新 cell 上，且不改旧状态', () => {
    const s = computeStates(p)[1]!
    const s6 = applyControl(s, step, 6)
    expect(cube(s6).size).toEqual([6, 6, 6])
    expect(cube(s6).cells).toHaveLength(216)
    expect(count(cube(s6), (c) => c.highlight !== null)).toBe(8)
    expect(cube(s6).gap).toBe(0.3)
    expect(cube(s6).dims).toEqual([6, 6, 6])
    expect(cube(s).cells).toHaveLength(27)
    const s2 = applyControl(s6, step, 2)
    expect(cube(s2).cells).toHaveLength(8)
    expect(cube(s2).cells.every((c) => c.cell.paintedFaces === 3)).toBe(true)
  })

  it('6×6×6 四类数量 = 8 / 48 / 96 / 64', () => {
    const o = cube(applyControl(computeStates(p)[1]!, step, 6))
    const by = (n: number) => o.cells.filter((c) => c.cell.paintedFaces === n).length
    expect([by(3), by(2), by(1), by(0)]).toEqual([8, 48, 96, 64])
  })

  it('同一个值得到同一个结果（幂等 / 与路径无关）', () => {
    const s = computeStates(p)[1]!
    expect(applyControl(applyControl(s, step, 5), step, 4)).toEqual(applyControl(s, step, 4))
  })

  it('没有 control 的步骤调用会抛错', () => {
    expect(() => applyControl(computeStates(p)[0]!, p.steps[0]!, 3)).toThrow(ProblemError)
  })

  it('后续步骤的 reset 会回到最初的 size', () => {
    const p2 = make([...p.steps, { title: 'r', actions: [{ do: 'reset', target: 'cube' }] }])
    const s = computeStates(p2)[2]!
    expect(cube(s).size).toEqual([3, 3, 3])
  })
})

describe('sceneRadius', () => {
  it('随 explode 间距与 explore 的 size 变化；隐藏的对象不计', () => {
    const p = make([
      { title: 'a' },
      { title: 'b', actions: [{ do: 'explode', target: 'cube', gap: 0.5 }] },
      { title: 'c', actions: [{ do: 'hide', target: 'cube' }] },
      {
        title: 'd',
        type: 'explore',
        actions: [{ do: 'show', target: 'cube' }],
        control: { param: 'n', min: 1, max: 6, default: 3, bind: [{ target: 'cube', prop: 'size', value: ['n', 'n', 'n'] }] },
      },
    ])
    const st = computeStates(p)
    const r = st.map(sceneRadius)
    expect(r[0]).toBeCloseTo(0.5 * Math.sqrt(27), 6)
    expect(r[1]).toBeCloseTo(r[0]! * 1.5, 6)
    expect(r[2]).toBe(0)
    expect(sceneRadius(applyControl(st[3]!, p.steps[3]!, 6))).toBeCloseTo(r[1]! * 2, 6)
  })
})

describe('computeCameras', () => {
  it('本步没写 camera 则沿用上一次的；最初用 scene.camera / 默认值', () => {
    const base = {
      id: 't',
      title: 't',
      problem: 'p',
      scene: { objects: [{ id: 'c', type: 'CubeGrid', size: [1, 1, 1] }] },
      steps: [{ title: 'a' }, { title: 'b', camera: { position: [0, 0, 9] } }, { title: 'c' }, { title: 'd', camera: { position: [9, 0, 0], target: [0, 1, 0] } }],
    }
    const cams = computeCameras(ProblemSchema.parse(base))
    expect(cams[0]).toEqual(DEFAULT_CAMERA)
    expect(cams[1]).toEqual({ position: [0, 0, 9], target: [0, 0, 0], projection: 'perspective' })
    expect(cams[2]).toEqual(cams[1])
    expect(cams[3]).toEqual({ position: [9, 0, 0], target: [0, 1, 0], projection: 'perspective' })
    const withScene = computeCameras(ProblemSchema.parse({ ...base, scene: { ...base.scene, camera: { position: [1, 1, 1] } } }))
    expect(withScene[0]).toEqual({ position: [1, 1, 1], target: [0, 0, 0], projection: 'perspective' })
  })

  it('projection 作为相机规格的一部分一起沿用；写了 camera 但没写 projection 则回到透视', () => {
    const base = {
      id: 't',
      title: 't',
      problem: 'p',
      scene: { objects: [{ id: 'c', type: 'CubeGrid', size: [1, 1, 1] }] },
      steps: [
        { title: 'a' },
        { title: 'b', camera: { position: [0, 0, 9], projection: 'orthographic' } },
        { title: 'c' }, // 沿用 b（含正交）
        { title: 'd', camera: { position: [9, 0, 0], projection: 'orthographic' } },
        { title: 'e', camera: { position: [5, 4, 6] } }, // 重新指定且没写 projection -> 透视
        { title: 'f' }, // 沿用 e（透视）
      ],
    }
    const cams = computeCameras(ProblemSchema.parse(base))
    expect(cams.map((c) => c.projection)).toEqual(['perspective', 'orthographic', 'orthographic', 'orthographic', 'perspective', 'perspective'])
    expect(cams[2]).toEqual(cams[1])
    expect(cams[1]).toEqual({ position: [0, 0, 9], target: [0, 0, 0], projection: 'orthographic' })
    // scene.camera 也可以直接是正交
    const sc = computeCameras(ProblemSchema.parse({ ...base, scene: { ...base.scene, camera: { position: [0, 0, 5], projection: 'orthographic' } } }))
    expect(sc[0]!.projection).toBe('orthographic')
  })
})

describe('相机距离缩放（baseRadius）', () => {
  it('radiusScale：当前半径 / 基准半径；无效值不缩放', () => {
    expect(radiusScale(5, 2.5)).toBe(2)
    expect(radiusScale(2.5, 2.5)).toBe(1)
    expect(radiusScale(0, 2.5)).toBe(1)
    expect(radiusScale(3, 0)).toBe(1)
  })

  it('cube-paint-3：基准半径 = 初始场景半径；第 1 步倍数 1，拆开步 1.5，explore n=6 为 2，拖回 n=3 回到 1', () => {
    const p = ProblemSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../content/problems/cube-paint-3.json'), 'utf8')))
    const st = computeStates(p)
    const base = baseSceneRadius(initialState(p), st)
    expect(base).toBeCloseTo(sceneRadius(initialState(p)), 9)
    expect(radiusScale(sceneRadius(st[0]!), base)).toBeCloseTo(1, 9) // 回跳第 1 步和首次进入一致
    expect(radiusScale(sceneRadius(st[1]!), base)).toBeCloseTo(1.5, 9)
    const last = p.steps.length - 1
    const ex = p.steps[last]!
    expect(ex.type).toBe('explore')
    const s6 = applyControl(st[last]!, ex, 6)
    const s3 = applyControl(s6, ex, 3)
    expect(radiusScale(sceneRadius(s6), base)).toBeGreaterThan(radiusScale(sceneRadius(st[last]!), base))
    expect(sceneRadius(s3)).toBeCloseTo(sceneRadius(st[last]!), 9) // 拖回 3 与首次进入该步一致
  })

  it('baseSceneRadius：初始场景全部隐藏时退而用首个有效步状态；都没有则 1', () => {
    const p = make(
      [{ title: 'a' }, { title: 'b', actions: [{ do: 'show', target: 'cube' }] }],
      [{ id: 'cube', type: 'CubeGrid', size: [3, 3, 3], visible: false }],
    )
    const st = computeStates(p)
    expect(sceneRadius(initialState(p))).toBe(0)
    expect(baseSceneRadius(initialState(p), st)).toBeCloseTo(0.5 * Math.sqrt(27), 6)
    expect(baseSceneRadius(initialState(p), [])).toBe(1)
  })
})

describe('样例题的状态', () => {
  const load = (f: string) => ProblemSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../content/problems', f), 'utf8')))

  it('cube-paint-3：每一步的数量与讲解一致', () => {
    const p = load('cube-paint-3.json')
    const st = computeStates(p)
    expect(st).toHaveLength(p.steps.length)
    const o = (i: number) => cube(st[i]!)
    const hl = (i: number) => o(i).cells.filter((c) => c.highlight !== null)
    expect(cube(st[0]!).gap).toBe(0)
    expect(o(1).gap).toBe(0.5)
    expect(hl(3).map((c) => c.cell.paintedFaces)).toEqual(Array(8).fill(3))
    expect(hl(4).map((c) => c.cell.paintedFaces)).toEqual(Array(12).fill(2))
    expect(hl(5).map((c) => c.cell.paintedFaces)).toEqual(Array(6).fill(1))
    expect(hl(6).map((c) => c.cell.paintedFaces)).toEqual([0])
    for (const [i, k] of [[3, 8], [4, 12], [5, 6], [6, 1]] as const) {
      expect(o(i).cells.filter((c) => c.number !== null).map((c) => c.number).sort((a, b) => a! - b!)).toEqual(Array.from({ length: k }, (_, j) => j + 1))
    }
    // 内部那块可见，其余几乎透明
    expect(count(o(6), (c) => c.opacity === 1)).toBe(1)
    expect(count(o(6), (c) => c.opacity === 0.08)).toBe(26)
    // 验证步：四类颜色
    expect(new Set(o(7).cells.map((c) => c.highlight)).size).toBe(4)
    // explore 步
    const last = p.steps[p.steps.length - 1]!
    expect(last.type).toBe('explore')
    expect(o(8).size).toEqual([3, 3, 3])
    expect(applyControl(st[8]!, last, 4).objects['cube']!.cells).toHaveLength(64)
  })

  it('count-blocks：按层计数 6/3/1，总数 10', () => {
    const p = load('count-blocks.json')
    const st = computeStates(p)
    const o = (i: number) => st[i]!.objects['blocks']!
    expect(o(0).cells).toHaveLength(10)
    const numbered = (i: number) => o(i).cells.filter((c) => c.number !== null)
    expect(numbered(1)).toHaveLength(6)
    expect(numbered(1).every((c) => c.cell.layer === 0)).toBe(true)
    expect(numbered(2)).toHaveLength(3)
    expect(numbered(2).every((c) => c.cell.layer === 1)).toBe(true)
    expect(numbered(3)).toHaveLength(1)
    expect(numbered(3).every((c) => c.cell.layer === 2)).toBe(true)
    // 第 1 层步骤：其余层是淡的
    expect(count(o(2), (c) => c.opacity === 1)).toBe(3)
    // 总数步：没有 number，三种颜色
    expect(numbered(4)).toHaveLength(0)
    expect(new Set(o(4).cells.map((c) => c.highlight)).size).toBe(3)
    // 视图步：标注显示且文字变化
    expect(st[5]!.objects['viewTip']).toMatchObject({ visible: true, text: '从正面看' })
    expect(st[7]!.objects['viewTip']).toMatchObject({ visible: true, text: '从上面看' })
    // 相机：正前 / 正左 / 正上
    const cams = computeCameras(p)
    expect(cams[5]!.position).toEqual([0, 0, 11])
    expect(cams[6]!.position).toEqual([-11, 0, 0])
    expect(cams[7]!.position[0]).toBe(0)
    expect(cams[7]!.position[1]).toBe(11)
    // 三视图必须是正交投影；其余步骤（含回到第 5 步）保持透视
    expect(cams.map((c) => c.projection)).toEqual([...Array(5).fill('perspective'), 'orthographic', 'orthographic', 'orthographic'])
  })

  it('count-blocks：三视图数据（正面 1,3,1；左面 2,3,2；俯视 6 格）与讲解一致', () => {
    const p = load('count-blocks.json')
    const h = (p.scene.objects[0] as { heights: number[][] }).heights
    const cols = h[0]!.map((_, c) => Math.max(...h.map((r) => r[c]!)))
    const rows = h.map((r) => Math.max(...r))
    expect(cols).toEqual([1, 3, 1])
    expect(rows).toEqual([2, 3, 2])
    expect(h.flat().filter((v) => v > 0)).toHaveLength(6)
    expect(h.flat().reduce((a, b) => a + b, 0)).toBe(10)
  })
})
