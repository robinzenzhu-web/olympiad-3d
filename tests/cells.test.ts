import { describe, expect, it } from 'vitest'
import { buildGridCells, buildStackCells, cellPosition, countBy } from '../src/engine/cells'

describe('CubeGrid cells', () => {
  it('3×3×3 表面涂色：三面/两面/一面/零面 = 8/12/6/1', () => {
    const { cells, dims } = buildGridCells([3, 3, 3], 'surface')
    expect(cells).toHaveLength(27)
    expect(dims).toEqual([3, 3, 3])
    expect(countBy(cells, (c) => c.paintedFaces)).toEqual({ 3: 8, 2: 12, 1: 6, 0: 1 })
    expect(countBy(cells, (c) => c.region)).toEqual({ corner: 8, edge: 12, face: 6, inner: 1 })
  })

  it('4×4×4：8/24/24/8', () => {
    const { cells } = buildGridCells([4, 4, 4], 'surface')
    expect(cells).toHaveLength(64)
    expect(countBy(cells, (c) => c.paintedFaces)).toEqual({ 3: 8, 2: 24, 1: 24, 0: 8 })
  })

  it('5×5×5 符合公式 8 / 12(n-2) / 6(n-2)² / (n-2)³', () => {
    const { cells } = buildGridCells([5, 5, 5], 'surface')
    expect(countBy(cells, (c) => c.paintedFaces)).toEqual({ 3: 8, 2: 36, 1: 54, 0: 27 })
  })

  it('2×2×2：8 块全是三面涂色', () => {
    const { cells } = buildGridCells([2, 2, 2], 'surface')
    expect(cells).toHaveLength(8)
    expect(cells.every((c) => c.paintedFaces === 3 && c.region === 'corner')).toBe(true)
  })

  it('每个 cell 的涂色面朝向数 = paintedFaces，且朝向正确', () => {
    const { cells } = buildGridCells([3, 3, 3], 'surface')
    for (const c of cells) expect(c.paintedSides.filter(Boolean).length).toBe(c.paintedFaces)
    // 顺序：+x -x +y -y +z -z
    const corner = cells.find((c) => c.key === '0,0,0')!
    expect(corner.paintedSides).toEqual([false, true, false, true, false, true])
    const far = cells.find((c) => c.key === '2,2,2')!
    expect(far.paintedSides).toEqual([true, false, true, false, true, false])
    const center = cells.find((c) => c.key === '1,1,1')!
    expect(center.paintedSides.some(Boolean)).toBe(false)
    const faceCenter = cells.find((c) => c.key === '1,1,2')!
    expect(faceCenter.paintedSides).toEqual([false, false, false, false, true, false])
  })

  it('layer = y，坐标从 0 开始', () => {
    const { cells } = buildGridCells([2, 3, 4], 'none')
    expect(cells).toHaveLength(24)
    expect(Math.max(...cells.map((c) => c.layer))).toBe(2)
    expect(cells.every((c) => c.layer === c.y)).toBe(true)
    expect(Math.min(...cells.map((c) => c.x))).toBe(0)
  })

  it('paint=none：没有涂色面，但 region/exposedFaces 仍按几何位置计算', () => {
    const { cells } = buildGridCells([3, 3, 3], 'none')
    expect(cells.every((c) => c.paintedFaces === 0 && !c.paintedSides.some(Boolean))).toBe(true)
    expect(countBy(cells, (c) => c.exposedFaces)).toEqual({ 3: 8, 2: 12, 1: 6, 0: 1 })
    expect(countBy(cells, (c) => c.region)).toEqual({ corner: 8, edge: 12, face: 6, inner: 1 })
  })

  it('退化尺寸按实际计算：1×1×1 六个面都涂色；1×3×3 中间块 2 面、角上块 4 面', () => {
    const one = buildGridCells([1, 1, 1], 'surface').cells[0]!
    expect(one.paintedFaces).toBe(6)
    expect(one.region).toBeUndefined()
    const flat = buildGridCells([1, 3, 3], 'surface').cells
    expect(flat.find((c) => c.key === '0,1,1')!.paintedFaces).toBe(2)
    expect(flat.find((c) => c.key === '0,0,0')!.paintedFaces).toBe(4)
  })

  it('cellPosition 整体居中并随 gap 放大', () => {
    const { cells, dims } = buildGridCells([3, 3, 3], 'none')
    const first = cells.find((c) => c.key === '0,0,0')!
    const mid = cells.find((c) => c.key === '1,1,1')!
    expect(cellPosition(mid, dims, 0)).toEqual([0, 0, 0])
    expect(cellPosition(first, dims, 0)).toEqual([-1, -1, -1])
    expect(cellPosition(first, dims, 0.5)).toEqual([-1.5, -1.5, -1.5])
  })
})

describe('CubeStack cells', () => {
  const heights = [
    [1, 2, 0],
    [1, 3, 1],
    [0, 2, 0],
  ]

  it('总数 = 高度之和；按层计数 6/3/1', () => {
    const { cells, dims } = buildStackCells(heights)
    expect(cells).toHaveLength(10)
    expect(dims).toEqual([3, 3, 3])
    expect(countBy(cells, (c) => c.layer)).toEqual({ 0: 6, 1: 3, 2: 1 })
  })

  it('经典阶梯形 [[3,2,1],[2,1,0],[1,0,0]] 也是 10 块、6/3/1', () => {
    const { cells } = buildStackCells([
      [3, 2, 1],
      [2, 1, 0],
      [1, 0, 0],
    ])
    expect(cells).toHaveLength(10)
    expect(countBy(cells, (c) => c.layer)).toEqual({ 0: 6, 1: 3, 2: 1 })
  })

  it('坐标约定：col → x，row → z', () => {
    const { cells } = buildStackCells(heights)
    const keys = new Set(cells.map((c) => c.key))
    expect(keys.has('1,2,1')).toBe(true) // row1,col1 高 3 → y 最大为 2
    expect(keys.has('1,3,1')).toBe(false)
    expect(keys.has('2,0,0')).toBe(false) // row0,col2 高 0
    expect(keys.has('0,0,1')).toBe(true) // row1,col0 高 1
  })

  it('单块：底面贴地不外露，其余 5 面外露', () => {
    const [c] = buildStackCells([[1]]).cells
    expect(c!.exposedFaces).toBe(5)
    expect(c!.paintedFaces).toBe(5)
    expect(c!.paintedSides).toEqual([true, true, true, false, true, true])
    expect(c!.region).toBeUndefined()
  })

  it('两层塔：下面那块上面被盖住，所以 4 面外露；上面那块 5 面外露', () => {
    const { cells } = buildStackCells([[2]])
    expect(cells.find((c) => c.y === 0)!.exposedFaces).toBe(4)
    expect(cells.find((c) => c.y === 1)!.exposedFaces).toBe(5)
  })

  it('相邻的块互相遮住对方的面', () => {
    const { cells } = buildStackCells([[1, 1]])
    expect(cells.every((c) => c.exposedFaces === 4)).toBe(true)
  })

  it('全部被包住的块 exposedFaces = 0', () => {
    // 3×3 平台，中间再叠两层：最中间一列下层四周都有邻居、上面有块
    const { cells } = buildStackCells([
      [1, 1, 1],
      [1, 3, 1],
      [1, 1, 1],
    ])
    const hidden = cells.find((c) => c.key === '1,0,1')!
    expect(hidden.exposedFaces).toBe(0)
  })
})
