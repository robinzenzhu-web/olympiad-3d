import { describe, expect, it } from 'vitest'
import { buildGridCells, buildStackCells } from '../src/engine/cells'
import { filterCells, matchCell } from '../src/engine/filter'

const grid = buildGridCells([3, 3, 3], 'surface').cells

describe('filter', () => {
  it('省略 filter = 全部', () => {
    expect(filterCells(grid)).toHaveLength(27)
    expect(filterCells(grid, {})).toHaveLength(27)
  })

  it('单值', () => {
    expect(filterCells(grid, { paintedFaces: 3 })).toHaveLength(8)
    expect(filterCells(grid, { layer: 0 })).toHaveLength(9)
    expect(filterCells(grid, { x: 2 })).toHaveLength(9)
  })

  it('数组 = OR', () => {
    expect(filterCells(grid, { paintedFaces: [1, 2] })).toHaveLength(18)
    expect(filterCells(grid, { region: ['corner', 'inner'] })).toHaveLength(9)
  })

  it('多个键 = AND', () => {
    // 第 0 层里的 edge：底面四条边的中间块，共 4 个
    const r = filterCells(grid, { region: 'edge', layer: 0 })
    expect(r.every((c) => c.region === 'edge' && c.y === 0)).toBe(true)
    expect(r).toHaveLength(4)
    expect(filterCells(grid, { region: 'edge', x: 0 })).toHaveLength(4)
  })

  it('不满足的组合返回空', () => {
    expect(filterCells(grid, { paintedFaces: 0, layer: 0 })).toHaveLength(0)
  })

  it('字符串 region 与 CubeStack（没有 region）', () => {
    const stack = buildStackCells([[2, 1]]).cells
    expect(filterCells(stack, { region: 'corner' })).toHaveLength(0)
    expect(filterCells(stack, { layer: 1 })).toHaveLength(1)
  })

  it('未知键抛错，而不是悄悄匹配全部', () => {
    expect(() => matchCell(grid[0]!, { colour: 1 } as never)).toThrow(/colour/)
  })
})
